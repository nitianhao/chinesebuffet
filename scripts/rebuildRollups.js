#!/usr/bin/env node

/**
 * Rebuild directory rollups for hub and detail pages.
 * 
 * Usage:
 *   node scripts/rebuildRollups.js           # Rebuild all rollups
 *   node scripts/rebuildRollups.js --hubs    # Rebuild hub rollups only (states, cities, neighborhoods)
 *   node scripts/rebuildRollups.js --states-only
 *   node scripts/rebuildRollups.js --cities-only
 *   node scripts/rebuildRollups.js --neighborhoods-only
 *   node scripts/rebuildRollups.js --state-cities-only   # State detail pages
 *   node scripts/rebuildRollups.js --city-buffets-only   # City detail pages
 *   node scripts/rebuildRollups.js --neighborhood-buffets-only   # Neighborhood detail pages
 * 
 * This script:
 * 1. Queries buffets with ONLY scalar fields (no nested relations)
 * 2. Aggregates counts in memory
 * 3. Stores results in directoryRollups table
 */

require('dotenv').config({ path: '.env.local' });

const { init, tx, id } = require('@instantdb/admin');

// ============================================================================
// Configuration
// ============================================================================

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('❌ INSTANT_ADMIN_TOKEN is required. Set it in .env.local');
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

// State abbreviation to full name mapping
const STATE_ABBR_TO_NAME = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts',
  MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

// ============================================================================
// Fetch Buffets using offset pagination to avoid response size limits
// InstantDB returns ALL fields, so we fetch in small pages
// ============================================================================

const BATCH_SIZE = 30; // Very small to avoid "string too long" error

async function fetchBuffetsForState(stateAbbr) {
  const minimalBuffets = [];
  let offset = 0;
  let iterations = 0;
  const MAX_ITERATIONS = 200; // Safety limit (30 * 200 = 6000 max per state)
  
  while (iterations < MAX_ITERATIONS) {
    iterations++;
    
    try {
      const result = await db.query({
        buffets: {
          $: { 
            where: { stateAbbr },
            limit: BATCH_SIZE,
            offset: offset,
          }
        }
      });
      
      const buffets = result.buffets || [];
      
      if (buffets.length === 0) break;
      
      // Extract data immediately to reduce memory
      for (const b of buffets) {
        minimalBuffets.push({
          id: b.id,
          slug: b.slug || null,
          name: b.name || null,
          stateAbbr: b.stateAbbr || null,
          state: b.state || null,
          cityName: b.cityName || null,
          neighborhood: b.neighborhood || null,
          // Additional fields for city buffets rollup
          address: b.address || null,
          rating: b.rating || null,
          reviewsCount: b.reviewsCount || null,
          price: b.price || null,
          lat: b.lat || null,
          lng: b.lng || null,
          phone: b.phone || null,
          website: b.website || null,
          imagesCount: b.imagesCount || null,
        });
      }
      
      // If we got fewer than batch size, we're done
      if (buffets.length < BATCH_SIZE) break;
      
      offset += BATCH_SIZE;
      
    } catch (error) {
      if (error.message.includes('string longer than')) {
        console.error(`    ⚠️ Response too large for ${stateAbbr} at offset ${offset}`);
        // Skip this batch and try next offset
        offset += BATCH_SIZE;
        continue;
      }
      console.error(`    ❌ Error fetching ${stateAbbr}:`, error.message);
      break;
    }
  }
  
  return minimalBuffets;
}

async function fetchBuffetsMinimal() {
  console.log('📊 Fetching buffets by state (offset pagination)...');
  console.log(`   Batch size: ${BATCH_SIZE} buffets per request`);
  const start = Date.now();
  
  const states = Object.keys(STATE_ABBR_TO_NAME);
  let allBuffets = [];
  let processedStates = 0;
  
  for (const stateAbbr of states) {
    const stateBuffets = await fetchBuffetsForState(stateAbbr);
    
    if (stateBuffets.length > 0) {
      allBuffets = allBuffets.concat(stateBuffets);
      console.log(`  ${stateAbbr}: ${stateBuffets.length} buffets`);
    }
    
    processedStates++;
  }
  
  console.log(`  Processed all ${processedStates} states`);
  
  const duration = Date.now() - start;
  console.log(`✅ Fetched ${allBuffets.length} buffets in ${(duration/1000).toFixed(1)}s`);
  
  return allBuffets;
}

// ============================================================================
// Fetch Cities (for city name lookup) - with pagination
// ============================================================================

async function fetchCities() {
  console.log('📊 Fetching cities (paginated)...');
  const start = Date.now();
  
  const cityMap = new Map();
  let offset = 0;
  const PAGE_SIZE = 200;
  
  while (true) {
    try {
      const result = await db.query({
        cities: {
          $: { limit: PAGE_SIZE, offset }
        }
      });
      
      const cities = result.cities || [];
      
      if (cities.length === 0) break;
      
      // Add to map
      for (const city of cities) {
        cityMap.set(city.slug, {
          city: city.city,
          state: city.state,
          stateAbbr: city.stateAbbr,
        });
      }
      
      if (cities.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
      
    } catch (error) {
      console.error(`  ❌ Error fetching cities at offset ${offset}:`, error.message);
      break;
    }
  }
  
  const duration = Date.now() - start;
  console.log(`✅ Fetched ${cityMap.size} cities in ${duration}ms`);
  
  return cityMap;
}

// ============================================================================
// Build States Rollup
// ============================================================================

async function buildStatesRollup(buffets) {
  console.log('🔨 Building states rollup...');
  
  // Group by stateAbbr
  const stateMap = new Map();
  
  for (const b of buffets) {
    const stateAbbr = b.stateAbbr;
    if (!stateAbbr) continue;
    
    const cityKey = b.cityName ? `${b.cityName}|${stateAbbr}` : null;
    
    if (stateMap.has(stateAbbr)) {
      const data = stateMap.get(stateAbbr);
      data.buffetCount++;
      if (cityKey) data.cities.add(cityKey);
    } else {
      const cities = new Set();
      if (cityKey) cities.add(cityKey);
      stateMap.set(stateAbbr, { buffetCount: 1, cities });
    }
  }
  
  // Convert to array
  const states = Array.from(stateMap.entries())
    .map(([stateAbbr, data]) => ({
      stateAbbr,
      stateName: STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
      buffetCount: data.buffetCount,
      cityCount: data.cities.size,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  console.log(`✅ States rollup: ${states.length} states`);
  return states;
}

// ============================================================================
// Build Cities Rollup
// ============================================================================

async function buildCitiesRollup(buffets, cityMap) {
  console.log('🔨 Building cities rollup...');
  
  // We need to associate buffets with city slugs
  // Since we don't have city.slug on buffet, we need to build it from cityName + stateAbbr
  const cityCountMap = new Map();
  
  for (const b of buffets) {
    if (!b.cityName || !b.stateAbbr) continue;
    
    // Build city slug: "city-name-st" format
    const citySlug = `${b.cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${b.stateAbbr.toLowerCase()}`;
    
    if (cityCountMap.has(citySlug)) {
      cityCountMap.get(citySlug).buffetCount++;
    } else {
      // Try to get city info from cityMap, or use buffet's denormalized data
      const cityInfo = cityMap.get(citySlug) || {
        city: b.cityName,
        state: b.state || STATE_ABBR_TO_NAME[b.stateAbbr] || b.stateAbbr,
        stateAbbr: b.stateAbbr,
      };
      
      cityCountMap.set(citySlug, {
        slug: citySlug,
        city: cityInfo.city,
        state: cityInfo.state,
        stateAbbr: cityInfo.stateAbbr,
        buffetCount: 1,
      });
    }
  }
  
  // Convert to array
  const cities = Array.from(cityCountMap.values())
    .filter(c => c.buffetCount > 0 && c.city)
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  console.log(`✅ Cities rollup: ${cities.length} cities`);
  return cities;
}

// ============================================================================
// Build City Neighborhoods Rollups
// ============================================================================

async function buildCityNeighborhoodsRollups(buffets, cityMap) {
  console.log('🔨 Building city neighborhoods rollups...');
  
  // Group buffets by city slug, then by neighborhood
  const cityNeighborhoodMap = new Map();
  
  for (const b of buffets) {
    if (!b.cityName || !b.stateAbbr) continue;
    
    const citySlug = `${b.cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${b.stateAbbr.toLowerCase()}`;
    const neighborhood = b.neighborhood;
    
    if (!cityNeighborhoodMap.has(citySlug)) {
      const cityInfo = cityMap.get(citySlug) || {
        city: b.cityName,
        state: b.state || STATE_ABBR_TO_NAME[b.stateAbbr] || b.stateAbbr,
        stateAbbr: b.stateAbbr,
      };
      
      cityNeighborhoodMap.set(citySlug, {
        cityName: cityInfo.city,
        state: cityInfo.state,
        stateAbbr: cityInfo.stateAbbr,
        neighborhoods: new Map(),
      });
    }
    
    const cityData = cityNeighborhoodMap.get(citySlug);
    
    if (neighborhood) {
      const neighborhoodSlug = neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      
      if (cityData.neighborhoods.has(neighborhoodSlug)) {
        cityData.neighborhoods.get(neighborhoodSlug).buffetCount++;
      } else {
        cityData.neighborhoods.set(neighborhoodSlug, {
          neighborhood,
          slug: neighborhoodSlug,
          buffetCount: 1,
        });
      }
    }
  }
  
  // Convert to final format
  const rollups = [];
  
  for (const [citySlug, data] of cityNeighborhoodMap) {
    const neighborhoods = Array.from(data.neighborhoods.values())
      .sort((a, b) => b.buffetCount - a.buffetCount);
    
    // Only create rollup if there are neighborhoods
    if (neighborhoods.length > 0) {
      rollups.push({
        key: citySlug,
        data: {
          cityName: data.cityName,
          state: data.state,
          stateAbbr: data.stateAbbr,
          neighborhoods,
        },
      });
    }
  }
  
  console.log(`✅ City neighborhoods rollups: ${rollups.length} cities with neighborhoods`);
  return rollups;
}

// ============================================================================
// Build State Cities Rollups (for /chinese-buffets/states/[state])
// ============================================================================

async function buildStateCitiesRollups(buffets, cityMap) {
  console.log('🔨 Building state cities rollups...');
  
  // Group buffets by state, then by city
  const stateDataMap = new Map();
  
  for (const b of buffets) {
    if (!b.stateAbbr || !b.cityName) continue;
    
    const stateAbbr = b.stateAbbr.toUpperCase();
    const citySlug = `${b.cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${b.stateAbbr.toLowerCase()}`;
    
    if (!stateDataMap.has(stateAbbr)) {
      stateDataMap.set(stateAbbr, {
        stateAbbr,
        stateName: STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
        cities: new Map(),
        buffetCount: 0,
      });
    }
    
    const stateData = stateDataMap.get(stateAbbr);
    stateData.buffetCount++;
    
    if (!stateData.cities.has(citySlug)) {
      const cityInfo = cityMap.get(citySlug) || {
        city: b.cityName,
        state: b.state || STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
        stateAbbr: stateAbbr,
      };
      
      stateData.cities.set(citySlug, {
        citySlug,
        cityName: cityInfo.city,
        stateAbbr,
        buffetCount: 0,
        neighborhoods: new Set(),
      });
    }
    
    const cityData = stateData.cities.get(citySlug);
    cityData.buffetCount++;
    if (b.neighborhood) {
      cityData.neighborhoods.add(b.neighborhood);
    }
  }
  
  // Convert to rollups
  const rollups = [];
  
  for (const [stateAbbr, stateData] of stateDataMap) {
    const cities = Array.from(stateData.cities.values())
      .map(c => ({
        citySlug: c.citySlug,
        cityName: c.cityName,
        stateAbbr: c.stateAbbr,
        buffetCount: c.buffetCount,
        neighborhoodCount: c.neighborhoods.size,
      }))
      .sort((a, b) => b.buffetCount - a.buffetCount);
    
    rollups.push({
      key: stateAbbr.toLowerCase(),
      data: {
        stateAbbr,
        stateName: stateData.stateName,
        buffetCount: stateData.buffetCount,
        cityCount: cities.length,
        cities,
      },
    });
  }
  
  console.log(`✅ State cities rollups: ${rollups.length} states`);
  return rollups;
}

// ============================================================================
// Build City Buffets Rollups (for /chinese-buffets/[city-state])
// ============================================================================

async function buildCityBuffetsRollups(buffets, cityMap) {
  console.log('🔨 Building city buffets rollups...');
  
  // Group buffets by city slug
  const cityDataMap = new Map();
  
  for (const b of buffets) {
    if (!b.cityName || !b.stateAbbr) continue;
    
    const citySlug = `${b.cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${b.stateAbbr.toLowerCase()}`;
    
    if (!cityDataMap.has(citySlug)) {
      const cityInfo = cityMap.get(citySlug) || {
        city: b.cityName,
        state: b.state || STATE_ABBR_TO_NAME[b.stateAbbr] || b.stateAbbr,
        stateAbbr: b.stateAbbr,
        population: null,
      };
      
      cityDataMap.set(citySlug, {
        citySlug,
        cityName: cityInfo.city,
        state: cityInfo.state,
        stateAbbr: cityInfo.stateAbbr,
        population: cityInfo.population || null,
        buffets: [],
        neighborhoods: new Map(),
      });
    }
    
    const cityData = cityDataMap.get(citySlug);
    
    // Add buffet with minimal fields
    cityData.buffets.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      address: b.address,
      neighborhood: b.neighborhood,
      rating: b.rating,
      reviewsCount: b.reviewsCount,
      price: b.price,
      lat: b.lat,
      lng: b.lng,
      phone: b.phone,
      website: b.website,
      imagesCount: b.imagesCount,
    });
    
    // Track neighborhoods
    if (b.neighborhood) {
      const neighborhoodSlug = b.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      if (cityData.neighborhoods.has(neighborhoodSlug)) {
        cityData.neighborhoods.get(neighborhoodSlug).buffetCount++;
      } else {
        cityData.neighborhoods.set(neighborhoodSlug, {
          neighborhood: b.neighborhood,
          slug: neighborhoodSlug,
          buffetCount: 1,
        });
      }
    }
  }
  
  // Convert to rollups
  const rollups = [];
  
  for (const [citySlug, cityData] of cityDataMap) {
    // Sort buffets by rating desc, then name
    const sortedBuffets = cityData.buffets
      .sort((a, b) => {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        return (a.name || '').localeCompare(b.name || '');
      });
    
    const neighborhoods = Array.from(cityData.neighborhoods.values())
      .sort((a, b) => b.buffetCount - a.buffetCount);
    
    rollups.push({
      key: citySlug,
      data: {
        citySlug,
        cityName: cityData.cityName,
        state: cityData.state,
        stateAbbr: cityData.stateAbbr,
        population: cityData.population,
        buffetCount: sortedBuffets.length,
        buffets: sortedBuffets,
        neighborhoods,
      },
    });
  }
  
  console.log(`✅ City buffets rollups: ${rollups.length} cities`);
  return rollups;
}

// ============================================================================
// Build Neighborhood Buffets Rollups (for /chinese-buffets/[city-state]/neighborhoods/[neighborhood])
// ============================================================================

async function buildNeighborhoodBuffetsRollups(buffets, cityMap) {
  console.log('🔨 Building neighborhood buffets rollups...');
  
  // Group buffets by city slug + neighborhood
  const neighborhoodDataMap = new Map();
  
  for (const b of buffets) {
    if (!b.cityName || !b.stateAbbr || !b.neighborhood) continue;
    
    const citySlug = `${b.cityName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${b.stateAbbr.toLowerCase()}`;
    const neighborhoodSlug = b.neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
    const rollupKey = `${citySlug}/${neighborhoodSlug}`;
    
    if (!neighborhoodDataMap.has(rollupKey)) {
      const cityInfo = cityMap.get(citySlug) || {
        city: b.cityName,
        state: b.state || STATE_ABBR_TO_NAME[b.stateAbbr] || b.stateAbbr,
        stateAbbr: b.stateAbbr,
      };
      
      neighborhoodDataMap.set(rollupKey, {
        neighborhoodSlug,
        neighborhoodName: b.neighborhood,
        citySlug,
        cityName: cityInfo.city,
        state: cityInfo.state,
        stateAbbr: cityInfo.stateAbbr,
        buffets: [],
      });
    }
    
    const neighborhoodData = neighborhoodDataMap.get(rollupKey);
    
    // Add buffet with minimal fields
    neighborhoodData.buffets.push({
      id: b.id,
      slug: b.slug,
      name: b.name,
      address: b.address,
      neighborhood: b.neighborhood,
      rating: b.rating,
      reviewsCount: b.reviewsCount,
      price: b.price,
      lat: b.lat,
      lng: b.lng,
      phone: b.phone,
      website: b.website,
      imagesCount: b.imagesCount,
    });
  }
  
  // Convert to rollups
  const rollups = [];
  
  for (const [rollupKey, neighborhoodData] of neighborhoodDataMap) {
    // Sort buffets by rating desc, then name
    const sortedBuffets = neighborhoodData.buffets
      .sort((a, b) => {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
        return (a.name || '').localeCompare(b.name || '');
      });
    
    rollups.push({
      key: rollupKey,
      data: {
        neighborhoodSlug: neighborhoodData.neighborhoodSlug,
        neighborhoodName: neighborhoodData.neighborhoodName,
        citySlug: neighborhoodData.citySlug,
        cityName: neighborhoodData.cityName,
        state: neighborhoodData.state,
        stateAbbr: neighborhoodData.stateAbbr,
        buffetCount: sortedBuffets.length,
        buffets: sortedBuffets,
      },
    });
  }
  
  console.log(`✅ Neighborhood buffets rollups: ${rollups.length} neighborhoods`);
  return rollups;
}

// ============================================================================
// Save Rollup to Database
// ============================================================================

async function saveRollup(type, key, data) {
  const rollupId = key ? `rollup-${type}-${key}` : `rollup-${type}`;
  
  // Calculate total buffet count based on rollup type
  let totalCount = 0;
  if (Array.isArray(data)) {
    // For states, cities, stateCities rollups
    totalCount = data.reduce((sum, d) => sum + (d.buffetCount || 0), 0);
  } else if (data.buffets) {
    // For cityBuffets and neighborhoodBuffets rollups
    totalCount = data.buffets.length;
  } else if (data.neighborhoods) {
    // For cityNeighborhoods rollups
    totalCount = data.neighborhoods.reduce((sum, n) => sum + n.buffetCount, 0);
  }
  
  try {
    // Delete existing rollup with same type/key
    const existing = await db.query({
      directoryRollups: {
        $: { where: { type, ...(key ? { key } : {}) }, limit: 10 }
      }
    });
    
    const toDelete = (existing.directoryRollups || []).filter(r => {
      if (key) return r.key === key;
      return !r.key || r.key === '' || r.key === 'null';
    });
    
    if (toDelete.length > 0) {
      console.log(`  Deleting ${toDelete.length} existing rollup(s)...`);
      await db.transact(toDelete.map(r => tx.directoryRollups[r.id].delete()));
    }
    
    // Create new rollup
    await db.transact([
      tx.directoryRollups[id()].update({
        type,
        key: key || null,
        data: JSON.stringify(data),
        updatedAt: new Date().toISOString(),
        buffetCount: totalCount,
      })
    ]);
    
    console.log(`  ✅ Saved ${type}${key ? `/${key}` : ''} rollup (${totalCount} buffets)`);
  } catch (error) {
    console.error(`  ❌ Error saving ${type}${key ? `/${key}` : ''} rollup:`, error.message);
    throw error;
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const hubsOnly = args.includes('--hubs');
  const statesOnly = args.includes('--states-only');
  const citiesOnly = args.includes('--cities-only');
  const neighborhoodsOnly = args.includes('--neighborhoods-only');
  const stateCitiesOnly = args.includes('--state-cities-only');
  const cityBuffetsOnly = args.includes('--city-buffets-only');
  const neighborhoodBuffetsOnly = args.includes('--neighborhood-buffets-only');
  
  // Determine what to build
  const hasSpecificFlag = statesOnly || citiesOnly || neighborhoodsOnly || stateCitiesOnly || cityBuffetsOnly || neighborhoodBuffetsOnly || hubsOnly;
  const buildAll = !hasSpecificFlag;
  
  // Hub pages rollups
  const buildStates = buildAll || hubsOnly || statesOnly;
  const buildCities = buildAll || hubsOnly || citiesOnly;
  const buildNeighborhoods = buildAll || hubsOnly || neighborhoodsOnly;
  
  // Detail pages rollups
  const buildStateCities = buildAll || stateCitiesOnly;
  const buildCityBuffets = buildAll || cityBuffetsOnly;
  const buildNeighborhoodBuffets = buildAll || neighborhoodBuffetsOnly;
  
  console.log('');
  console.log('🚀 Rebuilding directory rollups...');
  console.log('');
  
  const totalStart = Date.now();
  
  try {
    // Fetch data
    const buffets = await fetchBuffetsMinimal();
    const cityMap = await fetchCities();
    
    console.log('');
    
    // ========== HUB PAGE ROLLUPS ==========
    
    // Build and save states rollup
    if (buildStates) {
      const states = await buildStatesRollup(buffets);
      await saveRollup('states', null, states);
      console.log('');
    }
    
    // Build and save cities rollup
    if (buildCities) {
      const cities = await buildCitiesRollup(buffets, cityMap);
      await saveRollup('cities', null, cities);
      console.log('');
    }
    
    // Build and save city neighborhoods rollups
    if (buildNeighborhoods) {
      const neighborhoodRollups = await buildCityNeighborhoodsRollups(buffets, cityMap);
      
      console.log(`  Saving ${neighborhoodRollups.length} city neighborhood rollups...`);
      
      let saved = 0;
      for (const rollup of neighborhoodRollups) {
        try {
          await saveRollup('cityNeighborhoods', rollup.key, rollup.data);
          saved++;
        } catch (error) {
          console.error(`  ❌ Failed to save ${rollup.key}:`, error.message);
        }
        
        // Progress indicator
        if (saved % 50 === 0) {
          console.log(`  Progress: ${saved}/${neighborhoodRollups.length}`);
        }
      }
      
      console.log(`✅ Saved ${saved}/${neighborhoodRollups.length} neighborhood rollups`);
      console.log('');
    }
    
    // ========== DETAIL PAGE ROLLUPS ==========
    
    // Build and save state cities rollups (for /chinese-buffets/states/[state])
    if (buildStateCities) {
      const stateCitiesRollups = await buildStateCitiesRollups(buffets, cityMap);
      
      console.log(`  Saving ${stateCitiesRollups.length} state cities rollups...`);
      
      let saved = 0;
      for (const rollup of stateCitiesRollups) {
        try {
          await saveRollup('stateCities', rollup.key, rollup.data);
          saved++;
        } catch (error) {
          console.error(`  ❌ Failed to save stateCities/${rollup.key}:`, error.message);
        }
      }
      
      console.log(`✅ Saved ${saved}/${stateCitiesRollups.length} state cities rollups`);
      console.log('');
    }
    
    // Build and save city buffets rollups (for /chinese-buffets/[city-state])
    if (buildCityBuffets) {
      const cityBuffetsRollups = await buildCityBuffetsRollups(buffets, cityMap);
      
      console.log(`  Saving ${cityBuffetsRollups.length} city buffets rollups...`);
      
      let saved = 0;
      for (const rollup of cityBuffetsRollups) {
        try {
          await saveRollup('cityBuffets', rollup.key, rollup.data);
          saved++;
        } catch (error) {
          console.error(`  ❌ Failed to save cityBuffets/${rollup.key}:`, error.message);
        }
        
        // Progress indicator
        if (saved % 100 === 0) {
          console.log(`  Progress: ${saved}/${cityBuffetsRollups.length}`);
        }
      }
      
      console.log(`✅ Saved ${saved}/${cityBuffetsRollups.length} city buffets rollups`);
      console.log('');
    }
    
    // Build and save neighborhood buffets rollups (for /chinese-buffets/[city-state]/neighborhoods/[neighborhood])
    if (buildNeighborhoodBuffets) {
      const neighborhoodBuffetsRollups = await buildNeighborhoodBuffetsRollups(buffets, cityMap);
      
      console.log(`  Saving ${neighborhoodBuffetsRollups.length} neighborhood buffets rollups...`);
      
      let saved = 0;
      for (const rollup of neighborhoodBuffetsRollups) {
        try {
          await saveRollup('neighborhoodBuffets', rollup.key, rollup.data);
          saved++;
        } catch (error) {
          console.error(`  ❌ Failed to save neighborhoodBuffets/${rollup.key}:`, error.message);
        }
        
        // Progress indicator
        if (saved % 200 === 0) {
          console.log(`  Progress: ${saved}/${neighborhoodBuffetsRollups.length}`);
        }
      }
      
      console.log(`✅ Saved ${saved}/${neighborhoodBuffetsRollups.length} neighborhood buffets rollups`);
      console.log('');
    }
    
    const totalDuration = Date.now() - totalStart;
    console.log('');
    console.log(`✅ All rollups rebuilt in ${(totalDuration / 1000).toFixed(1)}s`);
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('❌ Rebuild failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main().then(() => process.exit(0));
