import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),
  PORT:         z.string().default('3005').transform(Number),
  SERVICE_NAME: z.string().default('ai-agent-service'),

  MONGODB_URI:  z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL:    z.string().default('redis://localhost:6379'),
  RABBITMQ_URL: z.string().default('amqp://localhost:5672'),

  JWT_ACCESS_SECRET:       z.string().default('dev-secret-at-least-32-chars-long-for-safety-locally'),
  INCIDENT_SERVICE_URL:    z.string().default('http://localhost:3002'),
  INTERNAL_SERVICE_SECRET: z.string().default('dev-secret'),

  WHISPER_API_URL: z.string().default('http://localhost:9000'),
  GROQ_API_KEY:    z.string().optional(),

  AUTO_SUBMIT_CONFIDENCE_THRESHOLD: z.string().default('0.85').transform(Number),
  MIN_EXTRACTION_CONFIDENCE:        z.string().default('0.40').transform(Number),

  MAX_AUDIO_FILE_SIZE_MB: z.string().default('25').transform(Number),
  AUDIO_UPLOAD_PATH:      z.string().default('./uploads/audio'),

  ALLOWED_ORIGINS:         z.string().default('https://e-rdcp.vercel.app,http://localhost:3000,http://localhost:3100'),
  RATE_LIMIT_WINDOW_MS:    z.string().default('60000').transform(Number), // 1 minute
  RATE_LIMIT_MAX_REQUESTS: z.string().default('1000').transform(Number),

  NOMINATIM_URL:        z.string().default('https://nominatim.openstreetmap.org'),
  NOMINATIM_USER_AGENT: z.string().default('EmergencyResponsePlatform/1.0'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌  Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
