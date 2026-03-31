import express, { Application } from 'express';
import cors         from 'cors';
import helmet       from 'helmet';
import morgan       from 'morgan';
import swaggerUi    from 'swagger-ui-express';
import YAML         from 'yamljs';
import path         from 'path';

import { env }                           from './config/env';
import logger                            from './config/logger';
import analyticsRoutes                   from './routes/analytics.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { generalLimiter }                from './middleware/rateLimit.middleware';

const app: Application = express();

// ─── Trust Proxy ─────────────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // If no origin (internal or server-to-server), allow it
    if (!origin) return callback(null, true);
    
    // Ensure we have a list of origins (trimmed and lowercase for safety)
    const allowed = env.ALLOWED_ORIGINS.split(',')
      .map(o => o.trim().toLowerCase().replace(/\/$/, ''));
    
    const cleanOrigin = origin.trim().toLowerCase().replace(/\/$/, '');
    
    // Check for exact match, wildcard, or vercel subdomains
    const isAllowed = allowed.includes(cleanOrigin) || 
                     allowed.includes('*') ||
                     (cleanOrigin.endsWith('.vercel.app'));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS REJECTED] Analytics Service - Origin: "${origin}" mismatched. Allowed: ${allowed.join(', ')}`);
      callback(null, false);
    }
  },
  methods:        ['GET', 'OPTIONS'],
  allowedHeaders: ['*'], // Be permissive with headers
  credentials:    true,
  maxAge:         86400,
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));

// ─── HTTP Logging ─────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
app.use(generalLimiter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:    'healthy',
    service:   env.SERVICE_NAME,
    version:   '1.0.0',
    uptime:    process.uptime(),
    timestamp: new Date().toISOString(),
    RATE_LIMIT_WINDOW_MS:    env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: env.RATE_LIMIT_MAX_REQUESTS,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/analytics', analyticsRoutes);

// ─── Swagger Docs ─────────────────────────────────────────────────────────────
const swaggerDocument = YAML.load(path.join(__dirname, 'config/swagger.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Analytics Service API Docs',
  customCss: '.swagger-ui .topbar { background-color: #991B1B; }',
}));

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
