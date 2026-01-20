// Example script demonstrating Overpass API usage
// Run with: npx tsx scripts/test-overpass-api.ts

import {
  findNearbyPOIs,
  findNearbyRestaurants,
  findChineseRestaurants,
  getAdministrativeBoundaries,
  getLocationDetails,
  getNeighborhoodInfo,
  searchPlacesByName,
} from '../lib/overpass-api';

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

    // Test 2: Get administrative boundaries
    console.log('2. Getting administrative boundaries...');
    const boundaries = await getAdministrativeBoundaries(lat, lon);
    console.log(`Found ${boundaries.length} administrative boundaries:`);
    boundaries.forEach(b => {
      console.log(`  - ${b.name} (Admin Level ${b.adminLevel})`);
    });
    console.log('');

    // Test 3: Find nearby restaurants
    console.log('3. Finding nearby restaurants (500m radius)...');
    const restaurants = await findNearbyRestaurants(lat, lon, 500, 10);
    console.log(`Found ${restaurants.length} restaurants:`);
    restaurants.forEach(r => {
      console.log(`  - ${r.name || 'Unnamed'} (${Math.round(r.distance)}m away)`);
    });
    console.log('');

    // Test 4: Find Chinese restaurants
    console.log('4. Finding Chinese restaurants (1000m radius)...');
    const chineseRestaurants = await findChineseRestaurants(lat, lon, 1000, 10);
    console.log(`Found ${chineseRestaurants.length} Chinese restaurants:`);
    chineseRestaurants.forEach(r => {
      console.log(`  - ${r.name || 'Unnamed'} (${Math.round(r.distance)}m away)`);
    });
    console.log('');

    // Test 5: Find nearby POIs
    console.log('5. Finding nearby POIs (cafes, parks, etc.)...');
    const pois = await findNearbyPOIs(lat, lon, 500, ['cafe', 'park'], 10);
    console.log(`Found ${pois.length} POIs:`);
    pois.forEach(poi => {
      console.log(`  - ${poi.name || 'Unnamed'} (${poi.category}) - ${Math.round(poi.distance)}m away`);
    });
    console.log('');

    // Test 6: Get detailed location information
    console.log('6. Getting detailed location information...');
    const locationDetails = await getLocationDetails(lat, lon, 100);
    console.log('Location Details:', JSON.stringify(locationDetails, null, 2));
    console.log('');

    // Test 7: Search for places by name
    console.log('7. Searching for "Golden Gate"...');
    const searchResults = await searchPlacesByName('Golden Gate', lat, lon, 5000, 5);
    console.log(`Found ${searchResults.length} results:`);
    searchResults.forEach(result => {
      console.log(`  - ${result.name || 'Unnamed'} (${result.category || 'unknown'}) - ${Math.round(result.distance)}m away`);
    });

  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

export { main };

