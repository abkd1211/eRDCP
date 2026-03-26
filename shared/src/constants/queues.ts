export const EXCHANGE = 'emergency.events';
export const DEAD_LETTER_EXCHANGE = 'emergency.dead-letter';

export const QUEUES = {
  DISPATCH_INCIDENT_CREATED:    'dispatch.incident.created',
  ANALYTICS_INCIDENT_CREATED:   'analytics.incident.created',
  DISPATCH_INCIDENT_DISPATCHED: 'dispatch.incident.dispatched',
  ANALYTICS_INCIDENT_DISPATCHED:'analytics.incident.dispatched',
  ANALYTICS_INCIDENT_RESOLVED:  'analytics.incident.resolved',
  ANALYTICS_LOCATION_UPDATED:   'analytics.location.updated',
  INCIDENT_AI_CALL_PROCESSED:   'incident.ai.call.processed',
} as const;

export const ROUTING_KEYS = {
  INCIDENT_CREATED:    'incident.created',
  INCIDENT_DISPATCHED: 'incident.dispatched',
  INCIDENT_RESOLVED:   'incident.resolved',
  LOCATION_UPDATED:    'location.updated',
  AI_CALL_PROCESSED:   'ai.call.processed',
} as const;
