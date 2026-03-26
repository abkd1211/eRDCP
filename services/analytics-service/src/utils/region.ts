// ─── Ghana Region Detector ────────────────────────────────────────────────────
// Maps GPS coordinates to the nearest major Ghana city/region.
// Used to group incidents by region for analytics dashboards.

interface RegionBounds {
  name:     string;
  minLat:   number;
  maxLat:   number;
  minLng:   number;
  maxLng:   number;
}

const GHANA_REGIONS: RegionBounds[] = [
  { name: 'Greater Accra', minLat: 5.35, maxLat: 5.90, minLng: -0.50, maxLng: 0.10 },
  { name: 'Ashanti',       minLat: 6.20, maxLat: 7.20, minLng: -2.20, maxLng: -1.00 },
  { name: 'Western',       minLat: 4.70, maxLat: 6.30, minLng: -3.20, maxLng: -1.80 },
  { name: 'Central',       minLat: 4.90, maxLat: 6.00, minLng: -1.80, maxLng: -0.50 },
  { name: 'Eastern',       minLat: 5.80, maxLat: 7.00, minLng: -1.20, maxLng: 0.20 },
  { name: 'Northern',      minLat: 8.80, maxLat: 10.70,minLng: -2.80, maxLng: -0.10 },
  { name: 'Upper East',    minLat: 10.60,maxLat: 11.20,minLng: -1.20, maxLng: 0.60 },
  { name: 'Upper West',    minLat: 9.80, maxLat: 11.00,minLng: -2.80, maxLng: -1.80 },
  { name: 'Volta',         minLat: 5.80, maxLat: 8.80, minLng: -0.20, maxLng: 1.20 },
  { name: 'Brong-Ahafo',   minLat: 7.00, maxLat: 8.80, minLng: -3.00, maxLng: -0.50 },
];

export const detectRegion = (latitude: number, longitude: number): string => {
  for (const region of GHANA_REGIONS) {
    if (
      latitude  >= region.minLat && latitude  <= region.maxLat &&
      longitude >= region.minLng && longitude <= region.maxLng
    ) {
      return region.name;
    }
  }
  return 'Other';
};

// ─── Period helpers ───────────────────────────────────────────────────────────
export const getPeriodDates = (period: string): { start: Date; end: Date } => {
  const end   = new Date();
  const start = new Date();

  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setDate(start.getDate() - 7); // default to last 7 days
  }

  return { start, end };
};

// ─── Hour label formatter ─────────────────────────────────────────────────────
export const formatHourLabel = (hour: number): string => {
  if (hour === 0)  return '12:00 AM';
  if (hour === 12) return '12:00 PM';
  return hour < 12 ? `${hour}:00 AM` : `${hour - 12}:00 PM`;
};
