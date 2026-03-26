// RabbitMQ event message types shared across all services

export interface BaseEvent {
  event_id:   string;
  event_type: string;
  source:     string;
  timestamp:  string;
  version:    string;
}

export interface IncidentCreatedEvent extends BaseEvent {
  event_type: 'incident.created';
  payload: {
    incident_id:      string;
    incident_type:    string;
    latitude:         number;
    longitude:        number;
    citizen_name:     string;
    created_by:       string;
    status:           string;
    assigned_unit_id: string | null;
    created_at:       string;
  };
}

export interface IncidentDispatchedEvent extends BaseEvent {
  event_type: 'incident.dispatched';
  payload: {
    incident_id:        string;
    assigned_unit_id:   string;
    assigned_unit_type: string;
    vehicle_id:         string;
    dispatched_at:      string;
  };
}

export interface LocationUpdatedEvent extends BaseEvent {
  event_type: 'location.updated';
  payload: {
    vehicle_id:  string;
    incident_id: string;
    latitude:    number;
    longitude:   number;
    speed_kmh:   number;
    heading:     string;
    recorded_at: string;
  };
}

export interface AiCallProcessedEvent extends BaseEvent {
  event_type: 'ai.call.processed';
  payload: {
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
  };
}

export type EmergencyEvent =
  | IncidentCreatedEvent
  | IncidentDispatchedEvent
  | LocationUpdatedEvent
  | AiCallProcessedEvent;
