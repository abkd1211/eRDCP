import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  PORT:         z.string().default('3000').transform(Number),
  SERVICE_NAME: z.string().default('api-gateway'),

  REDIS_URL:    z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET:       z.string().min(32),
  INTERNAL_SERVICE_SECRET: z.string().min(1),

  AUTH_SERVICE_URL:      z.string().default('http://localhost:3001'),
  INCIDENT_SERVICE_URL:  z.string().default('http://localhost:3002'),
  DISPATCH_SERVICE_URL:  z.string().default('http://localhost:3003'),
  ANALYTICS_SERVICE_URL: z.string().default('http://localhost:3004'),
  AI_AGENT_SERVICE_URL:  z.string().default('http://localhost:3005'),

  ALLOWED_ORIGINS:         z.string().default('https://e-rdcp.vercel.app,http://localhost:3100'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('60000').transform(Number), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number), // 1000 requests/min
  AUTH_RATE_LIMIT_MAX:     z.string().default('100').transform(Number),  // 100 auth attempts/min

  CIRCUIT_BREAKER_THRESHOLD: z.string().default('5').transform(Number),
  CIRCUIT_BREAKER_RESET_SEC: z.string().default('30').transform(Number),

  RESPONSE_CACHE_TTL: z.string().default('30').transform(Number),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// ─── Service registry ─────────────────────────────────────────────────────────
export const SERVICES = {
  auth:      { name: 'auth-service',      url: env.AUTH_SERVICE_URL },
  incident:  { name: 'incident-service',  url: env.INCIDENT_SERVICE_URL },
  dispatch:  { name: 'dispatch-service',  url: env.DISPATCH_SERVICE_URL },
  analytics: { name: 'analytics-service', url: env.ANALYTICS_SERVICE_URL },
  agent:     { name: 'ai-agent-service',  url: env.AI_AGENT_SERVICE_URL },
} as const;

export type ServiceKey = keyof typeof SERVICES;
