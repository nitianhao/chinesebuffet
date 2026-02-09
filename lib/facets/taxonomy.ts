/**
 * Facet taxonomy definitions for search filters and categorization.
 * This module defines the canonical keys for amenities, nearby categories,
 * rating/review/price buckets, dine options, and standout tags
 * used throughout the faceted search system.
 */

// =============================================================================
// RATING BUCKETS
// =============================================================================

/**
 * Rating bucket thresholds.
 * Filters like "4.5+ stars", "4.0+ stars", "3.5+ stars"
 */
export const RATING_BUCKETS = [4.5, 4.0, 3.5] as const;
export type RatingBucket = (typeof RATING_BUCKETS)[number];

/** Rating bucket keys for facet storage */
export const RATING_BUCKET_KEYS = ['rating_45', 'rating_40', 'rating_35'] as const;
export type RatingBucketKey = (typeof RATING_BUCKET_KEYS)[number];

/**
 * Compute rating bucket flags from a rating value.
 * All applicable buckets are set to true (e.g., 4.7 matches 4.5+, 4.0+, and 3.5+)
 */
export function bucketizeRating(rating: number | null | undefined): Record<RatingBucketKey, boolean> {
  if (rating == null || !Number.isFinite(rating)) {
    return { rating_45: false, rating_40: false, rating_35: false };
  }
  return {
    rating_45: rating >= 4.5,
    rating_40: rating >= 4.0,
    rating_35: rating >= 3.5,
  };
}

// =============================================================================
// REVIEW COUNT BUCKETS
// =============================================================================

/**
 * Review count bucket thresholds.
 * Filters like "100+ reviews", "500+ reviews", "1000+ reviews"
 */
export const REVIEW_COUNT_BUCKETS = [100, 500, 1000] as const;
export type ReviewCountBucket = (typeof REVIEW_COUNT_BUCKETS)[number];

/** Review count bucket keys for facet storage */
export const REVIEW_COUNT_BUCKET_KEYS = ['reviews_100', 'reviews_500', 'reviews_1000'] as const;
export type ReviewCountBucketKey = (typeof REVIEW_COUNT_BUCKET_KEYS)[number];

/**
 * Compute review count bucket flags.
 * All applicable buckets are set to true (e.g., 750 reviews matches 100+ and 500+)
 */
export function bucketizeReviewCount(count: number | null | undefined): Record<ReviewCountBucketKey, boolean> {
  if (count == null || !Number.isFinite(count)) {
    return { reviews_100: false, reviews_500: false, reviews_1000: false };
  }
  return {
    reviews_100: count >= 100,
    reviews_500: count >= 500,
    reviews_1000: count >= 1000,
  };
}

// =============================================================================
// PRICE BUCKETS
// =============================================================================

/**
 * Price bucket keys.
 * Maps to $ (budget), $$ (moderate), $$$ (upscale), unknown (no data)
 */
export const PRICE_BUCKET_KEYS = ['price_1', 'price_2', 'price_3', 'price_unknown'] as const;
export type PriceBucketKey = (typeof PRICE_BUCKET_KEYS)[number];

/** Display labels for price buckets */
export const PRICE_BUCKET_LABELS: Record<PriceBucketKey, string> = {
  price_1: '$',
  price_2: '$$',
  price_3: '$$$',
  price_unknown: 'Price N/A',
};

/**
 * Parse price string to bucket key.
 * Handles formats: "$", "$$", "$$$", "$10-20", "Moderate", etc.
 */
export function parsePriceToBucket(price: string | null | undefined): PriceBucketKey {
  if (!price || typeof price !== 'string') {
    return 'price_unknown';
  }
  
  const trimmed = price.trim().toLowerCase();
  
  // Count dollar signs (only if string is just dollar signs)
  const dollarOnlyMatch = trimmed.match(/^\$+$/);
  if (dollarOnlyMatch) {
    const count = dollarOnlyMatch[0].length;
    if (count === 1) return 'price_1';
    if (count === 2) return 'price_2';
    if (count >= 3) return 'price_3';
  }
  
  // Handle text descriptors
  if (trimmed.includes('cheap') || trimmed.includes('budget') || trimmed.includes('inexpensive')) {
    return 'price_1';
  }
  if (trimmed.includes('moderate') || trimmed.includes('average')) {
    return 'price_2';
  }
  if (trimmed.includes('expensive') || trimmed.includes('upscale') || trimmed.includes('pricey')) {
    return 'price_3';
  }
  
  // Try to extract price range and estimate bucket
  // For ranges like "$15-25", use the higher number
  const rangeMatch = trimmed.match(/\$?(\d+)\s*[-–]\s*\$?(\d+)/);
  if (rangeMatch) {
    const highAmount = parseInt(rangeMatch[2], 10);
    if (highAmount <= 15) return 'price_1';
    if (highAmount <= 30) return 'price_2';
    if (highAmount > 30) return 'price_3';
  }
  
  // Single price value
  const priceMatch = trimmed.match(/\$?(\d+)/);
  if (priceMatch) {
    const amount = parseInt(priceMatch[1], 10);
    if (amount <= 15) return 'price_1';
    if (amount <= 25) return 'price_2';
    if (amount > 25) return 'price_3';
  }
  
  return 'price_unknown';
}

// =============================================================================
// DINE OPTIONS
// =============================================================================

/**
 * Dine option keys for filtering by service type.
 */
export const DINE_OPTION_KEYS = ['dine_in', 'takeout', 'delivery'] as const;
export type DineOptionKey = (typeof DINE_OPTION_KEYS)[number];

/** Display labels for dine options */
export const DINE_OPTION_LABELS: Record<DineOptionKey, string> = {
  dine_in: 'Dine-in',
  takeout: 'Takeout',
  delivery: 'Delivery',
};

/**
 * Type guard for dine option keys
 */
export function isDineOptionKey(key: string): key is DineOptionKey {
  return (DINE_OPTION_KEYS as readonly string[]).includes(key);
}

// =============================================================================
// STANDOUT TAGS
// =============================================================================

/**
 * Controlled list of standout tags we support as filters.
 * These are normalized from "What stands out" section text.
 * 
 * Format: lowercase, underscores for spaces
 * 
 * TODO: Expand based on common patterns in data:
 * - fresh_food, hot_food, variety, clean, friendly_staff
 * - crab_legs, sushi, mongolian_grill, hibachi
 */
export const STANDOUT_TAG_KEYS = [
  // Food quality
  'fresh_food',
  'hot_food',
  'good_variety',
  'large_selection',
  'quality_food',
  
  // Popular items
  'crab_legs',
  'sushi',
  'seafood',
  'mongolian_grill',
  'hibachi',
  'dim_sum',
  'desserts',
  
  // Service & atmosphere
  'friendly_staff',
  'fast_service',
  'clean',
  'spacious',
  'family_friendly',
  'good_for_groups',
  
  // Value
  'good_value',
  'affordable',
  'generous_portions',
  
  // Special features
  'all_you_can_eat',
  'lunch_buffet',
  'dinner_buffet',
  'weekend_buffet',
] as const;

export type StandoutTagKey = (typeof STANDOUT_TAG_KEYS)[number];

/** Display labels for standout tags */
export const STANDOUT_TAG_LABELS: Record<StandoutTagKey, string> = {
  fresh_food: 'Fresh Food',
  hot_food: 'Hot Food',
  good_variety: 'Good Variety',
  large_selection: 'Large Selection',
  quality_food: 'Quality Food',
  crab_legs: 'Crab Legs',
  sushi: 'Sushi',
  seafood: 'Seafood',
  mongolian_grill: 'Mongolian Grill',
  hibachi: 'Hibachi',
  dim_sum: 'Dim Sum',
  desserts: 'Desserts',
  friendly_staff: 'Friendly Staff',
  fast_service: 'Fast Service',
  clean: 'Clean',
  spacious: 'Spacious',
  family_friendly: 'Family Friendly',
  good_for_groups: 'Good for Groups',
  good_value: 'Good Value',
  affordable: 'Affordable',
  generous_portions: 'Generous Portions',
  all_you_can_eat: 'All You Can Eat',
  lunch_buffet: 'Lunch Buffet',
  dinner_buffet: 'Dinner Buffet',
  weekend_buffet: 'Weekend Buffet',
};

/**
 * Patterns for matching standout text to tag keys.
 * Each key maps to an array of regex patterns (case-insensitive).
 * 
 * Common phrase mappings:
 * - "great value" -> good_value
 * - "huge selection" -> large_selection  
 * - "fresh sushi" -> sushi (and fresh_food)
 * - "clean" -> clean
 * - "family" -> family_friendly
 * - "good for groups" -> good_for_groups
 */
export const STANDOUT_TAG_PATTERNS: Record<StandoutTagKey, RegExp[]> = {
  fresh_food: [/fresh\s*food/i, /freshly\s+made/i, /freshly\s+prepared/i, /always\s+fresh/i, /fresh\s+ingredients/i],
  hot_food: [/hot\s+food/i, /kept\s+hot/i, /piping\s+hot/i, /always\s+hot/i],
  good_variety: [/good\s*variety/i, /great\s*variety/i, /wide\s+variety/i, /varied/i, /diverse/i, /wide\s+range/i],
  large_selection: [/large\s+selection/i, /huge\s+selection/i, /big\s+selection/i, /lots\s+of\s+options/i, /many\s+choices/i, /tons\s+of\s+options/i],
  quality_food: [/quality\s*food/i, /high\s+quality/i, /excellent\s+food/i, /great\s+food/i, /good\s+food/i],
  crab_legs: [/crab\s*legs?/i, /snow\s*crab/i, /king\s*crab/i, /dungeness\s*crab/i],
  sushi: [/sushi/i, /sashimi/i, /maki/i, /nigiri/i, /fresh\s+sushi/i],
  seafood: [/seafood/i, /shrimp/i, /lobster/i, /oyster/i, /mussel/i, /clam/i, /scallop/i],
  mongolian_grill: [/mongolian/i, /stir\s*fry\s*bar/i, /stir\s*fry\s*station/i],
  hibachi: [/hibachi/i, /teppanyaki/i, /teppan/i],
  dim_sum: [/dim\s*sum/i, /dumpling/i, /bao/i, /steamed\s+buns/i],
  desserts: [/dessert/i, /cake/i, /ice\s*cream/i, /pastry/i, /sweet\s+treats/i, /bakery/i],
  friendly_staff: [/friendly\s*staff/i, /nice\s*staff/i, /helpful\s*staff/i, /friendly\s*service/i, /staff\s*(is|are|was|were)\s*(very\s*)?(friendly|nice|helpful)/i, /great\s*staff/i],
  fast_service: [/fast\s*service/i, /quick\s*service/i, /speedy/i, /efficient/i, /quick\s*refills/i],
  clean: [/\bclean\b/i, /very\s+clean/i, /spotless/i, /sanitary/i, /tidy/i, /well\s*maintained/i],
  spacious: [/spacious/i, /roomy/i, /plenty\s+of\s+room/i, /large\s+dining/i, /lots\s+of\s+space/i],
  family_friendly: [/family\s*friendly/i, /great\s+for\s+(kids|families)/i, /kid\s*friendly/i, /children/i, /brings?\s+the\s+(kids|family)/i],
  good_for_groups: [/good\s+for\s+groups/i, /great\s+for\s+groups/i, /large\s+groups/i, /group\s+dining/i, /party/i, /banquet/i, /celebrations?/i],
  good_value: [/good\s*value/i, /great\s*value/i, /excellent\s*value/i, /worth\s+(it|the\s+money|every\s+penny)/i, /bang\s+for\s+(your|the)\s+buck/i],
  affordable: [/affordable/i, /cheap/i, /budget\s*friendly/i, /inexpensive/i, /reasonable\s+price/i, /low\s+price/i],
  generous_portions: [/generous\s*portion/i, /big\s*portion/i, /large\s*portion/i, /heaping/i, /piled\s+high/i, /lots\s+of\s+food/i],
  all_you_can_eat: [/all\s*you\s*can\s*eat/i, /ayce/i, /unlimited/i, /eat\s+all\s+you\s+want/i],
  lunch_buffet: [/lunch\s*buffet/i, /lunch\s*special/i, /weekday\s+lunch/i],
  dinner_buffet: [/dinner\s*buffet/i, /dinner\s*special/i, /evening\s+buffet/i],
  weekend_buffet: [/weekend\s*buffet/i, /saturday/i, /sunday/i, /weekend\s+special/i],
};

/**
 * Extract standout tag keys from text.
 * Returns array of matching StandoutTagKey values.
 */
export function extractStandoutTags(text: string | null | undefined): StandoutTagKey[] {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  const tags: StandoutTagKey[] = [];
  
  for (const [key, patterns] of Object.entries(STANDOUT_TAG_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        tags.push(key as StandoutTagKey);
        break; // Only add each tag once
      }
    }
  }
  
  return tags;
}

/**
 * Type guard for standout tag keys
 */
export function isStandoutTagKey(key: string): key is StandoutTagKey {
  return (STANDOUT_TAG_KEYS as readonly string[]).includes(key);
}

// =============================================================================
// AMENITY KEYS
// =============================================================================

/**
 * Top amenities we want as filters for buffet listings.
 * These map to boolean fields on buffet records.
 *
 * TODO: Expand with additional amenities as needed:
 * - outdoor_seating
 * - private_dining
 * - catering
 * - buffet_style (all_you_can_eat, prix_fixe, etc.)
 * - live_cooking_stations
 * - sushi_bar
 * - mongolian_grill
 */
export const AMENITY_KEYS = [
  'parking',
  'wheelchair_accessible',
  'kids_friendly',
  'reservations',
  'takeout',
  'delivery',
  'wifi',
  'alcohol',
  'credit_cards_accepted',
  'outdoor_seating',
  'private_dining',
] as const;

/** Type representing valid amenity filter keys */
export type AmenityKey = (typeof AMENITY_KEYS)[number];

// =============================================================================
// NEARBY CATEGORY KEYS
// =============================================================================

/**
 * Categories for nearby places we want to filter on.
 * These enable queries like "buffets near hotels" or "buffets near transit".
 *
 * TODO: Expand with additional categories as needed:
 * - healthcare (hospitals, clinics)
 * - sports (gyms, stadiums)
 * - entertainment (theaters, cinemas)
 * - religious (churches, temples)
 * - government (city hall, post office)
 */
export const NEARBY_CATEGORY_KEYS = [
  'grocery',
  'hotel',
  'tourist_attraction',
  'shopping',
  'education',
  'repair',
  'nightlife',
  'park',
  'transit',
  'restaurant',
  'gas_station',
  'parking_lot',
] as const;

/** Type representing valid nearby category filter keys */
export type NearbyCategoryKey = (typeof NEARBY_CATEGORY_KEYS)[number];

// =============================================================================
// DISTANCE BUCKETS
// =============================================================================

/**
 * Distance bucket thresholds in miles.
 * Used to pre-compute "within X miles" boolean flags for efficient filtering.
 */
export const DISTANCE_BUCKETS_MILES = {
  QUARTER: 0.25,
  HALF: 0.5,
  ONE: 1.0,
} as const;

/**
 * Result of bucketizing a distance into discrete "within X" flags.
 * All flags are true if the distance is within that threshold.
 */
export interface DistanceBuckets {
  /** Within 0.25 miles (~400m, ~5 min walk) */
  within025: boolean;
  /** Within 0.5 miles (~800m, ~10 min walk) */
  within05: boolean;
  /** Within 1.0 mile (~1.6km, ~20 min walk) */
  within1: boolean;
}

/**
 * Bucketize a distance in miles into discrete "within X" boolean flags.
 * Useful for pre-computing filter flags at index time.
 *
 * @param miles - Distance in miles
 * @returns Object with boolean flags for each distance bucket
 *
 * @example
 * bucketizeDistanceMiles(0.3)
 * // => { within025: false, within05: true, within1: true }
 */
export function bucketizeDistanceMiles(miles: number): DistanceBuckets {
  return {
    within025: miles <= DISTANCE_BUCKETS_MILES.QUARTER,
    within05: miles <= DISTANCE_BUCKETS_MILES.HALF,
    within1: miles <= DISTANCE_BUCKETS_MILES.ONE,
  };
}

// =============================================================================
// FACET INDEX TYPE
// =============================================================================

/**
 * Index structure for faceted search.
 * Maps facet keys to sets of matching document IDs.
 *
 * @example
 * const index: FacetIndex = {
 *   'amenity:parking': new Set(['buffet-1', 'buffet-3']),
 *   'amenity:wifi': new Set(['buffet-2', 'buffet-3']),
 *   'nearby:hotel:within05': new Set(['buffet-1']),
 * };
 */
export interface FacetIndex {
  [facetKey: string]: Set<string>;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Helper type for building facet keys with type safety.
 * Produces strings like "amenity:parking" or "nearby:hotel:within05"
 */
export type AmenityFacetKey = `amenity:${AmenityKey}`;
export type NearbyFacetKey = `nearby:${NearbyCategoryKey}:${'within025' | 'within05' | 'within1'}`;
export type FacetKey = AmenityFacetKey | NearbyFacetKey;

/**
 * Type guard to check if a string is a valid AmenityKey
 */
export function isAmenityKey(key: string): key is AmenityKey {
  return (AMENITY_KEYS as readonly string[]).includes(key);
}

/**
 * Type guard to check if a string is a valid NearbyCategoryKey
 */
export function isNearbyCategoryKey(key: string): key is NearbyCategoryKey {
  return (NEARBY_CATEGORY_KEYS as readonly string[]).includes(key);
}
