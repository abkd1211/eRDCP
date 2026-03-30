import { Router } from 'express';
import incidentController from '../controllers/incident.controller';
import { authenticate, authorise } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createResponderSchema,
  updateResponderAvailabilitySchema,
  updateHospitalCapacitySchema,
  updateResponderLocationSchema,
  listRespondersSchema,
} from '../validators/incident.validators';

const router = Router();

// ─── All routes require authentication ───────────────────────────────────────
router.use(authenticate);

// ─── GET /responders ─────────────────────────────────────────────────────────
router.get(
  '/',
  validate(listRespondersSchema),
  incidentController.listResponders
);

// ─── POST /responders ────────────────────────────────────────────────────────
router.post(
  '/',
  authorise('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'POLICE_ADMIN', 'FIRE_SERVICE_ADMIN'),
  validate(createResponderSchema),
  incidentController.createResponder
);

// ─── GET /hospitals (already under /responders/hospitals) ────────────────────
router.get(
  '/hospitals',
  incidentController.getHospitalCapacities
);

// ─── Availability ─────────────────────────────────────────────────────────────
router.put(
  '/:id/availability',
  validate(updateResponderAvailabilitySchema),
  incidentController.updateResponderAvailability
);

// ─── Capacity ─────────────────────────────────────────────────────────────────
router.put(
  '/:id/capacity',
  authorise('HOSPITAL_ADMIN', 'SYSTEM_ADMIN'),
  validate(updateHospitalCapacitySchema),
  incidentController.updateHospitalCapacity
);

// ─── Location Update ──────────────────────────────────────────────────────────
router.put(
  '/:id/location',
  authorise('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'POLICE_ADMIN', 'FIRE_SERVICE_ADMIN'),
  validate(updateResponderLocationSchema),
  incidentController.updateResponderLocation
);

export default router;
