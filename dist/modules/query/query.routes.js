import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { runUserQuery, getSchema } from './query.controller.js';
const router = Router();
router.post('/execute', authenticate, runUserQuery);
router.get('/schema', authenticate, getSchema);
export default router;
//# sourceMappingURL=query.routes.js.map