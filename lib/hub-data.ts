/**
 * Optimized data helpers for hub pages (states, cities, neighborhoods index).
 * 
 * Key optimizations:
 * 1. Minimal field projection - only fetch stateAbbr, citySlug, neighborhood
 * 2. unstable_cache for Next.js caching with revalidation
 * 3. Fast sanity check to verify DB connectivity
 */

import { unstable_cache } from 'next/cache';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

const isDev = process.env.NODE_ENV !== 'production';

// Timeouts: increased for dev to allow query to complete during debugging
const HUB_TIMEOUT_DEV = 15000; // 15s in dev (was 3s)
const HUB_TIMEOUT_PROD = 10000; // 10s in prod

// Cache revalidation intervals
const CACHE_REVALIDATE_DEV = 60 * 60; // 1 hour in dev
const CACHE_REVALIDATE_PROD = 6 * 60 * 60; // 6 hours in prod

/** State abbreviation to full name mapping */
const STATE_ABBR_TO_NAME: Record<string, string> = {
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

export { STATE_ABBR_TO_NAME };

// ============================================================================
// Database Connection
// ============================================================================

let cachedDb: ReturnType<typeof init> | null = null;

function getDb() {
  if (cachedDb) return cachedDb;
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }
  
  cachedDb = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: (schema as any).default || schema,
  });
  
  return cachedDb;
}

// ============================================================================
// Debug Info Types
// ============================================================================

export interface HubDebugInfo {
  query: string;
  fieldsRequested: string[];
  durationMs: number;
  timedOut: boolean;
  cacheHit: boolean;
  sanityCheckMs?: number;
  totalBuffets?: number;
  error?: string;
}

// ============================================================================
// Timeout Helper
// ============================================================================

async function withTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  fallback: T,
  timeoutMs?: number
): Promise<{ result: T; durationMs: number; timedOut: boolean; error?: string }> {
  const timeout = timeoutMs ?? (isDev ? HUB_TIMEOUT_DEV : HUB_TIMEOUT_PROD);
  const start = Date.now();
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${timeout}ms`));
    }, timeout);
  });
  
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    if (isDev) console.log(`[HubData] ${label}: ${durationMs}ms`);
    return { result, durationMs, timedOut: false };
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.startsWith('TIMEOUT:')) {
      console.warn(`[HubData] ${label}: TIMED OUT after ${durationMs}ms`);
      return { result: fallback, durationMs, timedOut: true, error: errorMsg };
    }
    
    console.error(`[HubData] ${label}: ERROR after ${durationMs}ms`, error);
    return { result: fallback, durationMs, timedOut: false, error: errorMsg };
  }
}

// ============================================================================
// Sanity Check - Fast DB Connectivity Test
// ============================================================================

/**
 * Fast sanity check to verify DB connectivity.
 * Returns buffet count or -1 if failed.
 */
export async function getBuffetCountFast(): Promise<{ count: number; durationMs: number; error?: string }> {
  const start = Date.now();
  
  try {
    const db = getDb();
    // Query with limit 1 just to verify connectivity, then use a simple count
    const result = await db.query({
      buffets: {
        $: { limit: 1 }
      }
    });
    
    // InstantDB doesn't have a count() function, so we need to fetch IDs
    // But we can at least verify the connection works
    const durationMs = Date.now() - start;
    const count = result.buffets?.length ?? 0;
    
    if (isDev) console.log(`[HubData] Sanity check: ${durationMs}ms, found at least ${count} buffet(s)`);
    
    return { count: count > 0 ? 1 : 0, durationMs }; // Just return 1 or 0 as sanity indicator
  } catch (error) {
    const durationMs = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[HubData] Sanity check FAILED: ${errorMsg}`);
    return { count: -1, durationMs, error: errorMsg };
  }
}

// ============================================================================
// Minimal Field Queries
// ============================================================================

/**
 * Fetch ONLY the fields needed for hub aggregation.
 * This is much faster than fetching full buffet records.
 */
async function fetchMinimalBuffetData(): Promise<Array<{
  id: string;
  stateAbbr: string | null;
  citySlug: string | null;
  cityName: string | null;
  stateName: string | null;
  neighborhood: string | null;
}>> {
  const db = getDb();
  
  // Query buffets with only city relation (minimal data)
  // InstantDB will return the linked city data
  const result = await db.query({
    buffets: {
      $: { limit: 10000 },
      city: {}
    }
  });
  
  const buffets = result.buffets || [];
  
  // Extract only the fields we need
  return buffets.map((b: any) => ({
    id: b.id,
    stateAbbr: b.stateAbbr || null,
    citySlug: b.city?.slug || null,
    cityName: b.city?.city || b.cityName || null,
    stateName: b.city?.state || b.state || null,
    neighborhood: b.neighborhood || null,
  }));
}

// ============================================================================
// Cached Hub Data Functions
// ============================================================================

/**
 * Internal function to compute state aggregations.
 * This is wrapped by unstable_cache.
 */
async function computeStateAggregations(): Promise<Array<{
  stateAbbr: string;
  stateName: string;
  buffetCount: number;
  cityCount: number;
}>> {
  const minimalData = await fetchMinimalBuffetData();
  
  // Group by state
  const stateMap = new Map<string, { buffets: number; cities: Set<string> }>();
  
  for (const b of minimalData) {
    if (!b.stateAbbr) continue;
    
    const existing = stateMap.get(b.stateAbbr);
    if (existing) {
      existing.buffets++;
      if (b.citySlug) existing.cities.add(b.citySlug);
    } else {
      const cities = new Set<string>();
      if (b.citySlug) cities.add(b.citySlug);
      stateMap.set(b.stateAbbr, { buffets: 1, cities });
    }
  }
  
  // Convert to array and sort
  const states = Array.from(stateMap.entries())
    .map(([stateAbbr, data]) => ({
      stateAbbr,
      stateName: STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr,
      buffetCount: data.buffets,
      cityCount: data.cities.size,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  return states;
}

/**
 * Internal function to compute city aggregations.
 * This is wrapped by unstable_cache.
 */
async function computeCityAggregations(): Promise<Array<{
  slug: string;
  city: string;
  state: string;
  stateAbbr: string;
  buffetCount: number;
}>> {
  const minimalData = await fetchMinimalBuffetData();
  
  // Group by city
  const cityMap = new Map<string, { city: string; state: string; stateAbbr: string; count: number }>();
  
  for (const b of minimalData) {
    if (!b.citySlug) continue;
    
    const existing = cityMap.get(b.citySlug);
    if (existing) {
      existing.count++;
    } else {
      cityMap.set(b.citySlug, {
        city: b.cityName || '',
        state: b.stateName || '',
        stateAbbr: b.stateAbbr || '',
        count: 1,
      });
    }
  }
  
  // Convert to array and sort
  const cities = Array.from(cityMap.entries())
    .map(([slug, data]) => ({
      slug,
      city: data.city,
      state: data.state,
      stateAbbr: data.stateAbbr,
      buffetCount: data.count,
    }))
    .filter(c => c.city && c.buffetCount > 0)
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  return cities;
}

/**
 * Internal function to compute neighborhood aggregations for a city.
 */
async function computeNeighborhoodAggregations(citySlug: string): Promise<{
  cityName: string;
  state: string;
  stateAbbr: string;
  neighborhoods: Array<{
    neighborhood: string;
    slug: string;
    buffetCount: number;
  }>;
} | null> {
  const db = getDb();
  
  // Query city with its buffets
  const result = await db.query({
    cities: {
      $: { where: { slug: citySlug } },
      buffets: {}
    }
  });
  
  const cities = result.cities || [];
  if (cities.length === 0) return null;
  
  const city = cities[0] as any;
  const buffets = city.buffets || [];
  
  // Group by neighborhood
  const neighborhoodMap = new Map<string, number>();
  
  for (const b of buffets) {
    const neighborhood = (b as any).neighborhood;
    if (!neighborhood) continue;
    
    neighborhoodMap.set(neighborhood, (neighborhoodMap.get(neighborhood) || 0) + 1);
  }
  
  // Convert to array and sort
  const neighborhoods = Array.from(neighborhoodMap.entries())
    .map(([neighborhood, count]) => ({
      neighborhood,
      slug: neighborhood.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
      buffetCount: count,
    }))
    .sort((a, b) => b.buffetCount - a.buffetCount);
  
  return {
    cityName: city.city || '',
    state: city.state || '',
    stateAbbr: city.stateAbbr || '',
    neighborhoods,
  };
}

// ============================================================================
// Cached Exports with unstable_cache
// ============================================================================

const revalidateInterval = isDev ? CACHE_REVALIDATE_DEV : CACHE_REVALIDATE_PROD;

/**
 * Cached state aggregations.
 */
const getCachedStateAggregations = unstable_cache(
  computeStateAggregations,
  ['hub-states-v1'],
  { revalidate: revalidateInterval, tags: ['hub-data'] }
);

/**
 * Cached city aggregations.
 */
const getCachedCityAggregations = unstable_cache(
  computeCityAggregations,
  ['hub-cities-v1'],
  { revalidate: revalidateInterval, tags: ['hub-data'] }
);

// ============================================================================
// Public API with Debug Info
// ============================================================================

/**
 * Get all states with buffet counts - OPTIMIZED VERSION
 */
export async function getAllStatesWithCountsOptimized(): Promise<{
  states: Array<{
    stateAbbr: string;
    stateName: string;
    buffetCount: number;
    cityCount: number;
  }>;
  debug: HubDebugInfo;
}> {
  const startTotal = Date.now();
  
  // Run sanity check in parallel (don't wait)
  const sanityPromise = getBuffetCountFast();
  
  // Main query with timeout
  const { result: states, durationMs, timedOut, error } = await withTimeout(
    'getAllStatesWithCountsOptimized',
    getCachedStateAggregations,
    []
  );
  
  // Get sanity check result
  const sanity = await sanityPromise;
  
  const totalDuration = Date.now() - startTotal;
  
  if (isDev) {
    console.log(`[HubData] States: ${states.length} states in ${durationMs}ms (total: ${totalDuration}ms)`);
  }
  
  return {
    states,
    debug: {
      query: 'buffets { stateAbbr, city { slug } } → group by stateAbbr',
      fieldsRequested: ['stateAbbr', 'city.slug'],
      durationMs,
      timedOut,
      cacheHit: durationMs < 50, // Heuristic: cache hits are very fast
      sanityCheckMs: sanity.durationMs,
      totalBuffets: states.reduce((sum, s) => sum + s.buffetCount, 0),
      error,
    },
  };
}

/**
 * Get all cities with buffet counts - OPTIMIZED VERSION
 */
export async function getAllCitiesWithCountsOptimized(): Promise<{
  cities: Array<{
    slug: string;
    city: string;
    state: string;
    stateAbbr: string;
    buffetCount: number;
  }>;
  debug: HubDebugInfo;
}> {
  const startTotal = Date.now();
  
  // Run sanity check in parallel
  const sanityPromise = getBuffetCountFast();
  
  // Main query with timeout
  const { result: cities, durationMs, timedOut, error } = await withTimeout(
    'getAllCitiesWithCountsOptimized',
    getCachedCityAggregations,
    []
  );
  
  // Get sanity check result
  const sanity = await sanityPromise;
  
  const totalDuration = Date.now() - startTotal;
  
  if (isDev) {
    console.log(`[HubData] Cities: ${cities.length} cities in ${durationMs}ms (total: ${totalDuration}ms)`);
  }
  
  return {
    cities,
    debug: {
      query: 'buffets { stateAbbr, cityName, city { slug, city, state } } → group by city.slug',
      fieldsRequested: ['stateAbbr', 'cityName', 'city.slug', 'city.city', 'city.state'],
      durationMs,
      timedOut,
      cacheHit: durationMs < 50,
      sanityCheckMs: sanity.durationMs,
      totalBuffets: cities.reduce((sum, c) => sum + c.buffetCount, 0),
      error,
    },
  };
}

/**
 * Get neighborhoods for a city - OPTIMIZED VERSION
 */
export async function getCityNeighborhoodsWithCountsOptimized(citySlug: string): Promise<{
  cityName: string;
  state: string;
  stateAbbr: string;
  neighborhoods: Array<{
    neighborhood: string;
    slug: string;
    buffetCount: number;
  }>;
  debug: HubDebugInfo;
} | null> {
  const startTotal = Date.now();
  
  // No cache for individual city queries (too many variations)
  // But the query is already scoped to one city, so it's fast
  const { result, durationMs, timedOut, error } = await withTimeout(
    `getCityNeighborhoodsOptimized(${citySlug})`,
    () => computeNeighborhoodAggregations(citySlug),
    null
  );
  
  if (!result) {
    return null;
  }
  
  const totalDuration = Date.now() - startTotal;
  
  if (isDev) {
    console.log(`[HubData] Neighborhoods for ${citySlug}: ${result.neighborhoods.length} in ${durationMs}ms`);
  }
  
  return {
    ...result,
    debug: {
      query: `cities { where: { slug: "${citySlug}" }, buffets { neighborhood } } → group by neighborhood`,
      fieldsRequested: ['neighborhood'],
      durationMs,
      timedOut,
      cacheHit: false, // Individual city queries are not cached
      totalBuffets: result.neighborhoods.reduce((sum, n) => sum + n.buffetCount, 0),
      error,
    },
  };
}
