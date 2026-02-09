/**
 * Reverse geocode lat/lng to city + state using Nominatim (OpenStreetMap).
 * Used for "Use my location" flow - maps coords to our city slugs.
 */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'ChineseBuffetDirectory/1.0 (https://chinesebuffet.directory)';

export interface GeocodeResult {
  city: string;
  state: string;
  stateAbbr: string;
  displayName: string;
}

const US_STATE_ABBR: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'washington d.c.': 'DC',
};

function stateNameToAbbr(name: string): string {
  if (!name) return '';
  const normalized = name.toLowerCase().trim();
  return US_STATE_ABBR[normalized] || '';
}

/** Normalize state to 2-letter abbr (for matching our city data) */
export function normalizeStateAbbr(state: string): string {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return stateNameToAbbr(state) || state.toUpperCase();
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      addressdetails: '1',
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data?.address;
    if (!addr) return null;

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      addr.state_district ||
      '';
    const stateName = addr.state || addr.region || '';
    const stateAbbr = stateNameToAbbr(stateName) || (stateName.length === 2 ? stateName.toUpperCase() : '');

    if (!city || !stateAbbr) return null;

    return {
      city,
      state: stateName,
      stateAbbr,
      displayName: data?.display_name || `${city}, ${stateAbbr}`,
    };
  } catch {
    return null;
  }
}

/**
 * Build a slug that matches our city slug format: "city-state" (e.g. "houston-tx")
 */
export function buildCitySlug(city: string, stateAbbr: string): string {
  const cityPart = city
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const statePart = stateAbbr.toLowerCase();
  return `${cityPart}-${statePart}`;
}
