import express, { Application } from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import morgan  from 'morgan';

import { env }                         from './config/env';
import logger                          from './config/logger';
import routes                          from './routes/index';
import { correlationId }               from './middleware/auth.middleware';
import { generalLimiter }              from './middleware/rateLimit.middleware';
import { errorHandler, notFoundHandler }from './middleware/error.middleware';

const app: Application = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Don't need CSP for a JSON API typically
}));
app.use(cors({
  origin: (origin, callback) => {
    // Debug info for Render logs
    console.log(`[CORS DEBUG] Incoming Origin: "${origin}" | Allowed: "${env.ALLOWED_ORIGINS}"`);

    if (!origin) return callback(null, true);
    
    const allowed = env.ALLOWED_ORIGINS.split(',')
      .map(o => o.trim().toLowerCase().replace(/\/$/, ''));
    
    const cleanOrigin = origin.trim().toLowerCase().replace(/\/$/, '');
    
    const isAllowed = allowed.includes(cleanOrigin) || 
                     allowed.includes('*') ||
                     (cleanOrigin.endsWith('.vercel.app')); // Be very permissive for vercel for now
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS REJECTED] Origin: "${origin}" mismatched. Allowed: ${allowed.join(', ')}`);
      callback(null, false);
    }
  },
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['*'], // Be extremely permissive with headers for now
  exposedHeaders: ['X-Correlation-ID', 'X-Cache', 'X-Served-By'],
  credentials:    true,
  maxAge:         86400,
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// Large limit for audio file forwarding through the gateway
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Correlation ID ───────────────────────────────────────────────────────────
app.use(correlationId);

// ─── HTTP Logging ─────────────────────────────────────────────────────────────
app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
  stream: { write: (msg) => logger.http(msg.trim()) },
}));

// ─── Rate Limiting ─────────────────────────────────────────────────────────────
app.use(generalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', routes);

// ─── 404 & Error ──────────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
