import { Coordinates } from '../types';

// ─── Haversine Formula ────────────────────────────────────────────────────────
// Calculates the great-circle distance between two points on Earth (in km)
export const haversineDistance = (pointA: Coordinates, pointB: Coordinates): number => {
  const R = 6371; // Earth radius in km

  const dLat = toRad(pointB.latitude  - pointA.latitude);
  const dLon = toRad(pointB.longitude - pointA.longitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(pointA.latitude)) *
    Math.cos(toRad(pointB.latitude)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg: number): number => deg * (Math.PI / 180);

// ─── Find Nearest from a List ─────────────────────────────────────────────────
export interface LocatableEntity {
  id:        string;
  latitude:  number;
  longitude: number;
}

export const findNearest = <T extends LocatableEntity>(
  origin: Coordinates,
  entities: T[]
): (T & { distanceKm: number }) | null => {
  if (entities.length === 0) return null;

  let nearest = entities[0];
  let minDist = haversineDistance(origin, { latitude: nearest.latitude, longitude: nearest.longitude });

  for (let i = 1; i < entities.length; i++) {
    const dist = haversineDistance(origin, {
      latitude:  entities[i].latitude,
      longitude: entities[i].longitude,
    });
    if (dist < minDist) {
      minDist = dist;
      nearest = entities[i];
    }
  }

  return { ...nearest, distanceKm: Math.round(minDist * 100) / 100 };
};

// ─── Incident Type → Responder Type Mapping ───────────────────────────────────
export const incidentToResponderType = (incidentType: string): string => {
  const mapping: Record<string, string> = {
    MEDICAL:  'AMBULANCE',
    FIRE:     'FIRE_TRUCK',
    CRIME:    'POLICE',
    ACCIDENT: 'AMBULANCE',  // Medical response by default; police can also be dispatched
    OTHER:    'POLICE',
  };
  return mapping[incidentType] ?? 'POLICE';
};

// ─── Named alias for cross-service consistency ────────────────────────────────
export const haversineKm = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => haversineDistance(
  { latitude: lat1, longitude: lng1 },
  { latitude: lat2, longitude: lng2 }
);
