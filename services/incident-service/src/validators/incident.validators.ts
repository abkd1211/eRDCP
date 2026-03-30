import { z } from 'zod';
import { IncidentType, IncidentStatus, ResponderType, ResponderStatus } from '@prisma/client';

// ─── Create Incident ──────────────────────────────────────────────────────────
export const createIncidentSchema = z.object({
  body: z.object({
    citizenName: z
      .string({ required_error: 'Citizen name is required' })
      .min(2, 'Name must be at least 2 characters')
      .max(100)
      .trim(),
    citizenPhone: z
      .string()
      .regex(/^\+?[0-9\s\-]{7,15}$/, 'Invalid phone number format')
      .optional(),
    incidentType: z.nativeEnum(IncidentType, {
      errorMap: () => ({ message: `Must be one of: ${Object.values(IncidentType).join(', ')}` }),
    }),
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90,  'Latitude must be >= -90')
      .max(90,   'Latitude must be <= 90'),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180, 'Longitude must be >= -180')
      .max(180,  'Longitude must be <= 180'),
    address:  z.string().max(255).trim().optional(),
    notes:    z.string().max(1000).trim().optional(),
    priority: z.number().int().min(1).max(3).default(1).optional(),
  }),
});

// ─── Update Incident Status ───────────────────────────────────────────────────
export const updateIncidentStatusSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid incident ID'),
  }),
  body: z.object({
    status: z.nativeEnum(IncidentStatus, {
      errorMap: () => ({ message: `Must be one of: ${Object.values(IncidentStatus).join(', ')}` }),
    }),
    note: z.string().max(500).trim().optional(),
  }),
});

// ─── Assign Responder ─────────────────────────────────────────────────────────
export const assignResponderSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid incident ID'),
  }),
  body: z.object({
    responderId: z.string().uuid('Invalid responder ID'),
  }),
});

// ─── Create Responder ─────────────────────────────────────────────────────────
export const createResponderSchema = z.object({
  body: z.object({
    name: z
      .string({ required_error: 'Name is required' })
      .min(2).max(150).trim(),
    type: z.nativeEnum(ResponderType, {
      errorMap: () => ({ message: `Must be one of: ${Object.values(ResponderType).join(', ')}` }),
    }),
    stationName: z
      .string({ required_error: 'Station name is required' })
      .min(2).max(150).trim(),
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90).max(90),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180).max(180),
    address:  z.string().max(255).trim().optional(),
    phone:    z.string().regex(/^\+?[0-9\s\-]{7,15}$/).optional(),
    capacity: z.number().int().min(1).max(50).default(1).optional(),
  }),
});

// ─── Update Responder Availability ───────────────────────────────────────────
export const updateResponderAvailabilitySchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid responder ID'),
  }),
  body: z.object({
    status: z.nativeEnum(ResponderStatus, {
      errorMap: () => ({ message: `Must be one of: ${Object.values(ResponderStatus).join(', ')}` }),
    }),
  }),
});

// Helper to handle Express query params that might be parsed as arrays
const ensureString = (val: unknown): string | undefined => {
  if (Array.isArray(val)) val = val[0];
  if (val === undefined || val === null || val === '') return undefined;
  return String(val);
};

// ─── Nearest Responder Params ─────────────────────────────────────────────────
export const nearestResponderSchema = z.object({
  params: z.object({
    lat:  z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude').transform(Number),
    lng:  z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude').transform(Number),
    type: z.nativeEnum(ResponderType, {
      errorMap: () => ({ message: `Type must be one of: ${Object.values(ResponderType).join(', ')}` }),
    }),
  }),
});

// ─── List Incidents Query ─────────────────────────────────────────────────────
export const listIncidentsSchema = z.object({
  query: z.object({
    page:   z.preprocess(ensureString, z.string().optional().transform(v => parseInt(v ?? '1'))),
    limit:  z.preprocess(ensureString, z.string().optional().transform(v => Math.min(parseInt(v ?? '20'), 100))),
    status: z.preprocess(ensureString, z.nativeEnum(IncidentStatus).optional()),
    type:   z.preprocess(ensureString, z.nativeEnum(IncidentType).optional()),
  }),
});

// ─── List Responders Query ────────────────────────────────────────────────────
export const listRespondersSchema = z.object({
  query: z.object({
    type:    z.preprocess(ensureString, z.nativeEnum(ResponderType).optional()),
    ownOnly: z.preprocess(ensureString, z.string().optional().transform(v => v === 'true')),
  }),
});

// ─── Nearby Incidents ─────────────────────────────────────────────────────────
export const nearbyIncidentsSchema = z.object({
  query: z.object({
    lat:    z.preprocess(ensureString, z.string({ required_error: 'lat is required' })
            .regex(/^-?\d+(\.\d+)?$/, 'Invalid latitude')).transform(Number),
    lng:    z.preprocess(ensureString, z.string({ required_error: 'lng is required' })
            .regex(/^-?\d+(\.\d+)?$/, 'Invalid longitude')).transform(Number),
    radius: z.preprocess(ensureString, z.string().optional().transform(v => Math.min(parseInt(v ?? '200'), 2000))),
  }),
});

// ─── Link Incident Report ─────────────────────────────────────────────────────
export const linkIncidentSchema = z.object({
  body: z.object({
    parentIncidentId: z
      .string({ required_error: 'parentIncidentId is required' })
      .uuid('Invalid incident ID'),
    citizenName: z
      .string({ required_error: 'Citizen name is required' })
      .min(2).max(100).trim(),
    citizenPhone: z
      .string()
      .regex(/^\+?[0-9\s\-]{7,15}$/, 'Invalid phone number')
      .optional(),
    notes: z.string().max(1000).trim().optional(),
  }),
});

// ─── Update Hospital Capacity ─────────────────────────────────────────────────
export const updateHospitalCapacitySchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Responder ID is required'),
  }),
  body: z.object({
    totalBeds: z
      .number({ required_error: 'Total beds is required' })
      .int().min(0).max(10000),
    availableBeds: z
      .number({ required_error: 'Available beds is required' })
      .int().min(0).max(10000),
    hospitalId: z.string().optional(),
  }).refine(
    (d) => d.availableBeds <= d.totalBeds,
    { message: 'Available beds cannot exceed total beds', path: ['availableBeds'] }
  ),
});

// ─── Update Responder Location ────────────────────────────────────────────────
export const updateResponderLocationSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Responder ID is required'),
  }),
  body: z.object({
    latitude: z
      .number({ required_error: 'Latitude is required' })
      .min(-90).max(90),
    longitude: z
      .number({ required_error: 'Longitude is required' })
      .min(-180).max(180),
    address: z.string().max(255).optional(),
  }),
});
