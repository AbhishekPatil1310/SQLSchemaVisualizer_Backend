import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { addConnection, listConnections, switchConnection } from './workspace.controller.js';
const router = Router();
router.post('/add', authenticate, addConnection);
router.get('/list', authenticate, listConnections);
router.post('/switch', authenticate, switchConnection);
export default router;
//# sourceMappingURL=workspace.routes.js.map