import { Request } from 'express';
import { IncidentType, IncidentStatus, ResponderType, ResponderStatus } from '@prisma/client';

// ─── Re-export Prisma enums ───────────────────────────────────────────────────
export { IncidentType, IncidentStatus, ResponderType, ResponderStatus };

// ─── Authenticated Request ────────────────────────────────────────────────────
export interface AuthenticatedRequest extends Request {
  user: {
    id:    string;
    email: string;
    role:  string;
    jti:   string;
  };
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────
export interface CreateIncidentDto {
  citizenName:  string;
  citizenPhone?: string;
  incidentType: IncidentType;
  latitude:     number;
  longitude:    number;
  address?:     string;
  notes?:       string;
  priority?:    number;
}

export interface UpdateIncidentStatusDto {
  status: IncidentStatus;
  note?:  string;
}

export interface AssignResponderDto {
  responderId: string;
}

export interface CreateResponderDto {
  name:        string;
  type:        ResponderType;
  stationName: string;
  latitude:    number;
  longitude:   number;
  address?:    string;
  phone?:      string;
  capacity?:   number;
}

export interface UpdateResponderAvailabilityDto {
  status: ResponderStatus;
}

// ─── API Response Shapes ──────────────────────────────────────────────────────
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

// ─── Pagination ───────────────────────────────────────────────────────────────
export interface PaginatedResult<T> {
  data:  T[];
  total: number;
  page:  number;
  pages: number;
  limit: number;
}

// ─── Geolocation ──────────────────────────────────────────────────────────────
export interface Coordinates {
  latitude:  number;
  longitude: number;
}

export interface NearestResponderResult {
  responderId:   string;
  responderName: string;
  responderType: ResponderType;
  distanceKm:    number;
  coordinates:   Coordinates;
}

// ─── RabbitMQ Event Payloads ──────────────────────────────────────────────────
export interface IncidentCreatedPayload {
  incident_id:      string;
  incident_type:    IncidentType;
  latitude:         number;
  longitude:        number;
  citizen_name:     string;
  created_by:       string;
  status:           IncidentStatus;
  assigned_unit_id: string | null;
  priority:         number;
  created_at:       string;
}

export interface IncidentDispatchedPayload {
  incident_id:        string;
  assigned_unit_id:   string;
  assigned_unit_type: ResponderType;
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

// ─── AI Call Agent Event ──────────────────────────────────────────────────────
export interface AiCallProcessedPayload {
  session_id:    string;
  caller_phone:  string;
  transcript:    string;
  extracted: {
    citizen_name:  string;
    incident_type: string;
    location_text: string;
    latitude:      number;
    longitude:     number;
    notes:         string;
    confidence:    number;
  };
  auto_submit: boolean;
}

// ─── Nearby Incident Result ───────────────────────────────────────────────────
export interface NearbyIncidentResult {
  incidentId:        string;
  incidentType:      IncidentType;
  status:            IncidentStatus;
  distanceMetres:    number;
  latitude:          number;
  longitude:         number;
  address:           string | null;
  createdBy:         string;
  createdAt:         Date;
  assignedUnit:      { id: string; name: string; station: string } | null;
  linkedReportCount: number;
}

// ─── Link Incident DTO ────────────────────────────────────────────────────────
export interface LinkIncidentDto {
  parentIncidentId: string;
  citizenName:      string;
  citizenPhone?:    string;
  notes?:           string;
}

// ─── Hospital Capacity DTO ────────────────────────────────────────────────────
export interface UpdateHospitalCapacityDto {
  totalBeds:     number;
  availableBeds: number;
  hospitalId?:   string;
}

// ─── Update Responder Location DTO ───────────────────────────────────────────
export interface UpdateResponderLocationDto {
  latitude:  number;
  longitude: number;
  address?:  string;
}
