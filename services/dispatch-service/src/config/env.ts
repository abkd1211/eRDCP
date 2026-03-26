import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  PORT:         z.string().default('3003').transform(Number),
  SERVICE_NAME: z.string().default('dispatch-service'),

  MONGODB_URI:  z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL:    z.string().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),

  JWT_ACCESS_SECRET: z.string().min(32),

  ALLOWED_ORIGINS:         z.string().default('http://localhost:3000,http://localhost:3100'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('900000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('200').transform(Number),

  HEARTBEAT_TIMEOUT_SEC:     z.string().default('120').transform(Number),
  MAX_ROUTE_DEVIATION_METRES:z.string().default('500').transform(Number),

  // Optional — used by simulation service for road-following routes
  // Falls back to straight-line interpolation if not set
  MAPBOX_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
