/**
 * Aggregate facet data across multiple buffets for filter counts.
 *
 * This module takes an array of BuffetFacetData objects and produces
 * counts for each facet, enabling UI filter displays like:
 * - "Parking (42)"
 * - "Near Hotels (18)"
 */

import {
  AMENITY_KEYS,
  NEARBY_CATEGORY_KEYS,
  PRICE_BUCKET_KEYS,
  RATING_BUCKET_KEYS,
  REVIEW_COUNT_BUCKET_KEYS,
  DINE_OPTION_KEYS,
  STANDOUT_TAG_KEYS,
  type AmenityKey,
  type NearbyCategoryKey,
  type PriceBucketKey,
  type RatingBucketKey,
  type ReviewCountBucketKey,
  type DineOptionKey,
  type StandoutTagKey,
} from './taxonomy';
import type { BuffetFacetData, NearbyCategoryFacet } from './buildFacetIndex';

// =============================================================================
// TYPES
// =============================================================================

/** Distance bucket keys for nearby categories */
export type DistanceBucketKey = 'within025' | 'within05' | 'within1';

/** Result of aggregating facets across multiple buffets */
export interface AggregatedFacets {
  /** Count of buffets where each amenity is true */
  amenityCounts: Record<AmenityKey, number>;
  /**
   * Count of buffets for each nearby category + distance bucket.
   * Keys are formatted as `${category}_${bucket}` e.g. "hotel_within05"
   */
  nearbyCounts: Record<string, number>;
  /**
   * Count of buffets per neighborhood slug.
   * Only includes neighborhoods with count >= MIN_NEIGHBORHOOD_COUNT.
   */
  neighborhoodCounts: Record<string, number>;
  /** Count of buffets per price bucket */
  priceCounts: Record<PriceBucketKey, number>;
  /** Count of buffets meeting each rating threshold */
  ratingCounts: Record<RatingBucketKey, number>;
  /** Count of buffets meeting each review count threshold */
  reviewCountCounts: Record<ReviewCountBucketKey, number>;
  /** Count of buffets with each dine option */
  dineOptionCounts: Record<DineOptionKey, number>;
  /** Count of buffets with each standout tag */
  standoutTagCounts: Record<StandoutTagKey, number>;
  /** Total number of buffets aggregated */
  totalBuffets: number;
  /** Count of buffets that have valid hours data (for "Open now" filter) */
  buffetsWithHours: number;
}

/** Minimum buffet count for a neighborhood to be included in aggregation */
export const MIN_NEIGHBORHOOD_COUNT = 2;

// =============================================================================
// CONSTANTS
// =============================================================================

/** All distance bucket keys */
export const DISTANCE_BUCKET_KEYS: DistanceBucketKey[] = [
  'within025',
  'within05',
  'within1',
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a nearby facet key from category and bucket.
 * @example nearbyKey('hotel', 'within05') => 'hotel_within05'
 */
export function nearbyKey(
  category: NearbyCategoryKey,
  bucket: DistanceBucketKey
): string {
  return `${category}_${bucket}`;
}

/**
 * Parse a nearby facet key into category and bucket.
 * @example parseNearbyKey('hotel_within05') => { category: 'hotel', bucket: 'within05' }
 */
export function parseNearbyKey(
  key: string
): { category: NearbyCategoryKey; bucket: DistanceBucketKey } | null {
  const parts = key.split('_');
  if (parts.length < 2) return null;

  const bucket = parts.pop() as DistanceBucketKey;
  const category = parts.join('_') as NearbyCategoryKey;

  if (!DISTANCE_BUCKET_KEYS.includes(bucket)) return null;
  if (!NEARBY_CATEGORY_KEYS.includes(category)) return null;

  return { category, bucket };
}

/**
 * Create empty aggregated facets with all counts at zero.
 */
export function createEmptyAggregatedFacets(): AggregatedFacets {
  const amenityCounts: Record<AmenityKey, number> = {} as Record<
    AmenityKey,
    number
  >;
  for (const key of AMENITY_KEYS) {
    amenityCounts[key] = 0;
  }

  const nearbyCounts: Record<string, number> = {};
  for (const category of NEARBY_CATEGORY_KEYS) {
    for (const bucket of DISTANCE_BUCKET_KEYS) {
      nearbyCounts[nearbyKey(category, bucket)] = 0;
    }
  }

  const priceCounts: Record<PriceBucketKey, number> = {} as Record<PriceBucketKey, number>;
  for (const key of PRICE_BUCKET_KEYS) {
    priceCounts[key] = 0;
  }

  const ratingCounts: Record<RatingBucketKey, number> = {} as Record<RatingBucketKey, number>;
  for (const key of RATING_BUCKET_KEYS) {
    ratingCounts[key] = 0;
  }

  const reviewCountCounts: Record<ReviewCountBucketKey, number> = {} as Record<ReviewCountBucketKey, number>;
  for (const key of REVIEW_COUNT_BUCKET_KEYS) {
    reviewCountCounts[key] = 0;
  }

  const dineOptionCounts: Record<DineOptionKey, number> = {} as Record<DineOptionKey, number>;
  for (const key of DINE_OPTION_KEYS) {
    dineOptionCounts[key] = 0;
  }

  const standoutTagCounts: Record<StandoutTagKey, number> = {} as Record<StandoutTagKey, number>;
  for (const key of STANDOUT_TAG_KEYS) {
    standoutTagCounts[key] = 0;
  }

  return {
    amenityCounts,
    nearbyCounts,
    neighborhoodCounts: {},
    priceCounts,
    ratingCounts,
    reviewCountCounts,
    dineOptionCounts,
    standoutTagCounts,
    totalBuffets: 0,
    buffetsWithHours: 0,
  };
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Aggregate facet data across multiple buffets.
 *
 * For amenityCounts: counts buffets where amenity=true.
 * For nearbyCounts: counts buffets where category has withinX=true.
 * For neighborhoodCounts: counts buffets per neighborhood (only includes neighborhoods with >= MIN_NEIGHBORHOOD_COUNT).
 *
 * @param facetIndexes - Array of BuffetFacetData objects (parsed from facetIndex column)
 * @returns Aggregated counts for amenities, nearby categories, neighborhoods, and total buffets
 *
 * @example
 * const facets = buffets.map(b => JSON.parse(b.facetIndex));
 * const aggregated = aggregateFacets(facets);
 * // aggregated.amenityCounts.parking => 42
 * // aggregated.nearbyCounts.hotel_within05 => 18
 * // aggregated.neighborhoodCounts['downtown'] => 5
 */
export function aggregateFacets(
  facetIndexes: BuffetFacetData[]
): AggregatedFacets {
  const result = createEmptyAggregatedFacets();
  
  // Temporary map for all neighborhoods (including singletons)
  const allNeighborhoodCounts: Record<string, number> = {};

  for (const facetData of facetIndexes) {
    if (!facetData) continue;

    result.totalBuffets++;

    // Count buffets with valid hours data
    if (facetData.hasHours) {
      result.buffetsWithHours++;
    }

    // Count amenities
    if (facetData.amenities) {
      for (const key of AMENITY_KEYS) {
        if (facetData.amenities[key] === true) {
          result.amenityCounts[key]++;
        }
      }
    }

    // Count nearby categories by distance bucket
    if (facetData.nearby) {
      for (const category of NEARBY_CATEGORY_KEYS) {
        const categoryData = facetData.nearby[category] as
          | NearbyCategoryFacet
          | undefined;
        if (!categoryData) continue;

        for (const bucket of DISTANCE_BUCKET_KEYS) {
          if (categoryData[bucket] === true) {
            result.nearbyCounts[nearbyKey(category, bucket)]++;
          }
        }
      }
    }

    // Count neighborhoods
    if (facetData.neighborhood) {
      allNeighborhoodCounts[facetData.neighborhood] = 
        (allNeighborhoodCounts[facetData.neighborhood] || 0) + 1;
    }

    // Count price buckets
    if (facetData.priceBucket) {
      result.priceCounts[facetData.priceBucket]++;
    }

    // Count rating buckets
    if (facetData.ratingBuckets) {
      for (const key of RATING_BUCKET_KEYS) {
        if (facetData.ratingBuckets[key] === true) {
          result.ratingCounts[key]++;
        }
      }
    }

    // Count review count buckets
    if (facetData.reviewCountBuckets) {
      for (const key of REVIEW_COUNT_BUCKET_KEYS) {
        if (facetData.reviewCountBuckets[key] === true) {
          result.reviewCountCounts[key]++;
        }
      }
    }

    // Count dine options
    if (facetData.dineOptions) {
      for (const key of DINE_OPTION_KEYS) {
        if (facetData.dineOptions[key] === true) {
          result.dineOptionCounts[key]++;
        }
      }
    }

    // Count standout tags
    if (facetData.standoutTags && Array.isArray(facetData.standoutTags)) {
      for (const tag of facetData.standoutTags) {
        if (tag && result.standoutTagCounts[tag as StandoutTagKey] !== undefined) {
          result.standoutTagCounts[tag as StandoutTagKey]++;
        }
      }
    }
  }

  // Filter neighborhoods to only include those with >= MIN_NEIGHBORHOOD_COUNT
  for (const [neighborhood, count] of Object.entries(allNeighborhoodCounts)) {
    if (count >= MIN_NEIGHBORHOOD_COUNT) {
      result.neighborhoodCounts[neighborhood] = count;
    }
  }

  return result;
}

/**
 * Get the most common amenities from aggregated facets.
 * Useful for showing "top filters" in UI.
 *
 * @param aggregated - Result from aggregateFacets()
 * @param limit - Maximum number of amenities to return
 * @returns Array of [amenityKey, count] sorted by count descending
 */
export function getTopAmenities(
  aggregated: AggregatedFacets,
  limit = 5
): Array<[AmenityKey, number]> {
  const entries = Object.entries(aggregated.amenityCounts) as Array<
    [AmenityKey, number]
  >;
  return entries
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/**
 * Get the most common nearby categories (at any distance) from aggregated facets.
 *
 * @param aggregated - Result from aggregateFacets()
 * @param bucket - Distance bucket to check (default: within1 = 1 mile)
 * @param limit - Maximum number of categories to return
 * @returns Array of [categoryKey, count] sorted by count descending
 */
export function getTopNearbyCategories(
  aggregated: AggregatedFacets,
  bucket: DistanceBucketKey = 'within1',
  limit = 5
): Array<[NearbyCategoryKey, number]> {
  const results: Array<[NearbyCategoryKey, number]> = [];

  for (const category of NEARBY_CATEGORY_KEYS) {
    const count = aggregated.nearbyCounts[nearbyKey(category, bucket)] || 0;
    if (count > 0) {
      results.push([category, count]);
    }
  }

  return results.sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/**
 * Get neighborhoods sorted by count descending.
 *
 * @param aggregated - Result from aggregateFacets()
 * @param limit - Maximum number of neighborhoods to return (default: no limit)
 * @returns Array of [neighborhoodSlug, count] sorted by count descending
 */
export function getNeighborhoods(
  aggregated: AggregatedFacets,
  limit?: number
): Array<[string, number]> {
  const entries = Object.entries(aggregated.neighborhoodCounts);
  const sorted = entries.sort((a, b) => b[1] - a[1]);
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Format a neighborhood slug to display label.
 * Converts "downtown-houston" to "Downtown Houston"
 */
export function formatNeighborhoodLabel(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get top standout tags sorted by count descending.
 *
 * @param aggregated - Result from aggregateFacets()
 * @param limit - Maximum number of tags to return (default: 8)
 * @returns Array of [tagKey, count] sorted by count descending
 */
export function getTopStandoutTags(
  aggregated: AggregatedFacets,
  limit = 8
): Array<[StandoutTagKey, number]> {
  const entries = Object.entries(aggregated.standoutTagCounts) as Array<[StandoutTagKey, number]>;
  return entries
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}
