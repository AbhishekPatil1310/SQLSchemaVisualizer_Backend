/**
 * Supported database engines.
 */
export type DatabaseType = 'postgres' | 'mysql';

/**
 * Supported SQL query categories produced by AI generation.
 */
export type QueryType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'JOIN' | 'AGGREGATE';

/**
 * Request payload for natural-language to SQL generation.
 */
export interface GenerateQueryRequest {
  naturalLanguageQuery: string;
  databaseType: DatabaseType;
  limit?: number;
  explainSteps?: boolean;
}

/**
 * Structured SQL generation output from the AI service.
 */
export interface GenerateQueryResponse {
  query: string;
  explanation: string;
  queryType: QueryType;
  confidence: number;
  suggestedIndexes?: string[];
  warnings?: string[];
  executionTips?: string[];
}

/**
 * Request payload for SQL validation.
 */
export interface ValidateQueryRequest {
  query: string;
  databaseType: DatabaseType;
}

/**
 * Validation and optimization result for a SQL query.
 */
export interface ValidateQueryResponse {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedExecutionTime?: string;
  affectedRows?: number;
  indexes?: string[];
  suggestedIndexes?: string[];
}

/**
 * Full schema context consumed by prompt generation and validators.
 */
export interface SchemaContext {
  tables: TableMetadata[];
  relationships: RelationshipMetadata[];
  databaseType: DatabaseType;
  cachedAt: Date;
}

/**
 * Table metadata extracted from information_schema.
 */
export interface TableMetadata {
  tableName: string;
  columns: ColumnMetadata[];
  primaryKey?: string[];
  indexes?: IndexMetadata[];
  rowCount?: number;
}

/**
 * Column-level metadata for schema-aware validation and prompting.
 */
export interface ColumnMetadata {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isUnique?: boolean;
  isForeignKey?: boolean;
  foreignKeyReference?: string;
}

/**
 * Index metadata for optimization hints.
 */
export interface IndexMetadata {
  indexName: string;
  columns: string[];
  isUnique: boolean;
}

/**
 * Relationship metadata inferred from foreign key constraints.
 */
export interface RelationshipMetadata {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  type: 'ONE_TO_MANY' | 'ONE_TO_ONE' | 'MANY_TO_MANY';
}

/**
 * Runtime AI model configuration.
 */
export interface AIModelConfig {
  apiKey: string;
  modelName: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
}

/**
 * In-memory cache configuration.
 */
export interface CacheConfig {
  ttl: number;
  maxSize: number;
}

/**
 * Cache metrics for observability.
 */
export interface CacheStats {
  cachedItems: number;
  hits: number;
  misses: number;
  requests: number;
  hitRate: number;
}

/**
 * Internal helper type for impossible state checks.
 */
export type ImpossibleState = never;

