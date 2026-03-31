import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV:    z.enum(['development', 'production', 'test']).default('development'),
  PORT:        z.string().default('3002').transform(Number),
  SERVICE_NAME:z.string().default('incident-service'),

  DATABASE_URL:z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL:   z.string().default('redis://localhost:6379'),
  RABBITMQ_URL:z.string().default('amqp://localhost:5672'),

  JWT_ACCESS_SECRET:       z.string().min(32).default('erdcp-jwt-access-secret-2026-fallback-at-least-32-chars'),
  INTERNAL_SERVICE_SECRET: z.string().min(1).default('erdcp-internal-secret-2026'),
  AUTH_SERVICE_URL:        z.string().default('http://localhost:3001'),

  RATE_LIMIT_WINDOW_MS:    z.string().default('60000').transform(Number), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number),

  ALLOWED_ORIGINS:         z.string().default('https://e-rdcp.vercel.app,http://localhost:3000,http://localhost:3100'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
