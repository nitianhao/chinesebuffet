// Overpass API integration for querying OpenStreetMap data
// Documentation: https://wiki.openstreetmap.org/wiki/Overpass_API

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: Array<{
    type: 'node' | 'way' | 'relation';
    ref: number;
    role: string;
  }>;
  geometry?: Array<{ lat: number; lon: number }>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

export interface OverpassError {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface NearbyPOI {
  id: number;
  type: 'node' | 'way' | 'relation';
  name?: string;
  category?: string;
  distance: number; // in meters
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

export interface AdministrativeBoundary {
  id: number;
  type: 'way' | 'relation';
  name?: string;
  adminLevel: number;
  boundaryType: 'administrative';
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags: Record<string, string>;
}

// Default Overpass API endpoint
const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Execute an Overpass QL query
 */
export async function queryOverpass(
  query: string,
  endpoint: string = DEFAULT_OVERPASS_URL,
  timeout: number = 25
): Promise<OverpassResponse> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `[out:json][timeout:${timeout}];${query}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Check for Overpass API errors
    if ('error' in data) {
      const error = data as OverpassError;
      throw new Error(`Overpass API error: ${error.error?.code} - ${error.error?.message}`);
    }

    return data as OverpassResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to query Overpass API: ${String(error)}`);
  }
}

/**
 * Find nearby points of interest (POIs) around a location
 */
export async function findNearbyPOIs(
  lat: number,
  lon: number,
  radius: number = 500, // meters
  categories?: string[], // e.g., ['restaurant', 'cafe', 'park']
  limit: number = 50
): Promise<NearbyPOI[]> {
  const categoryFilters = categories && categories.length > 0
    ? categories.map(cat => `["amenity"="${cat}"]`).join('')
    : '';

  // Query for nodes with amenities
  const query = `
    (
      node["amenity"]${categoryFilters}(around:${radius},${lat},${lon});
      way["amenity"]${categoryFilters}(around:${radius},${lat},${lon});
      relation["amenity"]${categoryFilters}(around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  const response = await queryOverpass(query);
  const pois: NearbyPOI[] = [];

  for (const element of response.elements) {
    const elementLat = element.lat || (element.geometry?.[0]?.lat);
    const elementLon = element.lon || (element.geometry?.[0]?.lon);

    if (!elementLat || !elementLon) continue;

    const distance = calculateDistanceMeters(lat, lon, elementLat, elementLon);

    pois.push({
      id: element.id,
      type: element.type,
      name: element.tags?.name,
      category: element.tags?.amenity || element.tags?.shop || element.tags?.tourism,
      distance,
      lat: elementLat,
      lon: elementLon,
      tags: element.tags || {},
    });
  }

  // Sort by distance and limit results
  return pois
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Get administrative boundaries for a location (city, county, state, etc.)
 */
export async function getAdministrativeBoundaries(
  lat: number,
  lon: number,
  adminLevels: number[] = [4, 6, 8] // 4=state, 6=county, 8=city
): Promise<AdministrativeBoundary[]> {
  const levelFilters = adminLevels.map(level => `["admin_level"="${level}"]`).join('');

  const query = `
    (
      is_in(${lat},${lon})->.a;
      (
        rel.a["boundary"="administrative"]${levelFilters};
        way.a["boundary"="administrative"]${levelFilters};
      );
    );
    out geom meta;
  `;

  const response = await queryOverpass(query);
  const boundaries: AdministrativeBoundary[] = [];

  for (const element of response.elements) {
    if (element.tags?.['boundary'] !== 'administrative') continue;

    const adminLevel = parseInt(element.tags?.['admin_level'] || '0', 10);
    if (!adminLevels.includes(adminLevel)) continue;

    boundaries.push({
      id: element.id,
      type: element.type,
      name: element.tags?.name,
      adminLevel,
      boundaryType: 'administrative',
      lat: element.lat,
      lon: element.lon,
      geometry: element.geometry,
      tags: element.tags || {},
    });
  }

  // Sort by admin level (higher level = larger area)
  return boundaries.sort((a, b) => a.adminLevel - b.adminLevel);
}

/**
 * Find restaurants near a location
 */
export async function findNearbyRestaurants(
  lat: number,
  lon: number,
  radius: number = 1000, // meters
  limit: number = 20
): Promise<NearbyPOI[]> {
  return findNearbyPOIs(lat, lon, radius, ['restaurant', 'fast_food', 'cafe', 'food_court'], limit);
}

/**
 * Get detailed information about a specific location
 */
export async function getLocationDetails(
  lat: number,
  lon: number,
  radius: number = 50 // meters
): Promise<{
  address?: {
    houseNumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  boundaries?: AdministrativeBoundary[];
  nearbyPOIs?: NearbyPOI[];
}> {
  // Get address from nearest node/way
  const addressQuery = `
    (
      node["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
      way["addr:housenumber"]["addr:street"](around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  const addressResponse = await queryOverpass(addressQuery);
  const addressElement = addressResponse.elements[0];

  const address = addressElement?.tags ? {
    houseNumber: addressElement.tags['addr:housenumber'],
    street: addressElement.tags['addr:street'],
    city: addressElement.tags['addr:city'],
    state: addressElement.tags['addr:state'],
    postcode: addressElement.tags['addr:postcode'],
    country: addressElement.tags['addr:country'],
  } : undefined;

  // Get administrative boundaries
  const boundaries = await getAdministrativeBoundaries(lat, lon);

  // Get nearby POIs
  const nearbyPOIs = await findNearbyPOIs(lat, lon, radius * 2, undefined, 10);

  return {
    address,
    boundaries,
    nearbyPOIs,
  };
}

/**
 * Search for places by name and location
 */
export async function searchPlacesByName(
  name: string,
  lat: number,
  lon: number,
  radius: number = 5000, // meters
  limit: number = 20
): Promise<NearbyPOI[]> {
  const query = `
    (
      node["name"~"${name}",i](around:${radius},${lat},${lon});
      way["name"~"${name}",i](around:${radius},${lat},${lon});
      relation["name"~"${name}",i](around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  const response = await queryOverpass(query);
  const places: NearbyPOI[] = [];

  for (const element of response.elements) {
    const elementLat = element.lat || (element.geometry?.[0]?.lat);
    const elementLon = element.lon || (element.geometry?.[0]?.lon);

    if (!elementLat || !elementLon) continue;

    const distance = calculateDistanceMeters(lat, lon, elementLat, elementLon);

    places.push({
      id: element.id,
      type: element.type,
      name: element.tags?.name,
      category: element.tags?.amenity || element.tags?.shop || element.tags?.tourism || element.tags?.leisure,
      distance,
      lat: elementLat,
      lon: elementLon,
      tags: element.tags || {},
    });
  }

  return places
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Get all Chinese restaurants in an area
 */
export async function findChineseRestaurants(
  lat: number,
  lon: number,
  radius: number = 2000, // meters
  limit: number = 50
): Promise<NearbyPOI[]> {
  const query = `
    (
      node["amenity"="restaurant"]["cuisine"~"chinese",i](around:${radius},${lat},${lon});
      way["amenity"="restaurant"]["cuisine"~"chinese",i](around:${radius},${lat},${lon});
      relation["amenity"="restaurant"]["cuisine"~"chinese",i](around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  const response = await queryOverpass(query);
  const restaurants: NearbyPOI[] = [];

  for (const element of response.elements) {
    const elementLat = element.lat || (element.geometry?.[0]?.lat);
    const elementLon = element.lon || (element.geometry?.[0]?.lon);

    if (!elementLat || !elementLon) continue;

    const distance = calculateDistanceMeters(lat, lon, elementLat, elementLon);

    restaurants.push({
      id: element.id,
      type: element.type,
      name: element.tags?.name,
      category: 'restaurant',
      distance,
      lat: elementLat,
      lon: elementLon,
      tags: element.tags || {},
    });
  }

  return restaurants
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/**
 * Calculate distance between two coordinates in meters
 */
function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get neighborhood information for a location
 */
export async function getNeighborhoodInfo(
  lat: number,
  lon: number
): Promise<{
  neighborhood?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
}> {
  const boundaries = await getAdministrativeBoundaries(lat, lon, [6, 8, 10]); // county, city, neighborhood

  const info: {
    neighborhood?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
  } = {};

  for (const boundary of boundaries) {
    const name = boundary.name;
    if (!name) continue;

    // Admin level 6 is typically county
    if (boundary.adminLevel === 6) {
      info.county = name;
    }
    // Admin level 8 is typically city
    else if (boundary.adminLevel === 8) {
      info.city = name;
    }
    // Admin level 10 is typically neighborhood
    else if (boundary.adminLevel === 10) {
      info.neighborhood = name;
    }
  }

  // Try to get state from admin level 4
  const stateBoundaries = await getAdministrativeBoundaries(lat, lon, [4]);
  if (stateBoundaries.length > 0 && stateBoundaries[0].name) {
    info.state = stateBoundaries[0].name;
  }

  // Try to get postcode
  const postcodeQuery = `
    (
      is_in(${lat},${lon})->.a;
      rel.a["boundary"="postal_code"];
    );
    out meta;
  `;

  try {
    const postcodeResponse = await queryOverpass(postcodeQuery);
    if (postcodeResponse.elements.length > 0) {
      info.postcode = postcodeResponse.elements[0].tags?.['postal_code'] || 
                     postcodeResponse.elements[0].tags?.['addr:postcode'];
    }
  } catch (error) {
    // Postcode query is optional, ignore errors
  }

  return info;
}






