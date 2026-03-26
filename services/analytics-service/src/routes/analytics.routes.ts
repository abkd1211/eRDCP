import { Router } from 'express';
import analyticsController from '../controllers/analytics.controller';
import { authenticate, authorise } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { periodQuerySchema, topRespondersSchema } from '../validators/analytics.validators';

const router = Router();

// All analytics routes require authentication
router.use(authenticate);

// ─── Dashboard — combined snapshot for frontend ───────────────────────────────
router.get(
  '/dashboard',
  analyticsController.getDashboard
);

// ─── Core spec endpoints ──────────────────────────────────────────────────────
router.get(
  '/response-times',
  validate(periodQuerySchema),
  analyticsController.getResponseTimes
);

router.get(
  '/incidents-by-region',
  validate(periodQuerySchema),
  analyticsController.getIncidentsByRegion
);

router.get(
  '/resource-utilization',
  analyticsController.getResourceUtilization
);

// ─── Extra feature endpoints ──────────────────────────────────────────────────
router.get(
  '/peak-hours',
  validate(periodQuerySchema),
  analyticsController.getPeakHours
);

router.get(
  '/top-responders',
  validate(topRespondersSchema),
  analyticsController.getTopResponders
);

router.get(
  '/sla',
  validate(periodQuerySchema),
  analyticsController.getSlaReport
);

router.get(
  '/heatmap',
  validate(periodQuerySchema),
  analyticsController.getHeatmap
);

export default router;
