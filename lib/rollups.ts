/**
 * Precomputed directory rollups for hub pages.
 * 
 * Rollups are stored in the `directoryRollups` table and rebuilt via:
 *   node scripts/rebuildRollups.js
 * 
 * This eliminates expensive aggregation queries on every page request.
 */

import { cache } from 'react';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import { perfMark, perfMs, queryDb, PERF_ENABLED } from '@/lib/perf';
import type { AggregatedFacets } from '@/lib/facets/aggregateFacets';

// ============================================================================
// Types
// ============================================================================

export type RollupType = 'states' | 'cities' | 'cityNeighborhoods' | 'stateCities' | 'cityBuffets' | 'neighborhoodBuffets' | 'cityFacets';

export interface StateRollupRow {
  stateAbbr: string;
  stateName: string;
  buffetCount: number;
  cityCount: number;
}

export interface CityRollupRow {
  slug: string;
  city: string;
  state: string;
  stateAbbr: string;
  buffetCount: number;
}

export interface NeighborhoodRollupRow {
  neighborhood: string;
  slug: string;
  buffetCount: number;
}

export interface CityNeighborhoodsRollup {
  cityName: string;
  state: string;
  stateAbbr: string;
  neighborhoods: NeighborhoodRollupRow[];
}

// New rollup types for state and city detail pages
export interface StateCityRow {
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  buffetCount: number;
  neighborhoodCount: number;
}

export interface StateCitiesRollup {
  stateAbbr: string;
  stateName: string;
  buffetCount: number;
  cityCount: number;
  cities: StateCityRow[];
}

export interface CityBuffetRow {
  id: string;
  slug: string;
  name: string;
  address: string;
  neighborhood: string | null;
  rating: number | null;
  reviewsCount: number | null;
  price: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  imagesCount: number | null;
}

export interface CityBuffetsRollup {
  citySlug: string;
  cityName: string;
  state: string;
  stateAbbr: string;
  population: number | null;
  buffetCount: number;
  buffets: CityBuffetRow[];
  neighborhoods: NeighborhoodRollupRow[];
}

export interface NeighborhoodBuffetsRollup {
  neighborhoodSlug: string;
  neighborhoodName: string;
  citySlug: string;
  cityName: string;
  state: string;
  stateAbbr: string;
  buffetCount: number;
  buffets: CityBuffetRow[];
}

// ============================================================================
// State name mapping
// ============================================================================

export const STATE_ABBR_TO_NAME: Record<string, string> = {
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
// Database Connection (for reading rollups only)
// ============================================================================

let cachedDb: ReturnType<typeof init> | null = null;

// Override InstantDB's default `cache: "no-store"` to allow SSG.
// Page-level ISR is configured via `export const revalidate` in each route file.
const rollupFetchOpts: RequestInit = { cache: 'force-cache' };

/** Returns null when INSTANT_ADMIN_TOKEN is missing so pages never 503 during build/runtime. */
function getDb(): ReturnType<typeof init> | null {
  if (cachedDb) return cachedDb;

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    return null;
  }

  try {
    cachedDb = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: (schema as any).default || schema,
    });
    return cachedDb;
  } catch {
    return null;
  }
}

// ============================================================================
// Rollup Reader (cached with React cache)
// ============================================================================

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch a rollup from the database.
 * Uses React cache() for request deduplication.
 */
async function fetchRollupInternal(
  type: RollupType,
  key: string | null
): Promise<{
  data: any;
  updatedAt: string | null;
  found: boolean;
  stale: boolean;
}> {
  const tTotal = perfMark();
  const db = getDb();
  if (!db) {
    return { data: null, updatedAt: null, found: false, stale: true };
  }
  const label = `rollup:${type}/${key ?? 'global'}`;

  try {
    // Build query based on type and key
    const whereClause: any = { type };
    if (key !== null) {
      whereClause.key = key;
    }
    
    const result = await queryDb(
      db,
      { directoryRollups: { $: { where: whereClause, limit: 1 } } },
      { fetchOpts: rollupFetchOpts },
      label,
    );
    
    const rollups = result.directoryRollups || [];
    
    if (rollups.length === 0) {
      // Try without key constraint for global rollups
      if (key === null) {
        const globalResult = await queryDb(
          db,
          { directoryRollups: { $: { where: { type }, limit: 10 } } },
          { fetchOpts: rollupFetchOpts },
          `${label}:fallback`,
        );
        const globalRollups = (globalResult.directoryRollups || []).filter(
          (r: any) => !r.key || r.key === '' || r.key === 'null'
        );
        if (globalRollups.length > 0) {
          const rollup = globalRollups[0] as any;
          const updatedAt = rollup.updatedAt || null;
          const isStale = updatedAt 
            ? Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS 
            : true;
          const data = rollup.data ? JSON.parse(rollup.data) : null;
          return { data, updatedAt, found: true, stale: isStale };
        }
      }
      
      return { data: null, updatedAt: null, found: false, stale: true };
    }
    
    const rollup = rollups[0] as any;
    const updatedAt = rollup.updatedAt || null;
    const isStale = updatedAt 
      ? Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS 
      : true;
    
    const data = rollup.data ? JSON.parse(rollup.data) : null;

    return { data, updatedAt, found: true, stale: isStale };
  } catch (error) {
    const totalMs = perfMs(tTotal);
    console.error(`[Rollups] Error fetching rollup ${type}/${key} (${totalMs}ms):`, error);
    return { data: null, updatedAt: null, found: false, stale: true };
  }
}

/**
 * Cached rollup fetcher using React cache() for request deduplication.
 */
export const getRollup = cache(fetchRollupInternal);

// ============================================================================
// Public API for Hub Pages
// ============================================================================

/**
 * Get states rollup for /chinese-buffets/states
 */
export async function getStatesRollup(): Promise<{
  states: StateRollupRow[];
}> {
  const result = await getRollup('states', null);
  const states = (result.data as StateRollupRow[]) || [];
  return { states };
}

/**
 * Get cities rollup for /chinese-buffets/cities
 */
export async function getCitiesRollup(): Promise<{
  cities: CityRollupRow[];
}> {
  const result = await getRollup('cities', null);
  const cities = (result.data as CityRollupRow[]) || [];
  return { cities };
}

/**
 * Get city neighborhoods rollup for /chinese-buffets/[city-state]/neighborhoods
 */
export async function getCityNeighborhoodsRollup(citySlug: string): Promise<{
  data: CityNeighborhoodsRollup | null;
}> {
  const result = await getRollup('cityNeighborhoods', citySlug);
  const data = result.data as CityNeighborhoodsRollup | null;
  return { data };
}

/**
 * Get state cities rollup for /chinese-buffets/states/[state]
 */
export async function getStateCitiesRollup(stateAbbr: string): Promise<{
  data: StateCitiesRollup | null;
}> {
  const result = await getRollup('stateCities', stateAbbr.toLowerCase());
  const data = result.data as StateCitiesRollup | null;
  return { data };
}

/**
 * Get city buffets rollup for /chinese-buffets/[city-state]
 */
export async function getCityBuffetsRollup(citySlug: string): Promise<{
  data: CityBuffetsRollup | null;
}> {
  const result = await getRollup('cityBuffets', citySlug);
  const data = result.data as CityBuffetsRollup | null;
  return { data };
}

/**
 * Get neighborhood buffets rollup for /chinese-buffets/[city-state]/neighborhoods/[neighborhood]
 */
export async function getNeighborhoodBuffetsRollup(
  citySlug: string,
  neighborhoodSlug: string,
  options?: { limit?: number; offset?: number; topRatedLimit?: number }
): Promise<{
  data: NeighborhoodBuffetsRollup | null;
  topRatedBuffets?: CityBuffetRow[];
}> {
  const rollupKey = `${citySlug}/${neighborhoodSlug}`;
  const result = await getRollup('neighborhoodBuffets', rollupKey);
  const rollupData = result.data as NeighborhoodBuffetsRollup | null;
  if (!rollupData) {
    return { data: rollupData };
  }

  const topRatedLimit = Math.max(0, options?.topRatedLimit ?? 0);
  const topRatedBuffets = topRatedLimit
    ? [...rollupData.buffets]
        .filter((buffet) => buffet.rating != null)
        .sort((a, b) => {
          const ratingDiff = (b.rating || 0) - (a.rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return (b.reviewsCount || 0) - (a.reviewsCount || 0);
        })
        .slice(0, topRatedLimit)
    : undefined;

  if (!options || options.limit == null) {
    return { data: rollupData, topRatedBuffets };
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit);
  const pagedBuffets = rollupData.buffets.slice(offset, offset + limit);

  return {
    data: {
      ...rollupData,
      buffets: pagedBuffets,
    },
    topRatedBuffets,
  };
}

/**
 * Get pre-aggregated facets rollup for /api/facets/city.
 *
 * This replaces the slow InstantDB cities→buffets query (21MB / 34s)
 * with a single small rollup read (~5KB).
 *
 * Rollup is generated by: node scripts/rebuildRollups.js --city-facets-only
 */
export async function getCityFacetsRollup(citySlug: string): Promise<{
  data: AggregatedFacets | null;
}> {
  const result = await getRollup('cityFacets', citySlug);
  const data = result.data as AggregatedFacets | null;
  return { data };
}
