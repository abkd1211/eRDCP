import { z } from 'zod';

// ─── Register Vehicle ─────────────────────────────────────────────────────────
export const registerVehicleSchema = z.object({
  body: z.object({
    vehicleCode: z
      .string({ required_error: 'Vehicle code is required' })
      .min(2).max(20).trim().toUpperCase(),
    type: z.enum(['AMBULANCE', 'POLICE', 'FIRE_TRUCK'], {
      errorMap: () => ({ message: 'Type must be AMBULANCE, POLICE, or FIRE_TRUCK' }),
    }),
    stationId:         z.string({ required_error: 'Station ID is required' }).min(1),
    stationName:       z.string({ required_error: 'Station name is required' }).min(2).max(150).trim(),
    incidentServiceId: z.string({ required_error: 'Incident service ID is required' }).min(1),
    driverUserId:      z.string({ required_error: 'Driver user ID is required' }).min(1),
    driverName:        z.string({ required_error: 'Driver name is required' }).min(2).max(100).trim(),
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90).max(90),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180).max(180),
  }),
});

// ─── GPS Ping (REST fallback) ─────────────────────────────────────────────────
export const gpsPingSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Vehicle ID is required'),
  }),
  body: z.object({
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90).max(90),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180).max(180),
    speedKmh:   z.number().min(0).max(300).optional(),
    heading:    z.string().max(3).optional(),
    batteryPct: z.number().min(0).max(100).optional(),
  }),
});

// ─── Complete Trip ────────────────────────────────────────────────────────────
export const completeTripSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Vehicle ID is required'),
  }),
  body: z.object({
    incidentId: z.string({ required_error: 'Incident ID is required' }).min(1),
  }),
});

// Helper to handle Express query params that might be parsed as arrays
const ensureString = (val: unknown): string | undefined => {
  if (Array.isArray(val)) val = val[0];
  if (val === undefined || val === null || val === '') return undefined;
  return String(val);
};

// ─── List Vehicles Query ──────────────────────────────────────────────────────
// Use loose string validation — the service layer handles invalid values gracefully
export const listVehiclesSchema = z.object({
  query: z.object({
    type:   z.preprocess(ensureString, z.string().optional()),
    status: z.preprocess(ensureString, z.string().optional()),
  }).optional(),
});

// ─── Location History Query ───────────────────────────────────────────────────
export const locationHistorySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Vehicle ID is required'),
  }),
  query: z.object({
    limit: z.preprocess(ensureString, z.string().optional().transform(v => Math.min(parseInt(v ?? '100'), 500))),
  }),
});
