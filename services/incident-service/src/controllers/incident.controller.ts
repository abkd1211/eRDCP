import { Request, Response, NextFunction } from 'express';
import incidentService from '../services/incident.service';
import { sendSuccess } from '../utils/response';
import { AuthenticatedRequest, ResponderType, ResponderStatus } from '../types';

// ─── Role → Incident Type mapping ────────────────────────────────────────────
// Returns null for SYSTEM_ADMIN (no filter), or the allowed type string for others.
function getRoleTypeFilter(role: string): string | null {
  const map: Record<string, string> = {
    HOSPITAL_ADMIN:     'MEDICAL',
    POLICE_ADMIN:       'CRIME',   // will be expanded to CRIME+ACCIDENT in service
    FIRE_SERVICE_ADMIN: 'FIRE',
  };
  return map[role] ?? null;
}

export class IncidentController {

  // ─── POST /incidents ──────────────────────────────────────────────────────────
  createIncident = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user     = (req as AuthenticatedRequest).user;
      const incident = await incidentService.createIncident(req.body, user.id);
      sendSuccess(res, 201, 'Incident created and responder dispatched', incident);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents ───────────────────────────────────────────────────────────
  listIncidents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user   = (req as AuthenticatedRequest).user;
      const page   = req.query.page   as string | undefined;
      const limit  = req.query.limit  as string | undefined;
      const status = req.query.status as string | undefined;
      const type   = req.query.type   as string | undefined;

      // Role-based type filter — non-SYSTEM_ADMIN can only see their incident types
      const roleTypeFilter = getRoleTypeFilter(user.role);
      const effectiveType  = type ?? roleTypeFilter;

      const result = await incidentService.listIncidents(
        parseInt(page  ?? '1'),
        Math.min(parseInt(limit ?? '20'), 100),
        {
          status:       status as never,
          type:         effectiveType as never,
          // Pass extra types for POLICE_ADMIN who sees both CRIME and ACCIDENT
          extraTypes:   user.role === 'POLICE_ADMIN' ? ['CRIME', 'ACCIDENT'] : undefined,
        }
      );
      sendSuccess(res, 200, 'Incidents retrieved', result);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents/open ──────────────────────────────────────────────────────
  listOpenIncidents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user     = (req as AuthenticatedRequest).user;
      const roleType = getRoleTypeFilter(user.role);
      const extraTypes = user.role === 'POLICE_ADMIN' ? ['CRIME', 'ACCIDENT'] : undefined;
      const incidents = await incidentService.listOpenIncidents(roleType ?? undefined, extraTypes);
      sendSuccess(res, 200, 'Open incidents retrieved', incidents);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents/:id ───────────────────────────────────────────────────────
  getIncident = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const incident = await incidentService.getIncidentById(id);
      sendSuccess(res, 200, 'Incident retrieved', incident);
    } catch (err) { next(err); }
  };

  // ─── PUT /incidents/:id/status ────────────────────────────────────────────────
  updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user    = (req as AuthenticatedRequest).user;
      const id = req.params.id as string;
      const updated = await incidentService.updateIncidentStatus(id, req.body, user.id);
      sendSuccess(res, 200, 'Incident status updated', updated);
    } catch (err) { next(err); }
  };

  // ─── PUT /incidents/:id/assign ────────────────────────────────────────────────
  assignResponder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user    = (req as AuthenticatedRequest).user;
      const id = req.params.id as string;
      const updated = await incidentService.assignResponder(id, req.body.responderId, user.id);
      sendSuccess(res, 200, 'Responder assigned', updated);
    } catch (err) { next(err); }
  };

  // ─── GET /responders ─────────────────────────────────────────────────────────
  listResponders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      // Role-based responder filtering
      const roleResponderMap: Record<string, ResponderType> = {
        HOSPITAL_ADMIN:     'AMBULANCE',
        POLICE_ADMIN:       'POLICE',
        FIRE_SERVICE_ADMIN: 'FIRE_TRUCK',
      };
      const forced = roleResponderMap[user.role];
      const { type } = req.query as { type?: ResponderType };
      const effectiveType = forced ?? type;
      const responders = await incidentService.listResponders(effectiveType);
      sendSuccess(res, 200, 'Responders retrieved', responders);
    } catch (err) { next(err); }
  };

  // ─── POST /responders ────────────────────────────────────────────────────────
  createResponder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user      = (req as AuthenticatedRequest).user;
      const responder = await incidentService.createResponder(req.body, user.id);
      sendSuccess(res, 201, 'Responder created', responder);
    } catch (err) { next(err); }
  };

  // ─── PUT /responders/:id/availability ────────────────────────────────────────
  updateResponderAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id      = req.params.id as string;
      const { status } = req.body as { status: ResponderStatus };
      const updated = await incidentService.updateResponderStatus(id, status);
      sendSuccess(res, 200, 'Responder availability updated', updated);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents/nearby ────────────────────────────────────────────────────
  getNearbyIncidents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lat    = parseFloat(req.query.lat    as string);
      const lng    = parseFloat(req.query.lng    as string);
      const radius = parseFloat(req.query.radius as string ?? '200');
      const nearby = await incidentService.checkNearbyOpenIncidents(lat, lng, radius);
      sendSuccess(res, 200, 'Nearby incidents retrieved', nearby);
    } catch (err) { next(err); }
  };

  // ─── POST /incidents/link ─────────────────────────────────────────────────────
  linkIncidentReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user   = (req as AuthenticatedRequest).user;
      const result = await incidentService.linkIncidentReport(req.body, user.id);
      sendSuccess(res, 201, 'Incident report linked', result);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents/:id/linked-reports ───────────────────────────────────────
  getLinkedReports = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id      = req.params.id as string;
      const reports = await incidentService.getLinkedReports(id);
      sendSuccess(res, 200, 'Linked reports retrieved', reports);
    } catch (err) { next(err); }
  };

  // ─── GET /incidents/nearest/:lat/:lng/:type ───────────────────────────────────
  getNearestResponder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lat  = parseFloat(req.params.lat as string);
      const lng  = parseFloat(req.params.lng as string);
      const type = req.params.type as ResponderType;
      const result = await incidentService.findNearestAvailableResponder(lat, lng, type);
      if (!result) {
        sendSuccess(res, 200, 'No available responders found', null);
        return;
      }
      sendSuccess(res, 200, 'Nearest responder found', result);
    } catch (err) { next(err); }
  };

  // ─── PUT /responders/:id/capacity ────────────────────────────────────────────
  updateHospitalCapacity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = (req as AuthenticatedRequest).user;
      const id   = req.params.id as string;
      const updated = await incidentService.updateHospitalCapacity(id, req.body, user.id);
      sendSuccess(res, 200, 'Hospital capacity updated', updated);
    } catch (err) { next(err); }
  };

  // ─── GET /responders/hospitals ────────────────────────────────────────────────
  getHospitalCapacities = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const hospitals = await incidentService.getHospitalCapacities();
      sendSuccess(res, 200, 'Hospital capacities retrieved', hospitals);
    } catch (err) { next(err); }
  };

  // ─── PUT /responders/:id/location ─────────────────────────────────────────────
  updateResponderLocation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id      = req.params.id as string;
      const updated = await incidentService.updateResponderLocation(id, req.body);
      sendSuccess(res, 200, 'Responder location updated', updated);
    } catch (err) { next(err); }
  };
}

export default new IncidentController();
