import NodeCache from 'node-cache';
import { env } from '../../config/env.js';
import { PromptBuilder } from './prompt-builder.js';
import { QueryValidator } from './query-validator.js';
import type {
  CacheStats,
  DatabaseType,
  GenerateQueryRequest,
  GenerateQueryResponse,
  QueryType,
  SchemaContext,
  ValidateQueryRequest,
  ValidateQueryResponse
} from './types/ai.types.js';

interface ValidationSuggestions {
  estimatedExecutionTime?: string;
  affectedRows?: number;
  indexes?: string[];
}

interface AIServiceCacheStats extends CacheStats {
  avgGenerationMs: number;
}

type GenerativeModelLike = {
  generateContent: (request: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    generationConfig: {
      maxOutputTokens: number;
      temperature: number;
      topP?: number;
      topK?: number;
    };
  }) => Promise<{
    response: {
      text: () => string;
    };
  }>;
};

interface GroqChatChoice {
  message?: {
    content?: string | null;
  };
}

interface GroqChatCompletionResponse {
  choices?: GroqChatChoice[];
}

class GroqModel implements GenerativeModelLike {
  constructor(
    private readonly apiKey: string,
    private readonly modelName: string
  ) {}

  async generateContent(request: {
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    generationConfig: {
      maxOutputTokens: number;
      temperature: number;
      topP?: number;
      topK?: number;
    };
  }): Promise<{ response: { text: () => string } }> {
    const userText = request.contents
      .flatMap((content) => content.parts.map((part) => part.text))
      .join('\n')
      .trim();

    const payload = {
      model: this.modelName,
      messages: [
        {
          role: 'system',
          content: 'You are a SQL assistant. Follow user prompt instructions exactly and return JSON where asked.'
        },
        {
          role: 'user',
          content: userText
        }
      ],
      temperature: request.generationConfig.temperature,
      max_tokens: request.generationConfig.maxOutputTokens,
      top_p: request.generationConfig.topP ?? 1
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Groq API ${response.status}: ${body}`);
    }

    const parsed = (await response.json()) as GroqChatCompletionResponse;
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Groq response missing choices[0].message.content');
    }

    return {
      response: {
        text: () => content
      }
    };
  }
}

export class AIServiceError extends Error {
  constructor(
    message: string,
    readonly code: 'AI_REQUEST_FAILED' | 'AI_RESPONSE_INVALID' | 'AI_CONFIGURATION_ERROR',
    readonly details?: string
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

interface AIServiceDependencies {
  model?: GenerativeModelLike;
  promptBuilder?: PromptBuilder;
  queryValidator?: QueryValidator;
}

export class AIService {
  private readonly MODEL_NAME = env.GROQ_MODEL;
  private readonly MAX_TOKENS = 2000;
  private readonly TEMPERATURE = 0.3;
  private readonly TOP_P = 0.95;
  private readonly TOP_K = 40;

  private readonly queryCache: NodeCache;
  private readonly schemaSummaryCache: NodeCache;

  private readonly promptBuilder: PromptBuilder;
  private readonly queryValidator: QueryValidator;
  private readonly model: GenerativeModelLike;

  private hits = 0;
  private misses = 0;
  private requests = 0;
  private totalGenerationMs = 0;

  constructor(dependencies?: AIServiceDependencies) {
    this.promptBuilder = dependencies?.promptBuilder ?? new PromptBuilder();
    this.queryValidator = dependencies?.queryValidator ?? new QueryValidator();

    if (dependencies?.model) {
      this.model = dependencies.model;
    } else {
      if (!env.GROQ_API_KEY) {
        throw new AIServiceError('Missing Groq API key', 'AI_CONFIGURATION_ERROR');
      }
      this.model = new GroqModel(env.GROQ_API_KEY, this.MODEL_NAME);
    }

    this.queryCache = new NodeCache({ stdTTL: env.AI_CACHE_TTL, checkperiod: 300, maxKeys: env.AI_MAX_CACHE_SIZE });
    this.schemaSummaryCache = new NodeCache({ stdTTL: 7200, checkperiod: 300, maxKeys: env.AI_MAX_CACHE_SIZE });
  }

  /**
   * Generate SQL query from natural-language input, with cache and validation.
   */
  async generateQuery(
    userId: string,
    request: GenerateQueryRequest,
    schemaContext: SchemaContext
  ): Promise<GenerateQueryResponse> {
    if (!schemaContext.tables.length) {
      throw new AIServiceError('Schema context is empty', 'AI_REQUEST_FAILED', 'No tables available for query generation');
    }

    const startedAt = Date.now();
    this.requests += 1;

    const cacheKey = this.getCacheKey('query', userId, `${request.databaseType}:${request.naturalLanguageQuery}`);
    const cached = this.queryCache.get<GenerateQueryResponse>(cacheKey);
    if (cached) {
      this.hits += 1;
      this.log(userId, 'generateQuery', 'SUCCESS', Date.now() - startedAt, 'Cache:HIT');
      return cached;
    }

    this.misses += 1;

    try {
      const prompt = this.promptBuilder.buildQueryGenerationPrompt(
        request.naturalLanguageQuery,
        schemaContext,
        request.databaseType
      );

      this.log(userId, 'generateQuery', 'CALL_GROQ', Date.now() - startedAt, 'Cache:MISS');
      const response = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: this.MAX_TOKENS,
          temperature: this.TEMPERATURE,
          topP: this.TOP_P,
          topK: this.TOP_K
        }
      });

      const parsed = this.parseGenerationResponse(response.response.text());
      const validation = await this.queryValidator.validateQuery(parsed.query, request.databaseType, schemaContext);

      const result: GenerateQueryResponse = {
        ...parsed,
        warnings: validation.warnings,
        suggestedIndexes: validation.suggestedIndexes
      };

      this.queryCache.set(cacheKey, result);
      const duration = Date.now() - startedAt;
      this.totalGenerationMs += duration;
      this.log(userId, 'generateQuery', 'SUCCESS', duration, `Warnings:${result.warnings?.length ?? 0}`);
      return result;
    } catch (error) {
      const duration = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'Unknown AI error';
      this.log(userId, 'generateQuery', 'ERROR', duration, message);
      if (error instanceof AIServiceError) {
        throw error;
      }
      throw new AIServiceError('Failed to generate query', 'AI_REQUEST_FAILED', message);
    }
  }

  /**
   * Validate query and enrich output with LLM optimization hints.
   */
  async validateQuery(
    userId: string,
    request: ValidateQueryRequest,
    schemaContext: SchemaContext
  ): Promise<ValidateQueryResponse> {
    const startedAt = Date.now();
    this.requests += 1;

    try {
      const baseValidation = await this.queryValidator.validateQuery(request.query, request.databaseType, schemaContext);
      const prompt = this.promptBuilder.buildValidationPrompt(request.query, request.databaseType, schemaContext);

      this.log(userId, 'validateQuery', 'CALL_GROQ', Date.now() - startedAt, 'Optimization');
      const response = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: this.TEMPERATURE,
          topP: this.TOP_P,
          topK: this.TOP_K
        }
      });

      const suggestions = this.parseValidationResponse(response.response.text());
      const merged: ValidateQueryResponse = {
        ...baseValidation,
        ...suggestions,
        indexes: [...(baseValidation.indexes ?? []), ...(suggestions.indexes ?? [])]
      };

      this.log(userId, 'validateQuery', 'SUCCESS', Date.now() - startedAt, `Warnings:${merged.warnings.length}`);
      return merged;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown validation error';
      this.log(userId, 'validateQuery', 'ERROR', Date.now() - startedAt, message);
      throw new AIServiceError('Query validation failed', 'AI_REQUEST_FAILED', message);
    }
  }

  /**
   * Build AI schema summary with dedicated 2-hour cache.
   */
  async getSchemaSummary(userId: string, schemaContext: SchemaContext): Promise<string> {
    const startedAt = Date.now();
    this.requests += 1;
    const cacheKey = this.getCacheKey('schema-summary', userId, JSON.stringify(schemaContext));
    const cached = this.schemaSummaryCache.get<string>(cacheKey);
    if (cached) {
      this.hits += 1;
      this.log(userId, 'getSchemaSummary', 'SUCCESS', Date.now() - startedAt, 'Cache:HIT');
      return cached;
    }

    this.misses += 1;
    try {
      const prompt = this.promptBuilder.buildSchemaSummaryPrompt(schemaContext);
      this.log(userId, 'getSchemaSummary', 'CALL_GROQ', Date.now() - startedAt, 'Cache:MISS');

      const response = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1000,
          temperature: 0.2,
          topP: this.TOP_P,
          topK: this.TOP_K
        }
      });

      const summary = response.response.text().trim();
      this.schemaSummaryCache.set(cacheKey, summary);
      this.log(userId, 'getSchemaSummary', 'SUCCESS', Date.now() - startedAt, `Chars:${summary.length}`);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown summary error';
      this.log(userId, 'getSchemaSummary', 'ERROR', Date.now() - startedAt, message);
      throw new AIServiceError('Failed to generate schema summary', 'AI_REQUEST_FAILED', message);
    }
  }

  /**
   * Remove all cached query + summary entries for a user.
   */
  clearUserCache(userId: string): void {
    this.clearCacheByPrefix(this.queryCache, `query:${userId}:`);
    this.clearCacheByPrefix(this.schemaSummaryCache, `schema-summary:${userId}:`);
  }

  /**
   * Return service cache and latency metrics.
   */
  getCacheStats(): AIServiceCacheStats {
    const cachedItems = this.queryCache.keys().length + this.schemaSummaryCache.keys().length;
    const hitRate = this.requests === 0 ? 0 : this.hits / this.requests;
    const avgGenerationMs = this.requests === 0 ? 0 : this.totalGenerationMs / this.requests;
    return {
      cachedItems,
      hits: this.hits,
      misses: this.misses,
      requests: this.requests,
      hitRate: Number(hitRate.toFixed(4)),
      avgGenerationMs: Number(avgGenerationMs.toFixed(2))
    };
  }

  private parseGenerationResponse(text: string): Omit<GenerateQueryResponse, 'warnings' | 'suggestedIndexes'> {
    const parsed = this.parseJsonPayload(text);
    const queryType = this.parseQueryType(parsed.queryType);

    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : 'No explanation provided',
      queryType,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      executionTips: Array.isArray(parsed.executionTips) ? parsed.executionTips.filter((tip): tip is string => typeof tip === 'string') : []
    };
  }

  private parseValidationResponse(text: string): ValidationSuggestions {
    try {
      const parsed = this.parseJsonPayload(text);
      return {
        estimatedExecutionTime: typeof parsed.estimatedExecutionTime === 'string' ? parsed.estimatedExecutionTime : undefined,
        affectedRows: typeof parsed.affectedRows === 'number' ? parsed.affectedRows : undefined,
        indexes: Array.isArray(parsed.indexes) ? parsed.indexes.filter((item): item is string => typeof item === 'string') : []
      };
    } catch {
      return { indexes: [] };
    }
  }

  private parseJsonPayload(text: string): Record<string, unknown> {
    const blockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i) || text.match(/```\s*([\s\S]*?)\s*```/i);
    const jsonText = (blockMatch?.[1] ?? text).trim();

    try {
      const parsed = JSON.parse(jsonText) as Record<string, unknown>;
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON from Gemini';
      throw new AIServiceError('AI response was not valid JSON', 'AI_RESPONSE_INVALID', message);
    }
  }

  private parseQueryType(value: unknown): QueryType {
    const normalized = typeof value === 'string' ? value.toUpperCase() : 'SELECT';
    switch (normalized) {
      case 'SELECT':
      case 'INSERT':
      case 'UPDATE':
      case 'DELETE':
      case 'JOIN':
      case 'AGGREGATE':
        return normalized;
      default:
        return 'SELECT';
    }
  }

  private getCacheKey(type: 'query' | 'schema-summary', userId: string, raw: string): string {
    const digest = Buffer.from(raw).toString('base64').slice(0, 96);
    return `${type}:${userId}:${digest}`;
  }

  private clearCacheByPrefix(cache: NodeCache, prefix: string): void {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.del(key);
      }
    }
  }

  private log(userId: string, operation: string, status: string, durationMs: number, details: string): void {
    console.log(
      `[${new Date().toISOString()}] [AI-SERVICE] [USER-${userId}] [${operation}] [${status}] ${durationMs}ms ${details}`
    );
  }
}

export const aiService = new AIService();
