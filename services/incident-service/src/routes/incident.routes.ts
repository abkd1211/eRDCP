import { Router } from 'express';
import incidentController from '../controllers/incident.controller';
import { authenticate, authorise } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createIncidentSchema,
  updateIncidentStatusSchema,
  assignResponderSchema,
  createResponderSchema,
  updateResponderAvailabilitySchema,
  nearestResponderSchema,
  listIncidentsSchema,
  nearbyIncidentsSchema,
  linkIncidentSchema,
  updateHospitalCapacitySchema,
  updateResponderLocationSchema,
} from '../validators/incident.validators';

const router = Router();

// ─── All routes require authentication ───────────────────────────────────────
router.use(authenticate);

// ─── Incidents ────────────────────────────────────────────────────────────────
router.post(
  '/',
  authorise('SYSTEM_ADMIN'),
  validate(createIncidentSchema),
  incidentController.createIncident
);

router.get(
  '/',
  validate(listIncidentsSchema),
  incidentController.listIncidents
);

// NOTE: /open, /nearby, /link must be defined BEFORE /:id to avoid route collision
router.get(
  '/open',
  incidentController.listOpenIncidents
);

// Check for nearby open incidents BEFORE submitting
router.get(
  '/nearby',
  validate(nearbyIncidentsSchema),
  incidentController.getNearbyIncidents
);

router.get(
  '/nearest/:lat/:lng/:type',
  validate(nearestResponderSchema),
  incidentController.getNearestResponder
);

// Link a witness report to an existing active incident
router.post(
  '/link',
  authorise('SYSTEM_ADMIN'),
  validate(linkIncidentSchema),
  incidentController.linkIncidentReport
);

router.get(
  '/:id',
  incidentController.getIncident
);

router.put(
  '/:id/status',
  validate(updateIncidentStatusSchema),
  incidentController.updateStatus
);

router.put(
  '/:id/assign',
  authorise('SYSTEM_ADMIN'),
  validate(assignResponderSchema),
  incidentController.assignResponder
);

// Get all linked witness reports for an incident
router.get(
  '/:id/linked-reports',
  incidentController.getLinkedReports
);

// ─── Responders ───────────────────────────────────────────────────────────────
// NOTE: Responders are now primary handled in responder.routes.ts
// The routes below were redundant and have been removed to avoid conflict.

// ─── Hospital Capacity (static — must be BEFORE /responders/:id) ─────────────
router.get(
  '/responders/hospitals',
  incidentController.getHospitalCapacities
);

// ─── Parameterized responder routes ──────────────────────────────────────────
router.put(
  '/responders/:id/availability',
  validate(updateResponderAvailabilitySchema),
  incidentController.updateResponderAvailability
);

router.put(
  '/responders/:id/capacity',
  authorise('HOSPITAL_ADMIN', 'SYSTEM_ADMIN'),
  validate(updateHospitalCapacitySchema),
  incidentController.updateHospitalCapacity
);

// ─── Responder Location Update ────────────────────────────────────────────────
router.put(
  '/responders/:id/location',
  authorise('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'POLICE_ADMIN', 'FIRE_SERVICE_ADMIN'),
  validate(updateResponderLocationSchema),
  incidentController.updateResponderLocation
);

export default router;
