import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  METADATA_DB_URL: z.string().url("METADATA_DB_URL must be a valid connection string"),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
  AI_CACHE_TTL: z.coerce.number().default(3600),
  AI_MAX_CACHE_SIZE: z.coerce.number().default(500),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
});

// Parse and export
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid Environment Variables:', _env.error.format());
  process.exit(1); // Stop the server if config is wrong
}

export const env = _env.data;
