import { z } from 'zod';
import { getActiveConnectionForUser } from '../workspace/workspace.service.js';
import { aiService } from './ai.service.js';
import { schemaAnalyzer } from './schema-analyzer.js';
const GenerateQuerySchema = z.object({
    query: z.string().min(5, 'Query must be at least 5 characters'),
    databaseType: z.enum(['postgres', 'mysql']).default('postgres'),
    limit: z.number().int().positive().optional(),
    explainSteps: z.boolean().default(true)
});
const ValidateQuerySchema = z.object({
    query: z.string().min(1, 'Query cannot be empty'),
    databaseType: z.enum(['postgres', 'mysql']).default('postgres')
});
function logControllerError(userId, operation, error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${new Date().toISOString()}] [AI-CONTROLLER] [USER-${userId ?? 'unknown'}] [${operation}] ${message}`);
}
function getUserId(req) {
    return req.user?.userId ?? null;
}
function getErrorMessage(error, fallback) {
    if (error instanceof Error)
        return error.message;
    return fallback;
}
function isBadRequestError(error) {
    if (!(error instanceof Error))
        return false;
    const message = error.message.toLowerCase();
    return message.includes('no active database connection') || message.includes('invalid') || message.includes('empty');
}
export const generateQuery = async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized', details: 'No valid user session' });
    }
    const validation = GenerateQuerySchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request',
            details: validation.error.issues.map((issue) => issue.message).join(', ')
        });
    }
    try {
        const { query, databaseType, limit, explainSteps } = validation.data;
        const encryptedUrl = await getActiveConnectionForUser(userId);
        const schemaContext = await schemaAnalyzer.getSchemaContext(userId, encryptedUrl, databaseType);
        if (!schemaContext.tables.length) {
            return res.status(400).json({
                success: false,
                error: 'Invalid schema context',
                details: 'No database tables were discovered for the active connection'
            });
        }
        const payload = {
            naturalLanguageQuery: query,
            databaseType: databaseType,
            limit,
            explainSteps
        };
        const data = await aiService.generateQuery(userId, payload, schemaContext);
        return res.json({
            success: true,
            data,
            schemaInfo: {
                tablesCount: schemaContext.tables.length,
                relationshipsCount: schemaContext.relationships.length
            }
        });
    }
    catch (error) {
        logControllerError(userId, 'generateQuery', error);
        if (isBadRequestError(error)) {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                details: 'Unable to process query generation request with current input/connection'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Query generation failed',
            details: 'Internal server error'
        });
    }
};
export const validateQuery = async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized', details: 'No valid user session' });
    }
    const validation = ValidateQuerySchema.safeParse(req.body);
    if (!validation.success) {
        return res.status(400).json({
            success: false,
            error: 'Invalid request',
            details: validation.error.issues.map((issue) => issue.message).join(', ')
        });
    }
    try {
        const { query, databaseType } = validation.data;
        const encryptedUrl = await getActiveConnectionForUser(userId);
        const schemaContext = await schemaAnalyzer.getSchemaContext(userId, encryptedUrl, databaseType);
        const payload = { query, databaseType: databaseType };
        const data = await aiService.validateQuery(userId, payload, schemaContext);
        return res.json({ success: true, data });
    }
    catch (error) {
        logControllerError(userId, 'validateQuery', error);
        if (isBadRequestError(error)) {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                details: 'Unable to validate query with current input/connection'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Validation failed',
            details: 'Internal server error'
        });
    }
};
export const getSchemaSummary = async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized', details: 'No valid user session' });
    }
    const databaseType = (req.query.databaseType === 'mysql' ? 'mysql' : 'postgres');
    try {
        const encryptedUrl = await getActiveConnectionForUser(userId);
        const schemaContext = await schemaAnalyzer.getSchemaContext(userId, encryptedUrl, databaseType);
        const summary = await aiService.getSchemaSummary(userId, schemaContext);
        return res.json({
            success: true,
            data: {
                summary,
                tablesCount: schemaContext.tables.length,
                relationshipsCount: schemaContext.relationships.length
            }
        });
    }
    catch (error) {
        logControllerError(userId, 'getSchemaSummary', error);
        if (isBadRequestError(error)) {
            return res.status(400).json({
                success: false,
                error: 'Bad request',
                details: 'Unable to build schema summary for current connection'
            });
        }
        return res.status(500).json({
            success: false,
            error: 'Schema summary failed',
            details: 'Internal server error'
        });
    }
};
export const getStats = async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized', details: 'No valid user session' });
    }
    try {
        return res.json({
            success: true,
            data: {
                aiService: aiService.getCacheStats(),
                schemaAnalyzer: schemaAnalyzer.getCacheStats()
            }
        });
    }
    catch (error) {
        logControllerError(userId, 'getStats', error);
        return res.status(500).json({
            success: false,
            error: 'Stats unavailable',
            details: 'Unable to fetch AI statistics'
        });
    }
};
//# sourceMappingURL=ai.controller.js.map