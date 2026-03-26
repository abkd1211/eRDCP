import axios from 'axios';
import { env } from '../config/env';
import logger from '../config/logger';

interface GeocodingResult {
  latitude:  number;
  longitude: number;
  displayName: string;
  confidence: number;
}

// ─── Ghana bounding box ───────────────────────────────────────────────────────
const GHANA_BOUNDS = {
  minLat: 4.7,  maxLat: 11.2,
  minLng: -3.3, maxLng: 1.2,
};

const isInGhana = (lat: number, lng: number): boolean =>
  lat >= GHANA_BOUNDS.minLat && lat <= GHANA_BOUNDS.maxLat &&
  lng >= GHANA_BOUNDS.minLng && lng <= GHANA_BOUNDS.maxLng;

// ─── Geocode a location text string ──────────────────────────────────────────
export const geocodeLocation = async (
  locationText: string
): Promise<GeocodingResult | null> => {
  if (!locationText || locationText.length < 3) return null;

  try {
    // Add "Ghana" to improve result accuracy
    const query = locationText.toLowerCase().includes('ghana')
      ? locationText
      : `${locationText}, Ghana`;

    const response = await axios.get(`${env.NOMINATIM_URL}/search`, {
      params: {
        q:              query,
        format:         'json',
        limit:          1,
        countrycodes:   'gh',        // Ghana only
        addressdetails: 1,
      },
      headers: {
        'User-Agent': env.NOMINATIM_USER_AGENT,
        'Accept-Language': 'en',
      },
      timeout: 5000,
    });

    if (!response.data || response.data.length === 0) {
      logger.debug('Nominatim: no results', { query });
      return null;
    }

    const result = response.data[0];
    const lat    = parseFloat(result.lat);
    const lng    = parseFloat(result.lon);

    if (!isInGhana(lat, lng)) {
      logger.debug('Nominatim: result outside Ghana', { lat, lng, query });
      return null;
    }

    // Confidence based on result type
    const typeConfidence: Record<string, number> = {
      house:           0.95,
      road:            0.85,
      suburb:          0.75,
      neighbourhood:   0.75,
      city:            0.65,
      town:            0.65,
      village:         0.70,
      amenity:         0.90,
    };
    const confidence = typeConfidence[result.type] ?? 0.60;

    logger.debug('Nominatim geocoded', { query, lat, lng, type: result.type });

    return {
      latitude:    lat,
      longitude:   lng,
      displayName: result.display_name,
      confidence,
    };
  } catch (err) {
    logger.warn('Geocoding failed', { locationText, error: err });
    return null;
  }
};

// ─── Default Ghana coordinates (Accra centre) used as fallback ────────────────
export const GHANA_DEFAULT_COORDS = {
  latitude:  5.6037,
  longitude: -0.1870,
};
