export type Role = 'SYSTEM_ADMIN' | 'HOSPITAL_ADMIN' | 'POLICE_ADMIN' | 'FIRE_SERVICE_ADMIN' | 'AMBULANCE_DRIVER';
export type IncidentType   = 'MEDICAL' | 'FIRE' | 'CRIME' | 'ACCIDENT' | 'OTHER';
export type IncidentStatus = 'CREATED' | 'DISPATCHED' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
export type ResponderType   = 'AMBULANCE' | 'POLICE' | 'FIRE_TRUCK';
export type ResponderStatus = 'AVAILABLE' | 'BUSY' | 'OFFLINE';
export type VehicleType   = 'AMBULANCE' | 'POLICE' | 'FIRE_TRUCK';
export type VehicleStatus = 'AVAILABLE' | 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE' | 'RETURNING' | 'OFFLINE' | 'UNRESPONSIVE';
export type SessionStatus = 'PENDING' | 'TRANSCRIBING' | 'EXTRACTING' | 'PENDING_REVIEW' | 'AUTO_SUBMITTED' | 'MANUALLY_SUBMITTED' | 'DISCARDED' | 'FAILED';

export interface User { id: string; name: string; email: string; role: Role; isActive: boolean; createdAt: string; lastLogin?: string; }
export interface TokenPair { accessToken: string; refreshToken: string; }

export interface Incident {
  id: string; citizenName: string; citizenPhone?: string;
  incidentType: IncidentType; latitude: number; longitude: number;
  address?: string; notes?: string; priority: number; status: IncidentStatus;
  createdBy: string; assignedUnitId?: string; assignedUnitType?: string;
  dispatchedAt?: string; resolvedAt?: string; createdAt: string; updatedAt: string;
  responder?: Responder; statusHistory?: StatusHistoryEntry[];
}
export interface StatusHistoryEntry { id: string; oldStatus: IncidentStatus; newStatus: IncidentStatus; changedBy: string; note?: string; changedAt: string; }
export interface NearbyIncident { incidentId: string; incidentType: IncidentType; status: IncidentStatus; distanceMetres: number; latitude: number; longitude: number; address?: string; createdBy: string; createdAt: string; assignedUnit?: { id: string; name: string; station: string } | null; linkedReportCount: number; }

export interface Responder { id: string; name: string; type: ResponderType; stationName: string; latitude: number; longitude: number; address?: string; phone?: string; capacity: number; status: ResponderStatus; managedBy?: string; createdAt: string; }

export interface Vehicle {
  _id: string; vehicleCode: string; type: VehicleType; stationName: string; driverName: string;
  status: VehicleStatus; incidentServiceId: string; currentIncidentId?: string;
  routeDeviation: boolean; isUnresponsive: boolean; speedKmh: number; heading: string; batteryPct?: number;
  currentLocation: { latitude: number; longitude: number; updatedAt: string; };
}

export interface VehicleLive {
  vehicleId: string; vehicleCode: string; type: VehicleType; 
  driverUserId?: string; driverName?: string;
  lat: number; lng: number; prevLat: number; prevLng: number;
  heading: string; headingDeg: number; speedKmh: number; batteryPct: number | null;
  etaSec: number | null; deviation: boolean; arrived: boolean; unresponsive: boolean;
  status: VehicleStatus;
  incidentId?: string; lastUpdate: number;
}

export interface DashboardSnapshot { totalIncidents: number; openIncidents: number; resolvedToday: number; avgResponseSec: number; slaCompliancePct: number; byType: Record<string, number>; byStatus: Record<string, number>; recentIncidents: Incident[]; }
export interface SlaReport { period: string; slaTargetSec: number; totalDispatched: number; withinSla: number; compliancePct: number; byType: Array<{ type: IncidentType; total: number; withinSla: number; pct: number }>; }
export interface PeakHourEntry { hour: number; count: number; }
export interface RegionStat { region: string; count: number; byType: Partial<Record<IncidentType, number>>; }
export interface TopResponder { responderId: string; responderName: string; totalDispatch: number; avgArrivalSec: number; slaCompliance: number; streakDays: number; }
export interface ResponseTimeData { avgDispatchSec: number; avgArrivalSec: number; avgResolutionSec: number; slaTargetSec: number; }

export interface CallSession { 
  _id: string; 
  sessionId: string; 
  callerPhone: string; 
  audioFile: string; 
  status: SessionStatus; 
  language?: string; 
  handledBy: string; 
  transcription?: { 
    text?: string; 
    cleanedText: string; 
    language?: string; 
    confidence?: number; 
  };
  extraction?: ExtractedIncident;
  createdAt: string; 
  updatedAt: string; 
}
export interface ExtractedField { value: string; confidence: number; }
export interface ExtractedIncident {
  sessionId: string;
  citizenName:  ExtractedField;
  incidentType: ExtractedField;
  locationText: ExtractedField;
  latitude:     ExtractedField & { source: string };
  longitude:    ExtractedField & { source: string };
  urgencyLevel: ExtractedField;
  notes:        ExtractedField;
  overallConfidence: number;
  autoSubmitted: boolean;
  manuallyEdited: boolean;
}
export interface AgentStatus {
  operatorsOnline: number;
  totalSessions: number;
  autoSubmitted: number;
  pendingReview: number;
  reviewed: number;
  discarded: number;
  failed: number;
  autoSubmitRate: number;
  avgConfidence: number;
  whisperAvailable: boolean;
  confidenceThreshold: number;
}

export interface Paginated<T> { data: T[]; total: number; page: number; pages: number; limit: number; }

export interface LocationUpdatePayload { 
  vehicleId: string; vehicleCode: string; type: VehicleType; 
  driverUserId?: string; driverName?: string; 
  latitude: number; longitude: number; speedKmh: number; heading: string; batteryPct: number | null; 
  status: VehicleStatus; incidentId?: string; timestamp: string; 
}
export interface EtaUpdatePayload { vehicleId: string; vehicleCode: string; etaSec: number; etaMinutes: number; }
export interface RouteDeviationPayload { vehicleId: string; vehicleCode: string; deviationMetres: number; currentLocation: { latitude: number; longitude: number }; blocked?: boolean; }
export interface VehicleArrivedPayload { vehicleId: string; vehicleCode: string; arrivalSec: number; arrivedAt: string; incidentId?: string; }
export type AlertType = 'deviation' | 'arrived' | 'unresponsive' | 'incident_new' | 'incident_unassigned';
export interface Alert { id: string; type: AlertType; message: string; vehicleCode?: string; incidentId?: string; timestamp: number; }
