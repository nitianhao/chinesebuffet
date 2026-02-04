/**
 * Facets module - faceted search/filtering for buffet listings.
 *
 * @example
 * import { buildFacetIndex, aggregateFacets, AMENITY_KEYS } from '@/lib/facets';
 */

// Taxonomy - canonical keys and types
export {
  // Amenity keys
  AMENITY_KEYS,
  isAmenityKey,
  type AmenityKey,
  // Nearby category keys
  NEARBY_CATEGORY_KEYS,
  isNearbyCategoryKey,
  type NearbyCategoryKey,
  // Distance buckets
  DISTANCE_BUCKETS_MILES,
  bucketizeDistanceMiles,
  type DistanceBuckets,
  // Rating buckets
  RATING_BUCKETS,
  RATING_BUCKET_KEYS,
  bucketizeRating,
  type RatingBucket,
  type RatingBucketKey,
  // Review count buckets
  REVIEW_COUNT_BUCKETS,
  REVIEW_COUNT_BUCKET_KEYS,
  bucketizeReviewCount,
  type ReviewCountBucket,
  type ReviewCountBucketKey,
  // Price buckets
  PRICE_BUCKET_KEYS,
  PRICE_BUCKET_LABELS,
  parsePriceToBucket,
  type PriceBucketKey,
  // Dine options
  DINE_OPTION_KEYS,
  DINE_OPTION_LABELS,
  isDineOptionKey,
  type DineOptionKey,
  // Standout tags
  STANDOUT_TAG_KEYS,
  STANDOUT_TAG_LABELS,
  STANDOUT_TAG_PATTERNS,
  extractStandoutTags,
  isStandoutTagKey,
  type StandoutTagKey,
  // Facet index types
  type FacetIndex,
  type AmenityFacetKey,
  type NearbyFacetKey,
  type FacetKey,
} from './taxonomy';

// Build facet index
export {
  buildFacetIndex,
  parseDistanceToMiles,
  normalizeNeighborhoodSlug,
  type BuffetFacetData,
  type BuffetForFacets,
  type NearbyCategoryFacet,
} from './buildFacetIndex';

// Aggregate facets
export {
  aggregateFacets,
  createEmptyAggregatedFacets,
  nearbyKey,
  parseNearbyKey,
  getTopAmenities,
  getTopNearbyCategories,
  getNeighborhoods,
  formatNeighborhoodLabel,
  getTopStandoutTags,
  DISTANCE_BUCKET_KEYS,
  MIN_NEIGHBORHOOD_COUNT,
  type AggregatedFacets,
  type DistanceBucketKey,
} from './aggregateFacets';

// City facets (server-side)
export {
  getCityFacets,
  applyFilters,
  hasActiveFilters,
  parseFiltersFromParams,
  parseSortFromParams,
  serializeFiltersToParams,
  type CityFacetsResult,
  type ActiveFilters,
  type SortOption,
} from './getCityFacets';
