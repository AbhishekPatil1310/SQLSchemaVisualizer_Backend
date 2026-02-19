import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { generateQuery, getSchemaSummary, getStats, validateQuery } from './ai.controller.js';
const router = Router();
router.post('/generate-query', authenticate, generateQuery);
router.post('/validate-query', authenticate, validateQuery);
router.get('/schema-summary', authenticate, getSchemaSummary);
router.get('/stats', authenticate, getStats);
export default router;
//# sourceMappingURL=ai.routes.js.map