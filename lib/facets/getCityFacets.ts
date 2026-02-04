/**
 * Fetch and aggregate facet data for a city's buffets.
 * Used by city hub pages to enable faceted filtering.
 */

import { cache } from 'react';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import { aggregateFacets, type AggregatedFacets } from './aggregateFacets';
import type { BuffetFacetData } from './buildFacetIndex';
import { isOpenNow } from './buildFacetIndex';
import type { AmenityKey, NearbyCategoryKey, PriceBucketKey, RatingBucketKey, ReviewCountBucketKey, DineOptionKey, StandoutTagKey } from './taxonomy';
import { AMENITY_KEYS, NEARBY_CATEGORY_KEYS, PRICE_BUCKET_KEYS, RATING_BUCKET_KEYS, REVIEW_COUNT_BUCKET_KEYS, DINE_OPTION_KEYS, STANDOUT_TAG_KEYS } from './taxonomy';
import { nearbyKey, type DistanceBucketKey } from './aggregateFacets';

// =============================================================================
// OPEN NOW CACHE (60-second TTL)
// =============================================================================

interface OpenNowCacheEntry {
  openBuffetIds: Set<string>;
  timestamp: number;
}

/** Cache for "open now" buffet IDs per city. TTL = 60 seconds. */
const openNowCache = new Map<string, OpenNowCacheEntry>();

/** TTL for open now cache in milliseconds */
const OPEN_NOW_CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Get the set of currently open buffet IDs for a city (cached).
 * Recomputes if cache is stale (> 60 seconds old).
 */
function getOpenBuffetIdsFromCache(
  citySlug: string,
  facetsByBuffetId: Map<string, BuffetFacetData>,
  allBuffetIds: string[]
): Set<string> {
  const cacheKey = `${citySlug}:openNow`;
  const now = Date.now();
  const cached = openNowCache.get(cacheKey);

  // Return cached result if still valid
  if (cached && now - cached.timestamp < OPEN_NOW_CACHE_TTL_MS) {
    return cached.openBuffetIds;
  }

  // Compute fresh open buffet IDs
  const openBuffetIds = new Set<string>();
  for (const buffetId of allBuffetIds) {
    const facetData = facetsByBuffetId.get(buffetId);
    if (facetData) {
      const isOpen = isOpenNow(facetData.parsedHours, facetData.timezone);
      if (isOpen === true) {
        openBuffetIds.add(buffetId);
      }
    }
  }

  // Update cache
  openNowCache.set(cacheKey, {
    openBuffetIds,
    timestamp: now,
  });

  // Cleanup old entries (simple LRU-like behavior)
  if (openNowCache.size > 100) {
    const oldestKey = openNowCache.keys().next().value;
    if (oldestKey) openNowCache.delete(oldestKey);
  }

  return openBuffetIds;
}

/**
 * Clear the "open now" cache for a specific city or all cities.
 * Useful for testing or forcing a refresh.
 */
export function clearOpenNowCache(citySlug?: string): void {
  if (citySlug) {
    openNowCache.delete(`${citySlug}:openNow`);
  } else {
    openNowCache.clear();
  }
}

/**
 * Get cache stats for debugging/monitoring.
 */
export function getOpenNowCacheStats(): { size: number; keys: string[] } {
  return {
    size: openNowCache.size,
    keys: Array.from(openNowCache.keys()),
  };
}

// =============================================================================
// TYPES
// =============================================================================

export interface BuffetFacetRecord {
  id: string;
  facetIndex: string | null;
}

export interface CityFacetsResult {
  /** Aggregated counts for all facets */
  aggregated: AggregatedFacets;
  /** Map of buffet ID to parsed facet data for filtering */
  facetsByBuffetId: Map<string, BuffetFacetData>;
  /** IDs of all buffets with facet data */
  allBuffetIds: string[];
}

export interface ActiveFilters {
  amenities: AmenityKey[];
  nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }>;
  neighborhoods: string[];
  /** Selected price buckets (OR logic - any match) */
  price: PriceBucketKey[];
  /** Minimum rating threshold (single value) */
  rating: RatingBucketKey | null;
  /** Minimum review count threshold (single value) */
  reviews: ReviewCountBucketKey | null;
  /** Selected dine options (AND logic - must have all) */
  dineOptions: DineOptionKey[];
  /** Selected standout tags (AND logic - must have all) */
  standoutTags: StandoutTagKey[];
  /** Show only buffets currently open (real-time check) */
  openNow: boolean;
}

/** Sort options for buffet results */
export type SortOption = 'relevance' | 'rating' | 'reviews' | 'price_low' | 'price_high';

const VALID_SORT_OPTIONS: SortOption[] = ['relevance', 'rating', 'reviews', 'price_low', 'price_high'];

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

let cachedDb: ReturnType<typeof init> | null = null;

function getDb() {
  if (cachedDb) return cachedDb;

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  cachedDb = init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: (schema as any).default || schema,
  });

  return cachedDb;
}

// =============================================================================
// FACET FETCHING
// =============================================================================

/**
 * Fetch facet indexes for all buffets in a city.
 * Only fetches id and facetIndex fields to keep payload small.
 */
async function fetchCityFacetsInternal(
  citySlug: string
): Promise<CityFacetsResult> {
  const db = getDb();

  try {
    // Query city with buffets, only fetching id and facetIndex
    const result = await db.query({
      cities: {
        $: { where: { slug: citySlug } },
        buffets: {
          $: {},
        },
      },
    });

    const city = result.cities?.[0];
    if (!city?.buffets) {
      return {
        aggregated: {
          amenityCounts: {} as Record<AmenityKey, number>,
          nearbyCounts: {},
          neighborhoodCounts: {},
          priceCounts: {} as Record<PriceBucketKey, number>,
          ratingCounts: {} as Record<RatingBucketKey, number>,
          reviewCountCounts: {} as Record<ReviewCountBucketKey, number>,
          dineOptionCounts: {} as Record<DineOptionKey, number>,
          standoutTagCounts: {} as Record<StandoutTagKey, number>,
          totalBuffets: 0,
          buffetsWithHours: 0,
        },
        facetsByBuffetId: new Map(),
        allBuffetIds: [],
      };
    }

    const buffets = city.buffets as Array<{ id: string; facetIndex?: string | null }>;
    const facetDataList: BuffetFacetData[] = [];
    const facetsByBuffetId = new Map<string, BuffetFacetData>();
    const allBuffetIds: string[] = [];

    for (const buffet of buffets) {
      allBuffetIds.push(buffet.id);

      if (buffet.facetIndex) {
        try {
          const parsed = JSON.parse(buffet.facetIndex) as BuffetFacetData;
          facetDataList.push(parsed);
          facetsByBuffetId.set(buffet.id, parsed);
        } catch {
          // Skip invalid JSON
        }
      }
    }

    const aggregated = aggregateFacets(facetDataList);

    return {
      aggregated,
      facetsByBuffetId,
      allBuffetIds,
    };
  } catch (error) {
    console.error(`[getCityFacets] Error fetching facets for ${citySlug}:`, error);
    return {
      aggregated: {
        amenityCounts: {} as Record<AmenityKey, number>,
        nearbyCounts: {},
        neighborhoodCounts: {},
        priceCounts: {} as Record<PriceBucketKey, number>,
        ratingCounts: {} as Record<RatingBucketKey, number>,
        reviewCountCounts: {} as Record<ReviewCountBucketKey, number>,
        dineOptionCounts: {} as Record<DineOptionKey, number>,
        standoutTagCounts: {} as Record<StandoutTagKey, number>,
        totalBuffets: 0,
        buffetsWithHours: 0,
      },
      facetsByBuffetId: new Map(),
      allBuffetIds: [],
    };
  }
}

/**
 * Cached facet fetcher using React cache() for request deduplication.
 */
export const getCityFacets = cache(fetchCityFacetsInternal);

// =============================================================================
// FILTER APPLICATION
// =============================================================================

/**
 * Check if any filters are active.
 */
export function hasActiveFilters(filters: ActiveFilters): boolean {
  return (
    filters.amenities.length > 0 ||
    filters.nearby.length > 0 ||
    filters.neighborhoods.length > 0 ||
    filters.price.length > 0 ||
    filters.rating !== null ||
    filters.reviews !== null ||
    filters.dineOptions.length > 0 ||
    filters.standoutTags.length > 0 ||
    filters.openNow
  );
}

/**
 * Apply filters to get matching buffet IDs.
 * Uses AND logic: buffet must match ALL selected filter categories.
 * Within categories: neighborhoods and price use OR, others use AND.
 * 
 * @param facetsByBuffetId - Map of buffet ID to facet data
 * @param allBuffetIds - All buffet IDs to filter
 * @param filters - Active filters to apply
 * @param citySlug - City slug for caching "open now" results (optional, improves performance)
 */
export function applyFilters(
  facetsByBuffetId: Map<string, BuffetFacetData>,
  allBuffetIds: string[],
  filters: ActiveFilters,
  citySlug?: string
): string[] {
  // If no filters selected, return all buffets
  if (!hasActiveFilters(filters)) {
    return allBuffetIds;
  }

  // Pre-compute open buffet IDs if openNow filter is active (uses 60s cache)
  let openBuffetIds: Set<string> | null = null;
  if (filters.openNow && citySlug) {
    openBuffetIds = getOpenBuffetIdsFromCache(citySlug, facetsByBuffetId, allBuffetIds);
  }

  return allBuffetIds.filter((buffetId) => {
    const facetData = facetsByBuffetId.get(buffetId);

    // If no facet data, exclude from filtered results
    if (!facetData) return false;

    // Check "Open now" filter first (use cached result if available)
    if (filters.openNow) {
      if (openBuffetIds) {
        // Use cached open buffet IDs
        if (!openBuffetIds.has(buffetId)) {
          return false;
        }
      } else {
        // Fallback to real-time calculation (no citySlug provided)
        const isOpen = isOpenNow(facetData.parsedHours, facetData.timezone);
        if (isOpen !== true) {
          return false;
        }
      }
    }

    // Check amenity filters (AND logic)
    for (const amenity of filters.amenities) {
      if (!facetData.amenities?.[amenity]) {
        return false;
      }
    }

    // Check nearby filters (AND logic)
    for (const { category, bucket } of filters.nearby) {
      const categoryData = facetData.nearby?.[category];
      if (!categoryData?.[bucket]) {
        return false;
      }
    }

    // Check neighborhood filter (OR logic within neighborhoods, AND with other filters)
    if (filters.neighborhoods.length > 0) {
      if (!facetData.neighborhood || !filters.neighborhoods.includes(facetData.neighborhood)) {
        return false;
      }
    }

    // Check price filter (OR logic - any selected price matches)
    if (filters.price.length > 0) {
      if (!facetData.priceBucket || !filters.price.includes(facetData.priceBucket)) {
        return false;
      }
    }

    // Check rating filter (minimum threshold)
    if (filters.rating) {
      if (!facetData.ratingBuckets?.[filters.rating]) {
        return false;
      }
    }

    // Check review count filter (minimum threshold)
    if (filters.reviews) {
      if (!facetData.reviewCountBuckets?.[filters.reviews]) {
        return false;
      }
    }

    // Check dine options (AND logic - must have all selected options)
    for (const dineOption of filters.dineOptions) {
      if (!facetData.dineOptions?.[dineOption]) {
        return false;
      }
    }

    // Check standout tags (AND logic - must have all selected tags)
    for (const tag of filters.standoutTags) {
      if (!facetData.standoutTags?.includes(tag)) {
        return false;
      }
    }

    return true;
  });
}

// =============================================================================
// URL PARAM PARSING
// =============================================================================

/**
 * Parse filter state from URL search params.
 */
export function parseFiltersFromParams(
  searchParams: Record<string, string | string[] | undefined>
): ActiveFilters {
  const amenities: AmenityKey[] = [];
  const nearby: Array<{ category: NearbyCategoryKey; bucket: DistanceBucketKey }> = [];
  const neighborhoods: string[] = [];
  const price: PriceBucketKey[] = [];
  let rating: RatingBucketKey | null = null;
  let reviews: ReviewCountBucketKey | null = null;
  const dineOptions: DineOptionKey[] = [];

  // Parse amenities (comma-separated or array)
  const amenityParam = searchParams.amenities;
  if (amenityParam) {
    const amenityList = Array.isArray(amenityParam)
      ? amenityParam
      : amenityParam.split(',');
    for (const a of amenityList) {
      const trimmed = a.trim() as AmenityKey;
      if (AMENITY_KEYS.includes(trimmed)) {
        amenities.push(trimmed);
      }
    }
  }

  // Parse nearby filters (format: category_bucket, comma-separated)
  const nearbyParam = searchParams.nearby;
  if (nearbyParam) {
    const nearbyList = Array.isArray(nearbyParam)
      ? nearbyParam
      : nearbyParam.split(',');
    for (const n of nearbyList) {
      const parts = n.trim().split('_');
      if (parts.length >= 2) {
        const bucket = parts.pop() as DistanceBucketKey;
        const category = parts.join('_') as NearbyCategoryKey;
        if (
          NEARBY_CATEGORY_KEYS.includes(category) &&
          ['within025', 'within05', 'within1'].includes(bucket)
        ) {
          nearby.push({ category, bucket });
        }
      }
    }
  }

  // Parse neighborhood filters (comma-separated slug list)
  // Support both 'neighborhoods' (plural, used by CityFilterBar) and 'neighborhood' (singular) for compatibility
  const neighborhoodParam = searchParams.neighborhoods || searchParams.neighborhood;
  if (neighborhoodParam) {
    const neighborhoodList = Array.isArray(neighborhoodParam)
      ? neighborhoodParam
      : neighborhoodParam.split(',');
    for (const n of neighborhoodList) {
      const trimmed = n.trim();
      if (trimmed) {
        neighborhoods.push(trimmed);
      }
    }
  }

  // Parse price filters (comma-separated: $,$$,$$$)
  const priceParam = searchParams.price;
  if (priceParam) {
    const priceList = Array.isArray(priceParam)
      ? priceParam
      : priceParam.split(',');
    for (const p of priceList) {
      const trimmed = p.trim();
      // Map display values to internal keys
      let priceKey: PriceBucketKey | null = null;
      if (trimmed === '$') priceKey = 'price_1';
      else if (trimmed === '$$') priceKey = 'price_2';
      else if (trimmed === '$$$') priceKey = 'price_3';
      else if (trimmed === 'unknown' || trimmed === 'price_unknown') priceKey = 'price_unknown';
      else if ((PRICE_BUCKET_KEYS as readonly string[]).includes(trimmed)) {
        priceKey = trimmed as PriceBucketKey;
      }
      if (priceKey && !price.includes(priceKey)) {
        price.push(priceKey);
      }
    }
  }

  // Parse rating filter (single value: 4.5, 4.0, 3.5)
  const ratingParam = searchParams.rating;
  if (ratingParam) {
    const ratingStr = Array.isArray(ratingParam) ? ratingParam[0] : ratingParam;
    // Map display values to internal keys
    if (ratingStr === '4.5' || ratingStr === 'rating_45') rating = 'rating_45';
    else if (ratingStr === '4.0' || ratingStr === 'rating_40') rating = 'rating_40';
    else if (ratingStr === '3.5' || ratingStr === 'rating_35') rating = 'rating_35';
  }

  // Parse reviews filter (single value: 100, 500, 1000)
  const reviewsParam = searchParams.reviews;
  if (reviewsParam) {
    const reviewsStr = Array.isArray(reviewsParam) ? reviewsParam[0] : reviewsParam;
    // Map display values to internal keys
    if (reviewsStr === '100' || reviewsStr === 'reviews_100') reviews = 'reviews_100';
    else if (reviewsStr === '500' || reviewsStr === 'reviews_500') reviews = 'reviews_500';
    else if (reviewsStr === '1000' || reviewsStr === 'reviews_1000') reviews = 'reviews_1000';
  }

  // Parse dine options (comma-separated)
  const dineParam = searchParams.dine;
  if (dineParam) {
    const dineList = Array.isArray(dineParam)
      ? dineParam
      : dineParam.split(',');
    for (const d of dineList) {
      const trimmed = d.trim().toLowerCase().replace(/-/g, '_');
      // Map display values to internal keys
      let dineKey: DineOptionKey | null = null;
      if (trimmed === 'dine_in' || trimmed === 'dinein') dineKey = 'dine_in';
      else if (trimmed === 'takeout' || trimmed === 'take_out') dineKey = 'takeout';
      else if (trimmed === 'delivery') dineKey = 'delivery';
      else if ((DINE_OPTION_KEYS as readonly string[]).includes(trimmed)) {
        dineKey = trimmed as DineOptionKey;
      }
      if (dineKey && !dineOptions.includes(dineKey)) {
        dineOptions.push(dineKey);
      }
    }
  }

  // Parse standout tags (comma-separated)
  const standoutTags: StandoutTagKey[] = [];
  const tagsParam = searchParams.tags;
  if (tagsParam) {
    const tagsList = Array.isArray(tagsParam)
      ? tagsParam
      : tagsParam.split(',');
    for (const t of tagsList) {
      const trimmed = t.trim().toLowerCase().replace(/-/g, '_');
      if ((STANDOUT_TAG_KEYS as readonly string[]).includes(trimmed)) {
        standoutTags.push(trimmed as StandoutTagKey);
      }
    }
  }

  // Parse "Open now" filter (truthy values: 1, true, yes)
  let openNow = false;
  const openNowParam = searchParams.openNow;
  if (openNowParam) {
    const openNowStr = Array.isArray(openNowParam) ? openNowParam[0] : openNowParam;
    openNow = openNowStr === '1' || openNowStr === 'true' || openNowStr === 'yes';
  }

  return { amenities, nearby, neighborhoods, price, rating, reviews, dineOptions, standoutTags, openNow };
}

/**
 * Parse sort option from URL search params.
 */
export function parseSortFromParams(
  searchParams: Record<string, string | string[] | undefined>
): SortOption {
  const sortParam = searchParams.sort;
  if (sortParam) {
    const sortStr = Array.isArray(sortParam) ? sortParam[0] : sortParam;
    if (VALID_SORT_OPTIONS.includes(sortStr as SortOption)) {
      return sortStr as SortOption;
    }
  }
  return 'relevance';
}

/** Map price bucket keys to URL-friendly display values */
const PRICE_KEY_TO_DISPLAY: Record<PriceBucketKey, string> = {
  price_1: '$',
  price_2: '$$',
  price_3: '$$$',
  price_unknown: 'unknown',
};

/** Map rating bucket keys to URL-friendly display values */
const RATING_KEY_TO_DISPLAY: Record<RatingBucketKey, string> = {
  rating_45: '4.5',
  rating_40: '4.0',
  rating_35: '3.5',
};

/** Map review count bucket keys to URL-friendly display values */
const REVIEWS_KEY_TO_DISPLAY: Record<ReviewCountBucketKey, string> = {
  reviews_100: '100',
  reviews_500: '500',
  reviews_1000: '1000',
};

/**
 * Serialize filters to URL search params string.
 */
export function serializeFiltersToParams(filters: ActiveFilters): string {
  const params = new URLSearchParams();

  if (filters.amenities.length > 0) {
    params.set('amenities', filters.amenities.join(','));
  }

  if (filters.nearby.length > 0) {
    const nearbyStrings = filters.nearby.map(
      ({ category, bucket }) => nearbyKey(category, bucket)
    );
    params.set('nearby', nearbyStrings.join(','));
  }

  if (filters.neighborhoods.length > 0) {
    params.set('neighborhoods', filters.neighborhoods.join(','));
  }

  if (filters.price.length > 0) {
    const priceStrings = filters.price.map(p => PRICE_KEY_TO_DISPLAY[p]);
    params.set('price', priceStrings.join(','));
  }

  if (filters.rating) {
    params.set('rating', RATING_KEY_TO_DISPLAY[filters.rating]);
  }

  if (filters.reviews) {
    params.set('reviews', REVIEWS_KEY_TO_DISPLAY[filters.reviews]);
  }

  if (filters.dineOptions.length > 0) {
    params.set('dine', filters.dineOptions.join(','));
  }

  if (filters.standoutTags.length > 0) {
    params.set('tags', filters.standoutTags.join(','));
  }

  if (filters.openNow) {
    params.set('openNow', '1');
  }

  return params.toString();
}
