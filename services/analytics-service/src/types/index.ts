import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; jti: string; };
}

export interface ApiSuccess<T = unknown> {
  success: true;
  message: string;
  data:    T;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
  code?:   string;
}

// ─── RabbitMQ Event Payloads ──────────────────────────────────────────────────
export interface IncidentCreatedPayload {
  incident_id:      string;
  incident_type:    string;
  latitude:         number;
  longitude:        number;
  citizen_name:     string;
  created_by:       string;
  status:           string;
  assigned_unit_id: string | null;
  priority:         number;
  created_at:       string;
}

export interface IncidentDispatchedPayload {
  incident_id:        string;
  assigned_unit_id:   string;
  assigned_unit_type: string;
  responder_name:     string;
  latitude:           number;
  longitude:          number;
  dispatched_at:      string;
}

export interface IncidentResolvedPayload {
  incident_id:  string;
  resolved_by:  string;
  resolved_at:  string;
  duration_sec: number;
}

export interface LocationUpdatedPayload {
  vehicle_id:  string;
  incident_id: string | null;
  latitude:    number;
  longitude:   number;
  speed_kmh:   number;
  heading:     string;
  recorded_at: string;
}

export interface TripCompletedPayload {
  vehicle_id:  string;
  incident_id: string;
  trip_summary: {
    totalDistanceKm: number;
    durationSec:     number;
    avgSpeedKmh:     number;
    maxSpeedKmh:     number;
    pingCount:       number;
  };
  completed_at: string;
}

export interface VehicleUnresponsivePayload {
  vehicle_id:   string;
  vehicle_code: string;
  incident_id:  string | null;
  last_seen_at: string;
}

// ─── Analytics Response Types ─────────────────────────────────────────────────
export interface ResponseTimeStats {
  avgDispatchSec:       number;
  avgArrivalSec:        number;
  avgResolutionSec:     number;
  minDispatchSec:       number;
  maxDispatchSec:       number;
  totalIncidents:       number;
  period:               string;
}

export interface IncidentsByRegion {
  region:       string;
  total:        number;
  byType:       Record<string, number>;
  avgPriority:  number;
}

export interface PeakHourData {
  hour:    number;   // 0-23
  count:   number;
  label:   string;   // "2:00 AM", "14:00 PM" etc
}

export interface HeatmapPoint {
  latitude:  number;
  longitude: number;
  weight:    number;  // incident count at this location
  type:      string;
}

export interface SlaReport {
  totalIncidents:    number;
  withinSla:         number;
  outsideSla:        number;
  compliancePct:     number;  // percentage
  slaTargetSec:      number;
  byType:            Array<{ type: string; total: number; withinSla: number; pct: number }>;
}

export interface DashboardSnapshot {
  totalIncidents:    number;
  openIncidents:     number;
  resolvedToday:     number;
  avgResponseSec:    number;
  slaCompliancePct:  number;
  activeVehicles:    number;
  unresponsiveVehicles: number;
  byType:            Record<string, number>;
  byStatus:          Record<string, number>;
  topResponders:     Array<{
    responderId:       string;
    responderName:     string;
    responderType:     string;
    totalDispatch:     number;
    avgArrivalSec:     number;
    slaCompliance:     number;
    streakDays:        number;
  }>;
  recentIncidents:   Array<{
    id:           string;
    incidentType: string;
    citizenName:  string;
    region:       string;
    priority:     number;
    status:       string;
    createdAt:    Date;
    responder?:   { name: string };
  }>;
}
