import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import workspaceRoutes from './modules/workspace/workspace.routes.js';
import queryRoutes from './modules/query/query.routes.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import aiRoutes from './modules/ai/ai.routes.js';
const app = express();
app.use(helmet());
app.use(cors({
    origin: env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://sql-schema-visualizer-frontend-28ta.vercel.app',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());
const aiLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        error: 'Too many requests',
        details: 'AI request rate limit exceeded. Please try again later.'
    }
});
app.use('/api/auth', authRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use(errorMiddleware);
app.listen(env.PORT, () => {
    console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
});
//# sourceMappingURL=server.js.map