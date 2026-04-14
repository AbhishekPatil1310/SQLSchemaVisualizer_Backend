import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware.js';
import { addConnection, listConnections, switchConnection, deleteConnection } from './workspace.controller.js';
const router = Router();
router.post('/add', authenticate, addConnection);
router.get('/list', authenticate, listConnections);
router.post('/switch', authenticate, switchConnection);
router.delete('/delete/:connectionId', authenticate, deleteConnection);
export default router;
//# sourceMappingURL=workspace.routes.js.map