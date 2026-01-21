import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),
  METADATA_DB_URL: z.string().url("METADATA_DB_URL must be a valid connection string"),
});

// Parse and export
const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid Environment Variables:', _env.error.format());
  process.exit(1); // Stop the server if config is wrong
}

export const env = _env.data;