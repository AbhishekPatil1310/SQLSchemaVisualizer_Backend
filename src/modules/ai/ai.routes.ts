import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { generateQuery, getSchemaSummary, getStats, validateQuery } from './ai.controller.js';

const router = Router();

/**
 * POST /api/ai/generate-query
 * Generate SQL query from natural language.
 */
router.post('/generate-query', authenticate, generateQuery);

/**
 * POST /api/ai/validate-query
 * Validate and optimize SQL query safety/performance.
 */
router.post('/validate-query', authenticate, validateQuery);

/**
 * GET /api/ai/schema-summary
 * Produce AI summary of current database schema.
 */
router.get('/schema-summary', authenticate, getSchemaSummary);

/**
 * GET /api/ai/stats
 * Return AI cache and monitoring metrics.
 */
router.get('/stats', authenticate, getStats);

export default router;

