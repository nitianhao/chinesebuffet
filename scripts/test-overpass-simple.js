// Simple JavaScript test for Overpass API
// Run with: node scripts/test-overpass-simple.js

const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

async function queryOverpass(query, endpoint = DEFAULT_OVERPASS_URL, timeout = 25) {
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

    if ('error' in data) {
      throw new Error(`Overpass API error: ${data.error?.code} - ${data.error?.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to query Overpass API: ${String(error)}`);
  }
}

async function getNeighborhoodInfo(lat, lon) {
  // Get administrative boundaries
  const query = `
    (
      is_in(${lat},${lon})->.a;
      (
        rel.a["boundary"="administrative"]["admin_level"~"^(4|6|8|10)$"];
        way.a["boundary"="administrative"]["admin_level"~"^(4|6|8|10)$"];
      );
    );
    out geom meta;
  `;

  const response = await queryOverpass(query);
  const info = {};

  for (const element of response.elements) {
    if (element.tags?.['boundary'] !== 'administrative') continue;
    const adminLevel = parseInt(element.tags?.['admin_level'] || '0', 10);
    const name = element.tags?.name;

    if (adminLevel === 4) info.state = name;
    else if (adminLevel === 6) info.county = name;
    else if (adminLevel === 8) info.city = name;
    else if (adminLevel === 10) info.neighborhood = name;
  }

  return info;
}

async function findNearbyRestaurants(lat, lon, radius = 500, limit = 10) {
  const query = `
    (
      node["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${radius},${lat},${lon});
      way["amenity"~"^(restaurant|fast_food|cafe|food_court)$"](around:${radius},${lat},${lon});
    );
    out center meta;
  `;

  const response = await queryOverpass(query);
  const restaurants = [];

  for (const element of response.elements) {
    const elementLat = element.lat || (element.geometry?.[0]?.lat);
    const elementLon = element.lon || (element.geometry?.[0]?.lon);

    if (!elementLat || !elementLon) continue;

    restaurants.push({
      id: element.id,
      name: element.tags?.name || 'Unnamed',
      category: element.tags?.amenity,
      lat: elementLat,
      lon: elementLon,
    });
  }

  return restaurants.slice(0, limit);
}

async function main() {
  // Example coordinates (San Francisco)
  const lat = 37.7749;
  const lon = -122.4194;

  console.log('Testing Overpass API integration...\n');
  console.log(`Location: ${lat}, ${lon} (San Francisco)\n`);

  try {
    // Test 1: Get neighborhood information
    console.log('1. Getting neighborhood information...');
    const neighborhoodInfo = await getNeighborhoodInfo(lat, lon);
    console.log('Neighborhood Info:', JSON.stringify(neighborhoodInfo, null, 2));
    console.log('');

    // Test 2: Find nearby restaurants
    console.log('2. Finding nearby restaurants (500m radius)...');
    const restaurants = await findNearbyRestaurants(lat, lon, 500, 10);
    console.log(`Found ${restaurants.length} restaurants:`);
    restaurants.forEach(r => {
      console.log(`  - ${r.name} (${r.category})`);
    });
    console.log('');

    console.log('✅ Overpass API test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);






