import express, { Application } from 'express';
import { createServer }          from 'http';
import cors                      from 'cors';
import helmet                    from 'helmet';
import morgan                    from 'morgan';
import swaggerUi                 from 'swagger-ui-express';
import YAML                      from 'yamljs';
import path                      from 'path';

import { env }                                    from './config/env';
import logger                                     from './config/logger';
import dispatchRoutes                             from './routes/dispatch.routes';
import { errorHandler, notFoundHandler }          from './middleware/error.middleware';
import { generalLimiter }                         from './middleware/rateLimit.middleware';
import { createSocketServer }                     from './services/socket.service';

const app: Application = express();
const httpServer       = createServer(app);

// ─── Proxy ────────────────────────────────────────────────────────────────────
// Necessary for rate limiting behind API Gateway
app.set('trust proxy', 1);

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:         env.ALLOWED_ORIGINS.split(','),
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:    true,
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

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
  });
});

// ─── Internal Route (incident-service → dispatch-service) ────────────────────
// Triggers return-to-base for the vehicle identified by its incidentServiceId
import { Vehicle } from './models/vehicle.model';
import { startReturnSimulation } from './services/simulation.service';

app.post('/internal/vehicles/return-by-responder/:responderId', async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== env.INTERNAL_SERVICE_SECRET) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }
  try {
    const vehicle = await Vehicle.findOne({ incidentServiceId: req.params.responderId });
    if (!vehicle) {
      res.status(404).json({ success: false, message: 'Vehicle not found' });
      return;
    }
    if (vehicle.status === 'ON_SCENE' || vehicle.status === 'DISPATCHED' || vehicle.status === 'EN_ROUTE') {
      await startReturnSimulation(vehicle._id.toString());
    }
    res.json({ success: true, message: 'Return-to-base triggered', vehicleId: vehicle._id.toString() });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/', dispatchRoutes);

// ─── Swagger Docs ─────────────────────────────────────────────────────────────
const swaggerDocument = YAML.load(path.join(__dirname, 'config/swagger.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customSiteTitle: 'Dispatch Tracking API Docs',
  customCss: '.swagger-ui .topbar { background-color: #991B1B; }',
}));

// ─── 404 & Error Handlers ─────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Attach Socket.io ─────────────────────────────────────────────────────────
// Must be called after all Express middleware is set up
createSocketServer(httpServer);

export { httpServer };
export default app;
