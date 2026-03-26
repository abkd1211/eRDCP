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
app.use(helmet());
app.use(cors({
  origin:         env.ALLOWED_ORIGINS.split(','),
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id', 'x-internal-secret'],
  exposedHeaders: ['X-Correlation-ID', 'X-Cache', 'X-Served-By'],
  credentials:    true,
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
