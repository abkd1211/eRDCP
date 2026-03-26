import { Request, Response, NextFunction } from 'express';
import {
  setSpeedMultiplier,
  getSpeedMultiplier,
  triggerBlockage,
  getActiveSimulations,
} from '../services/simulation.service';
import { sendSuccess } from '../utils/response';
import { sendError }   from '../utils/response';

export class SimulationController {

  // POST /simulation/speed
  setSpeed = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { multiplier } = req.body as { multiplier: number };
      if (!multiplier || multiplier < 1 || multiplier > 20) {
        sendError(res, 400, 'multiplier must be between 1 and 20');
        return;
      }
      setSpeedMultiplier(multiplier);
      sendSuccess(res, 200, `Simulation speed set to ${multiplier}x`, { multiplier });
    } catch (err) { next(err); }
  };

  // GET /simulation/speed
  getSpeed = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      sendSuccess(res, 200, 'Current simulation speed', { multiplier: getSpeedMultiplier() });
    } catch (err) { next(err); }
  };

  // POST /simulation/blockage/:vehicleId
  triggerBlockage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { vehicleId } = req.params;
      const triggered = await triggerBlockage(vehicleId as string);
      if (!triggered) {
        sendError(res, 404, 'No active simulation found for this vehicle');
        return;
      }
      sendSuccess(res, 200, 'Route blockage triggered', { vehicleId });
    } catch (err) { next(err); }
  };

  // GET /simulation/active
  getActive = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const vehicles = getActiveSimulations();
      sendSuccess(res, 200, 'Active simulations', { vehicles, count: vehicles.length });
    } catch (err) { next(err); }
  };
}

export default new SimulationController();
