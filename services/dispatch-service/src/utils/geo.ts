// ─── Haversine Distance ───────────────────────────────────────────────────────
export const haversineKm = (
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number => {
  const R    = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const toRad = (d: number) => d * (Math.PI / 180);

// ─── ETA Calculation ──────────────────────────────────────────────────────────
// Returns estimated seconds to destination based on current speed
// Falls back to an assumed average speed of 60 km/h if vehicle is stationary
export const calculateEtaSec = (
  currentLat: number, currentLng: number,
  destLat:    number, destLng:    number,
  speedKmh:   number
): number => {
  const distKm     = haversineKm(currentLat, currentLng, destLat, destLng);
  const effectiveSpeed = speedKmh > 5 ? speedKmh : 60; // assume 60 if nearly stopped
  return Math.round((distKm / effectiveSpeed) * 3600);
};

// ─── Route Deviation Detection ────────────────────────────────────────────────
// Checks if vehicle has deviated more than maxMetres from the straight-line
// path between origin and destination.
// Uses the cross-track distance formula.
export const crossTrackDistanceMetres = (
  vehicleLat: number, vehicleLng: number,
  originLat:  number, originLng:  number,
  destLat:    number, destLng:    number
): number => {
  const R  = 6371000; // metres
  const d13 = haversineKm(originLat, originLng, vehicleLat, vehicleLng) * 1000;
  const theta13 = bearingRad(originLat, originLng, vehicleLat, vehicleLng);
  const theta12 = bearingRad(originLat, originLng, destLat,    destLng);
  return Math.abs(Math.asin(Math.sin(d13 / R) * Math.sin(theta13 - theta12)) * R);
};

const bearingRad = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return Math.atan2(y, x);
};

// ─── Cardinal Heading from Degrees ───────────────────────────────────────────
export const degreesToCardinal = (deg: number): string => {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
};
