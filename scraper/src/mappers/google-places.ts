import { request } from 'undici';
import { logger } from '../utils/logger.js';
import { randomDelay } from '../utils/delay.js';

const GOOGLE_PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place/details/json';

export interface GooglePlaceDetails {
  place_id: string;
  name?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  website?: string;
  url?: string;
}

export async function fetchGooglePlaceDetails(
  placeId: string,
  apiKey: string
): Promise<GooglePlaceDetails | null> {
  const url = `${GOOGLE_PLACES_API_BASE}?place_id=${encodeURIComponent(placeId)}&key=${encodeURIComponent(apiKey)}&fields=place_id,name,formatted_address,geometry,website,url`;

  try {
    const response = await request(url, {
      method: 'GET',
      maxRedirections: 3
    });

    if (response.statusCode !== 200) {
      throw new Error(`Google API returned status ${response.statusCode}`);
    }

    const data = await response.body.json() as any;

    if (data.status === 'OK' && data.result) {
      return data.result as GooglePlaceDetails;
    } else if (data.status === 'ZERO_RESULTS') {
      logger.warn({ placeId }, 'Place not found in Google Places');
      return null;
    } else {
      throw new Error(`Google API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }
  } catch (error: any) {
    logger.error({ placeId, error: error.message }, 'Failed to fetch Google Place details');
    throw error;
  }
}
