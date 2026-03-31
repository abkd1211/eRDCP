import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  PORT:         z.string().default('3004').transform(Number),
  SERVICE_NAME: z.string().default('analytics-service'),

  MONGODB_URI:  z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL:    z.string().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),

  JWT_ACCESS_SECRET: z.string().min(32),

  ALLOWED_ORIGINS:         z.string().default('https://e-rdcp.vercel.app,http://localhost:3000,http://localhost:3100'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('60000').transform(Number), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number),

  SLA_TARGET_SEC:      z.string().default('480').transform(Number),
  DASHBOARD_CACHE_TTL: z.string().default('60').transform(Number),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
