import { Request, Response, NextFunction } from 'express';
import dispatchService from '../services/dispatch.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest } from '../types';

export class DispatchController {

  // POST /vehicles/register
  registerVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicle = await dispatchService.registerVehicle(req.body);
      sendSuccess(res, 201, 'Vehicle registered successfully', vehicle);
    } catch (err) { next(err); }
  };

  // GET /vehicles
  listVehicles = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type, status } = req.query as { type?: string; status?: string };
      const vehicles = await dispatchService.getVehicles(type, status);
      sendSuccess(res, 200, 'Vehicles retrieved', vehicles);
    } catch (err) { next(err); }
  };

  // GET /vehicles/:id
  getVehicle = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const vehicle = await dispatchService.getVehicleById(id);
      sendSuccess(res, 200, 'Vehicle retrieved', vehicle);
    } catch (err) { next(err); }
  };

  // GET /vehicles/:id/location
  getVehicleLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const location = await dispatchService.getVehicleLocation(id);
      sendSuccess(res, 200, 'Vehicle location retrieved', location);
    } catch (err) { next(err); }
  };

  // PUT /vehicles/:id/location  (REST fallback for GPS ping)
  updateVehicleLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await dispatchService.processGpsPing({
        vehicleId:  req.params.id as string,
        latitude:   req.body.latitude,
        longitude:  req.body.longitude,
        speedKmh:   req.body.speedKmh,
        heading:    req.body.heading,
        batteryPct: req.body.batteryPct,
      });
      sendSuccess(res, 200, 'Location updated', null);
    } catch (err) { next(err); }
  };

  // GET /vehicles/:id/history
  getLocationHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit   = Math.min(parseInt(req.query.limit as string ?? '100'), 500);
      const id = req.params.id as string;
      const history = await dispatchService.getVehicleLocationHistory(id, limit);
      sendSuccess(res, 200, 'Location history retrieved', history);
    } catch (err) { next(err); }
  };

  // GET /vehicles/:id/assignment
  getActiveAssignment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const assignment = await dispatchService.getActiveAssignment(id);
      sendSuccess(res, 200, 'Active assignment retrieved', assignment);
    } catch (err) { next(err); }
  };

  // POST /vehicles/:id/trip/complete
  completeTrip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      await dispatchService.completeTrip(id, req.body.incidentId);
      sendSuccess(res, 200, 'Trip completed and summary generated', null);
    } catch (err) { next(err); }
  };

  // GET /dispatch/:incidentId
  getVehiclesByIncident = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const incidentId = req.params.incidentId as string;
      const vehicles = await dispatchService.getVehiclesByIncident(incidentId);
      sendSuccess(res, 200, 'Incident vehicles retrieved', vehicles);
    } catch (err) { next(err); }
  };
}

export default new DispatchController();
