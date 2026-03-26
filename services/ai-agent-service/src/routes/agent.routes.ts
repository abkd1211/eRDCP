import { Router } from 'express';
import agentController from '../controllers/agent.controller';
import { authenticate, authorise, validate } from '../middleware/index';
import { audioUpload } from '../middleware/upload.middleware';
import {
  ingestCallSchema,
  reviewSessionSchema,
  listSessionsSchema,
} from '../validators/agent.validators';

const router = Router();

// ─── All routes require authentication ───────────────────────────────────────
router.use(authenticate);

// ─── Operator Presence ───────────────────────────────────────────────────────
router.post('/operator/online',     agentController.markOperatorOnline);
router.post('/operator/offline',    agentController.markOperatorOffline);
router.post('/operator/heartbeat',  agentController.operatorHeartbeat);

// ─── Agent Status & Stats ─────────────────────────────────────────────────────
router.get('/status', agentController.getStatus);

// ─── Call Ingestion ───────────────────────────────────────────────────────────
// Accepts multipart/form-data with audio file + callerPhone field
router.post(
  '/call/ingest',
  authorise('SYSTEM_ADMIN'),
  audioUpload.single('audio'),
  validate(ingestCallSchema),
  agentController.ingestCall
);

// ─── Session Management ───────────────────────────────────────────────────────
router.get(
  '/calls',
  authorise('SYSTEM_ADMIN'),
  validate(listSessionsSchema),
  agentController.listSessions
);

router.get(
  '/calls/:id',
  authorise('SYSTEM_ADMIN'),
  agentController.getSession
);

router.put(
  '/calls/:id/review',
  authorise('SYSTEM_ADMIN'),
  validate(reviewSessionSchema),
  agentController.reviewSession
);

router.post(
  '/calls/:id/replay',
  authorise('SYSTEM_ADMIN'),
  agentController.replayNlp
);

export default router;
