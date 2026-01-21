import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { runUserQuery, getSchema } from './query.controller.js';

const router = Router();

// Endpoint: POST /api/query/execute
// Purpose: Runs raw SQL provided by the user
router.post('/execute', authenticate, runUserQuery);

// Endpoint: GET /api/query/schema
// Purpose: Fetches table metadata and relationships for the Visualizer
router.get('/schema', authenticate, getSchema);

export default router;