import express from 'express';
import cors from 'cors'; // Import cors
import { env } from './config/env.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import workspaceRoutes from './modules/workspace/workspace.routes.js';
import queryRoutes from './modules/query/query.routes.js';
import helmet from 'helmet'; // Recommended for production security

const app = express();

// 1. Security Headers (Optional but recommended)
app.use(helmet());

// 2. CORS Configuration
app.use(cors({
  // In production, this should be your frontend URL (e.g., http://localhost:5173 or https://your-app.com)
  origin: env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://sql-schema-visualizer-frontend-28ta.vercel.appa',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true // Required if you decide to use HttpOnly cookies later
}));

app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/query', queryRoutes);

// Error middleware MUST be the last one added
app.use(errorMiddleware);

app.listen(env.PORT, () => {
  console.log(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
});