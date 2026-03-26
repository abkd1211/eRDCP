import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id:    string;
    email: string;
    role:  string;
    jti:   string;
  };
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

// ─── GPS Ping payload (from Socket.io or REST fallback) ───────────────────────
export interface GpsPingDto {
  vehicleId:  string;
  latitude:   number;
  longitude:  number;
  speedKmh?:  number;
  heading?:   string;
  batteryPct?:number;
  timestamp?: string;
}

// ─── Register Vehicle DTO ─────────────────────────────────────────────────────
export interface RegisterVehicleDto {
  vehicleCode:       string;
  type:              'AMBULANCE' | 'POLICE' | 'FIRE_TRUCK';
  stationId:         string;
  stationName:       string;
  incidentServiceId: string;
  driverUserId:      string;
  driverName:        string;
  latitude:          number;
  longitude:         number;
}

// ─── RabbitMQ Event Payloads ──────────────────────────────────────────────────
export interface IncidentDispatchedPayload {
  incident_id:        string;
  assigned_unit_id:   string;
  assigned_unit_type: string;
  responder_name:     string;
  latitude:           number;
  longitude:          number;
  dispatched_at:      string;
}

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

// ─── Socket.io Event Names ────────────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Client → Server
  JOIN_INCIDENT_ROOM:  'join:incident',
  JOIN_VEHICLE_ROOM:   'join:vehicle',
  LEAVE_ROOM:          'leave:room',
  GPS_PING:            'gps:ping',
  DRIVER_ONLINE:       'driver:online',
  DRIVER_OFFLINE:      'driver:offline',

  // Server → Client
  LOCATION_UPDATE:     'location:update',
  VEHICLE_STATUS:      'vehicle:status',
  ETA_UPDATE:          'eta:update',
  ROUTE_DEVIATION:     'route:deviation',
  VEHICLE_UNRESPONSIVE:'vehicle:unresponsive',
  VEHICLE_ARRIVED:     'vehicle:arrived',
  TRIP_COMPLETED:      'trip:completed',
  ERROR:               'error',
} as const;
