import { Router } from 'express';
import dispatchController from '../controllers/dispatch.controller';
import simulationController from '../controllers/simulation.controller';
import { authenticate, authorise } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  registerVehicleSchema,
  gpsPingSchema,
  completeTripSchema,
  listVehiclesSchema,
  locationHistorySchema,
} from '../validators/dispatch.validators';

const router = Router();

// ─── All routes require authentication ───────────────────────────────────────
router.use(authenticate);

// ─── Vehicles ─────────────────────────────────────────────────────────────────
router.post(
  '/vehicles/register',
  authorise('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'POLICE_ADMIN', 'FIRE_SERVICE_ADMIN'),
  validate(registerVehicleSchema),
  dispatchController.registerVehicle
);

router.get(
  '/vehicles',
  validate(listVehiclesSchema),
  dispatchController.listVehicles
);

router.get(
  '/vehicles/:id',
  dispatchController.getVehicle
);

router.get(
  '/vehicles/:id/location',
  dispatchController.getVehicleLocation
);

// REST fallback for GPS ping — primary path is via Socket.io
router.put(
  '/vehicles/:id/location',
  validate(gpsPingSchema),
  dispatchController.updateVehicleLocation
);

router.get(
  '/vehicles/:id/history',
  validate(locationHistorySchema),
  dispatchController.getLocationHistory
);

router.get(
  '/vehicles/:id/assignment',
  dispatchController.getActiveAssignment
);

router.post(
  '/vehicles/:id/trip/complete',
  authorise('SYSTEM_ADMIN', 'HOSPITAL_ADMIN', 'POLICE_ADMIN', 'FIRE_SERVICE_ADMIN'),
  validate(completeTripSchema),
  dispatchController.completeTrip
);

// ─── Dispatch by Incident ─────────────────────────────────────────────────────
router.get(
  '/dispatch/:incidentId',
  dispatchController.getVehiclesByIncident
);

// ─── Simulation Controls ──────────────────────────────────────────────────────
// Speed multiplier — SYSTEM_ADMIN only for demo control
router.post(
  '/simulation/speed',
  authorise('SYSTEM_ADMIN'),
  simulationController.setSpeed
);

router.get(
  '/simulation/speed',
  simulationController.getSpeed
);

// Manual blockage injection — SYSTEM_ADMIN only
router.post(
  '/simulation/blockage/:vehicleId',
  authorise('SYSTEM_ADMIN'),
  simulationController.triggerBlockage
);

// Active simulations status
router.get(
  '/simulation/active',
  authorise('SYSTEM_ADMIN'),
  simulationController.getActive
);

export default router;
