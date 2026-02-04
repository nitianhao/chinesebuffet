/**
 * Tests for aggregateFacets
 *
 * Run with: npx tsx lib/facets/__tests__/aggregateFacets.test.ts
 */

import {
  aggregateFacets,
  createEmptyAggregatedFacets,
  nearbyKey,
  parseNearbyKey,
  getTopAmenities,
  getTopNearbyCategories,
  getNeighborhoods,
  formatNeighborhoodLabel,
  getTopStandoutTags,
  MIN_NEIGHBORHOOD_COUNT,
} from '../aggregateFacets';
import type { BuffetFacetData } from '../buildFacetIndex';

// =============================================================================
// TEST HELPERS
// =============================================================================

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  if (match) {
    passCount++;
    console.log(`  ✓ ${message}`);
  } else {
    failCount++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${JSON.stringify(expected)}`);
    console.log(`    Actual:   ${JSON.stringify(actual)}`);
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n${name}`);
  fn();
}

function it(name: string, fn: () => void): void {
  console.log(`\n  ${name}`);
  fn();
}

// =============================================================================
// MOCK DATA
// =============================================================================

const mockFacet1: BuffetFacetData = {
  amenities: {
    parking: true,
    wheelchair_accessible: true,
    kids_friendly: false,
    reservations: true,
    takeout: true,
    delivery: false,
    wifi: true,
    alcohol: true,
    credit_cards_accepted: true,
    outdoor_seating: false,
    private_dining: false,
  },
  nearby: {
    grocery: { within025: true, within05: true, within1: true, count: 2 },
    hotel: { within025: false, within05: true, within1: true, count: 3 },
    tourist_attraction: { within025: false, within05: false, within1: true, count: 1 },
    shopping: { within025: true, within05: true, within1: true, count: 4 },
    education: { within025: false, within05: false, within1: false, count: 0 },
    repair: { within025: false, within05: false, within1: false, count: 0 },
    nightlife: { within025: false, within05: true, within1: true, count: 2 },
    park: { within025: true, within05: true, within1: true, count: 1 },
    transit: { within025: true, within05: true, within1: true, count: 5 },
    restaurant: { within025: true, within05: true, within1: true, count: 10 },
    gas_station: { within025: false, within05: true, within1: true, count: 1 },
    parking_lot: { within025: true, within05: true, within1: true, count: 3 },
  },
  ratingBuckets: { rating_45: true, rating_40: true, rating_35: true },
  reviewCountBuckets: { reviews_100: true, reviews_500: true, reviews_1000: false },
  priceBucket: 'price_2',
  dineOptions: { dine_in: true, takeout: true, delivery: false },
  standoutTags: ['crab_legs', 'fresh_food'],
  neighborhood: 'downtown',
};

const mockFacet2: BuffetFacetData = {
  amenities: {
    parking: true,
    wheelchair_accessible: false,
    kids_friendly: true,
    reservations: false,
    takeout: true,
    delivery: true,
    wifi: false,
    alcohol: false,
    credit_cards_accepted: true,
    outdoor_seating: true,
    private_dining: false,
  },
  nearby: {
    grocery: { within025: false, within05: true, within1: true, count: 1 },
    hotel: { within025: true, within05: true, within1: true, count: 2 },
    tourist_attraction: { within025: false, within05: false, within1: false, count: 0 },
    shopping: { within025: false, within05: false, within1: true, count: 1 },
    education: { within025: false, within05: true, within1: true, count: 1 },
    repair: { within025: false, within05: false, within1: true, count: 1 },
    nightlife: { within025: false, within05: false, within1: false, count: 0 },
    park: { within025: false, within05: false, within1: true, count: 1 },
    transit: { within025: false, within05: true, within1: true, count: 2 },
    restaurant: { within025: true, within05: true, within1: true, count: 5 },
    gas_station: { within025: false, within05: false, within1: true, count: 1 },
    parking_lot: { within025: false, within05: true, within1: true, count: 1 },
  },
  ratingBuckets: { rating_45: false, rating_40: true, rating_35: true },
  reviewCountBuckets: { reviews_100: true, reviews_500: false, reviews_1000: false },
  priceBucket: 'price_1',
  dineOptions: { dine_in: true, takeout: true, delivery: true },
  standoutTags: ['sushi', 'good_value'],
  neighborhood: 'downtown', // Same as mockFacet1
};

const mockFacet3: BuffetFacetData = {
  amenities: {
    parking: false,
    wheelchair_accessible: true,
    kids_friendly: true,
    reservations: true,
    takeout: false,
    delivery: false,
    wifi: true,
    alcohol: true,
    credit_cards_accepted: false,
    outdoor_seating: false,
    private_dining: true,
  },
  nearby: {
    grocery: { within025: false, within05: false, within1: true, count: 1 },
    hotel: { within025: false, within05: false, within1: true, count: 1 },
    tourist_attraction: { within025: true, within05: true, within1: true, count: 2 },
    shopping: { within025: false, within05: true, within1: true, count: 2 },
    education: { within025: true, within05: true, within1: true, count: 2 },
    repair: { within025: false, within05: false, within1: false, count: 0 },
    nightlife: { within025: true, within05: true, within1: true, count: 3 },
    park: { within025: false, within05: true, within1: true, count: 2 },
    transit: { within025: false, within05: false, within1: true, count: 1 },
    restaurant: { within025: false, within05: true, within1: true, count: 3 },
    gas_station: { within025: false, within05: false, within1: false, count: 0 },
    parking_lot: { within025: false, within05: false, within1: true, count: 1 },
  },
  ratingBuckets: { rating_45: true, rating_40: true, rating_35: true },
  reviewCountBuckets: { reviews_100: true, reviews_500: true, reviews_1000: true },
  priceBucket: 'price_3',
  dineOptions: { dine_in: true, takeout: false, delivery: false },
  standoutTags: ['mongolian_grill', 'clean'],
  neighborhood: 'midtown', // Different neighborhood
};

// Additional mock for testing neighborhood edge cases
const mockFacet4: BuffetFacetData = {
  amenities: {
    parking: true,
    wheelchair_accessible: false,
    kids_friendly: false,
    reservations: false,
    takeout: true,
    delivery: false,
    wifi: false,
    alcohol: false,
    credit_cards_accepted: true,
    outdoor_seating: false,
    private_dining: false,
  },
  nearby: {
    grocery: { within025: false, within05: false, within1: true, count: 1 },
    hotel: { within025: false, within05: false, within1: false, count: 0 },
    tourist_attraction: { within025: false, within05: false, within1: false, count: 0 },
    shopping: { within025: false, within05: false, within1: true, count: 1 },
    education: { within025: false, within05: false, within1: false, count: 0 },
    repair: { within025: false, within05: false, within1: false, count: 0 },
    nightlife: { within025: false, within05: false, within1: false, count: 0 },
    park: { within025: false, within05: false, within1: false, count: 0 },
    transit: { within025: false, within05: false, within1: true, count: 1 },
    restaurant: { within025: false, within05: false, within1: true, count: 2 },
    gas_station: { within025: false, within05: false, within1: false, count: 0 },
    parking_lot: { within025: false, within05: false, within1: true, count: 1 },
  },
  ratingBuckets: { rating_45: false, rating_40: false, rating_35: true },
  reviewCountBuckets: { reviews_100: false, reviews_500: false, reviews_1000: false },
  priceBucket: 'price_unknown',
  dineOptions: { dine_in: true, takeout: true, delivery: false },
  standoutTags: [],
  neighborhood: 'east-side', // Singleton neighborhood
};

const mockFacet5: BuffetFacetData = {
  amenities: {
    parking: true,
    wheelchair_accessible: true,
    kids_friendly: true,
    reservations: true,
    takeout: true,
    delivery: true,
    wifi: true,
    alcohol: false,
    credit_cards_accepted: true,
    outdoor_seating: true,
    private_dining: false,
  },
  nearby: {
    grocery: { within025: true, within05: true, within1: true, count: 3 },
    hotel: { within025: true, within05: true, within1: true, count: 2 },
    tourist_attraction: { within025: false, within05: true, within1: true, count: 1 },
    shopping: { within025: true, within05: true, within1: true, count: 2 },
    education: { within025: false, within05: false, within1: true, count: 1 },
    repair: { within025: false, within05: false, within1: true, count: 1 },
    nightlife: { within025: false, within05: false, within1: true, count: 1 },
    park: { within025: true, within05: true, within1: true, count: 2 },
    transit: { within025: true, within05: true, within1: true, count: 3 },
    restaurant: { within025: true, within05: true, within1: true, count: 8 },
    gas_station: { within025: false, within05: true, within1: true, count: 2 },
    parking_lot: { within025: true, within05: true, within1: true, count: 2 },
  },
  ratingBuckets: { rating_45: false, rating_40: true, rating_35: true },
  reviewCountBuckets: { reviews_100: true, reviews_500: false, reviews_1000: false },
  priceBucket: 'price_2',
  dineOptions: { dine_in: true, takeout: true, delivery: true },
  standoutTags: ['seafood', 'family_friendly'],
  neighborhood: 'midtown', // Same as mockFacet3
};

// =============================================================================
// TESTS
// =============================================================================

describe('nearbyKey and parseNearbyKey', () => {
  it('generates correct keys', () => {
    assertEqual(nearbyKey('hotel', 'within025'), 'hotel_within025', 'hotel_within025');
    assertEqual(nearbyKey('hotel', 'within05'), 'hotel_within05', 'hotel_within05');
    assertEqual(nearbyKey('gas_station', 'within1'), 'gas_station_within1', 'gas_station_within1');
  });

  it('parses keys correctly', () => {
    assertEqual(
      parseNearbyKey('hotel_within05'),
      { category: 'hotel', bucket: 'within05' },
      'parses hotel_within05'
    );
    assertEqual(
      parseNearbyKey('gas_station_within1'),
      { category: 'gas_station', bucket: 'within1' },
      'parses gas_station_within1'
    );
  });

  it('returns null for invalid keys', () => {
    assertEqual(parseNearbyKey('invalid'), null, 'invalid key returns null');
    assertEqual(parseNearbyKey('hotel_invalid'), null, 'invalid bucket returns null');
    assertEqual(parseNearbyKey('unknown_within05'), null, 'unknown category returns null');
  });
});

describe('createEmptyAggregatedFacets', () => {
  it('creates empty structure with all keys', () => {
    const empty = createEmptyAggregatedFacets();

    assertEqual(empty.totalBuffets, 0, 'totalBuffets is 0');
    assertEqual(empty.amenityCounts.parking, 0, 'parking count is 0');
    assertEqual(empty.amenityCounts.wifi, 0, 'wifi count is 0');
    assertEqual(empty.nearbyCounts['hotel_within025'], 0, 'hotel_within025 is 0');
    assertEqual(empty.nearbyCounts['transit_within1'], 0, 'transit_within1 is 0');
  });

  it('has all amenity keys', () => {
    const empty = createEmptyAggregatedFacets();
    const amenityKeys = Object.keys(empty.amenityCounts);

    assert(amenityKeys.includes('parking'), 'has parking');
    assert(amenityKeys.includes('wifi'), 'has wifi');
    assert(amenityKeys.includes('wheelchair_accessible'), 'has wheelchair_accessible');
    assertEqual(amenityKeys.length, 11, 'has 11 amenity keys');
  });

  it('has all nearby category + bucket combinations', () => {
    const empty = createEmptyAggregatedFacets();
    const nearbyKeys = Object.keys(empty.nearbyCounts);

    // 12 categories * 3 buckets = 36 keys
    assertEqual(nearbyKeys.length, 36, 'has 36 nearby keys (12 categories × 3 buckets)');
    assert(nearbyKeys.includes('hotel_within025'), 'has hotel_within025');
    assert(nearbyKeys.includes('hotel_within05'), 'has hotel_within05');
    assert(nearbyKeys.includes('hotel_within1'), 'has hotel_within1');
  });
});

describe('aggregateFacets', () => {
  it('returns empty for empty array', () => {
    const result = aggregateFacets([]);

    assertEqual(result.totalBuffets, 0, 'totalBuffets is 0');
    assertEqual(result.amenityCounts.parking, 0, 'parking count is 0');
  });

  it('counts single buffet correctly', () => {
    const result = aggregateFacets([mockFacet1]);

    assertEqual(result.totalBuffets, 1, 'totalBuffets is 1');
    assertEqual(result.amenityCounts.parking, 1, 'parking is 1');
    assertEqual(result.amenityCounts.wifi, 1, 'wifi is 1');
    assertEqual(result.amenityCounts.kids_friendly, 0, 'kids_friendly is 0');
    assertEqual(result.amenityCounts.delivery, 0, 'delivery is 0');
  });

  it('counts nearby categories correctly for single buffet', () => {
    const result = aggregateFacets([mockFacet1]);

    assertEqual(result.nearbyCounts['hotel_within025'], 0, 'hotel_within025 is 0');
    assertEqual(result.nearbyCounts['hotel_within05'], 1, 'hotel_within05 is 1');
    assertEqual(result.nearbyCounts['hotel_within1'], 1, 'hotel_within1 is 1');
    assertEqual(result.nearbyCounts['transit_within025'], 1, 'transit_within025 is 1');
    assertEqual(result.nearbyCounts['education_within1'], 0, 'education_within1 is 0');
  });

  it('aggregates multiple buffets correctly', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);

    assertEqual(result.totalBuffets, 3, 'totalBuffets is 3');

    // Amenity counts
    // parking: true, true, false = 2
    assertEqual(result.amenityCounts.parking, 2, 'parking count is 2');
    // wifi: true, false, true = 2
    assertEqual(result.amenityCounts.wifi, 2, 'wifi count is 2');
    // kids_friendly: false, true, true = 2
    assertEqual(result.amenityCounts.kids_friendly, 2, 'kids_friendly count is 2');
    // wheelchair_accessible: true, false, true = 2
    assertEqual(result.amenityCounts.wheelchair_accessible, 2, 'wheelchair_accessible count is 2');
    // private_dining: false, false, true = 1
    assertEqual(result.amenityCounts.private_dining, 1, 'private_dining count is 1');
  });

  it('aggregates nearby counts correctly across multiple buffets', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);

    // hotel_within025: false, true, false = 1
    assertEqual(result.nearbyCounts['hotel_within025'], 1, 'hotel_within025 is 1');
    // hotel_within05: true, true, false = 2
    assertEqual(result.nearbyCounts['hotel_within05'], 2, 'hotel_within05 is 2');
    // hotel_within1: true, true, true = 3
    assertEqual(result.nearbyCounts['hotel_within1'], 3, 'hotel_within1 is 3');

    // restaurant_within025: true, true, false = 2
    assertEqual(result.nearbyCounts['restaurant_within025'], 2, 'restaurant_within025 is 2');
    // restaurant_within1: true, true, true = 3
    assertEqual(result.nearbyCounts['restaurant_within1'], 3, 'restaurant_within1 is 3');

    // education_within1: false, true, true = 2
    assertEqual(result.nearbyCounts['education_within1'], 2, 'education_within1 is 2');
  });

  it('handles null/undefined in array', () => {
    const result = aggregateFacets([mockFacet1, null as unknown as BuffetFacetData, mockFacet2]);

    assertEqual(result.totalBuffets, 2, 'totalBuffets is 2 (null skipped)');
  });
});

describe('getTopAmenities', () => {
  it('returns top amenities sorted by count', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);
    const top = getTopAmenities(result, 3);

    assertEqual(top.length, 3, 'returns 3 amenities');
    // All amenities with count > 0, sorted descending
    assert(top[0][1] >= top[1][1], 'first has higher or equal count than second');
    assert(top[1][1] >= top[2][1], 'second has higher or equal count than third');
  });

  it('filters out zero-count amenities', () => {
    const result = aggregateFacets([mockFacet1]);
    const top = getTopAmenities(result, 20);

    // mockFacet1 has 7 true amenities
    assertEqual(top.length, 7, 'returns only amenities with count > 0');
    for (const [, count] of top) {
      assert(count > 0, `count ${count} > 0`);
    }
  });
});

describe('getTopNearbyCategories', () => {
  it('returns top nearby categories sorted by count', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);
    const top = getTopNearbyCategories(result, 'within1', 3);

    assertEqual(top.length, 3, 'returns 3 categories');
    assert(top[0][1] >= top[1][1], 'first has higher or equal count than second');
    assert(top[1][1] >= top[2][1], 'second has higher or equal count than third');
  });

  it('uses different buckets correctly', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);

    const topWithin025 = getTopNearbyCategories(result, 'within025', 20);
    const topWithin1 = getTopNearbyCategories(result, 'within1', 20);

    // within025 should have fewer matches than within1
    const total025 = topWithin025.reduce((sum, [, c]) => sum + c, 0);
    const total1 = topWithin1.reduce((sum, [, c]) => sum + c, 0);

    assert(total025 <= total1, 'within025 total <= within1 total');
  });
});

describe('aggregateFacets - price, rating, reviews, dine options', () => {
  it('counts price buckets correctly', () => {
    // mockFacet1: price_2, mockFacet2: price_1, mockFacet3: price_3, mockFacet4: price_unknown, mockFacet5: price_2
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    assertEqual(result.priceCounts['price_1'], 1, 'price_1 count is 1');
    assertEqual(result.priceCounts['price_2'], 2, 'price_2 count is 2');
    assertEqual(result.priceCounts['price_3'], 1, 'price_3 count is 1');
    assertEqual(result.priceCounts['price_unknown'], 1, 'price_unknown count is 1');
  });

  it('counts rating buckets correctly', () => {
    // mockFacet1: 4.5+, 4.0+, 3.5+ (all true)
    // mockFacet2: 4.0+, 3.5+ (not 4.5)
    // mockFacet3: 4.5+, 4.0+, 3.5+ (all true)
    // mockFacet4: only 3.5+ (not 4.0, not 4.5)
    // mockFacet5: 4.0+, 3.5+ (not 4.5)
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    assertEqual(result.ratingCounts['rating_45'], 2, 'rating_45 count is 2');
    assertEqual(result.ratingCounts['rating_40'], 4, 'rating_40 count is 4');
    assertEqual(result.ratingCounts['rating_35'], 5, 'rating_35 count is 5');
  });

  it('counts review count buckets correctly', () => {
    // mockFacet1: 100+, 500+ (not 1000)
    // mockFacet2: 100+ only
    // mockFacet3: 100+, 500+, 1000+ (all)
    // mockFacet4: none
    // mockFacet5: 100+ only
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    assertEqual(result.reviewCountCounts['reviews_100'], 4, 'reviews_100 count is 4');
    assertEqual(result.reviewCountCounts['reviews_500'], 2, 'reviews_500 count is 2');
    assertEqual(result.reviewCountCounts['reviews_1000'], 1, 'reviews_1000 count is 1');
  });

  it('counts dine options correctly', () => {
    // mockFacet1: dine_in, takeout (not delivery)
    // mockFacet2: dine_in, takeout, delivery (all)
    // mockFacet3: dine_in only
    // mockFacet4: dine_in, takeout
    // mockFacet5: dine_in, takeout, delivery (all)
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    assertEqual(result.dineOptionCounts['dine_in'], 5, 'dine_in count is 5');
    assertEqual(result.dineOptionCounts['takeout'], 4, 'takeout count is 4');
    assertEqual(result.dineOptionCounts['delivery'], 2, 'delivery count is 2');
  });
});

describe('createEmptyAggregatedFacets - new facets', () => {
  it('includes empty price, rating, reviews, dine option counts', () => {
    const empty = createEmptyAggregatedFacets();

    assert('priceCounts' in empty, 'has priceCounts');
    assert('ratingCounts' in empty, 'has ratingCounts');
    assert('reviewCountCounts' in empty, 'has reviewCountCounts');
    assert('dineOptionCounts' in empty, 'has dineOptionCounts');
    assert('standoutTagCounts' in empty, 'has standoutTagCounts');

    assertEqual(empty.priceCounts['price_1'], 0, 'price_1 is 0');
    assertEqual(empty.ratingCounts['rating_45'], 0, 'rating_45 is 0');
    assertEqual(empty.reviewCountCounts['reviews_100'], 0, 'reviews_100 is 0');
    assertEqual(empty.dineOptionCounts['dine_in'], 0, 'dine_in is 0');
    assertEqual(empty.standoutTagCounts['sushi'], 0, 'sushi tag is 0');
  });
});

describe('aggregateFacets - standout tags', () => {
  it('counts standout tags correctly', () => {
    // mockFacet1: crab_legs, fresh_food
    // mockFacet2: sushi, good_value
    // mockFacet3: mongolian_grill, clean
    // mockFacet4: no tags
    // mockFacet5: seafood, family_friendly
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    assertEqual(result.standoutTagCounts['crab_legs'], 1, 'crab_legs count is 1');
    assertEqual(result.standoutTagCounts['fresh_food'], 1, 'fresh_food count is 1');
    assertEqual(result.standoutTagCounts['sushi'], 1, 'sushi count is 1');
    assertEqual(result.standoutTagCounts['good_value'], 1, 'good_value count is 1');
    assertEqual(result.standoutTagCounts['mongolian_grill'], 1, 'mongolian_grill count is 1');
    assertEqual(result.standoutTagCounts['clean'], 1, 'clean count is 1');
    assertEqual(result.standoutTagCounts['seafood'], 1, 'seafood count is 1');
    assertEqual(result.standoutTagCounts['family_friendly'], 1, 'family_friendly count is 1');
  });

  it('handles buffets with no tags', () => {
    // mockFacet4 has empty standoutTags
    const result = aggregateFacets([mockFacet4]);

    assertEqual(result.standoutTagCounts['sushi'], 0, 'sushi is 0 when no tags');
    assertEqual(result.totalBuffets, 1, 'still counts the buffet');
  });
});

describe('getTopStandoutTags', () => {
  it('returns top tags sorted by count', () => {
    // Create a result with varying counts
    const mockWithMultipleTags: BuffetFacetData = {
      ...mockFacet1,
      standoutTags: ['sushi', 'fresh_food'],
    };
    const result = aggregateFacets([mockFacet1, mockFacet2, mockWithMultipleTags]);
    const top = getTopStandoutTags(result, 3);

    // sushi appears in mockFacet2 and mockWithMultipleTags = 2
    // fresh_food appears in mockFacet1 and mockWithMultipleTags = 2
    assertEqual(top.length, 3, 'returns top 3 tags');
    assert(top[0][1] >= top[1][1], 'first has >= count than second');
    assert(top[1][1] >= top[2][1], 'second has >= count than third');
  });

  it('filters out zero-count tags', () => {
    const result = aggregateFacets([mockFacet1]); // only has crab_legs, fresh_food
    const top = getTopStandoutTags(result, 20);

    assertEqual(top.length, 2, 'returns only tags with count > 0');
    for (const [, count] of top) {
      assert(count > 0, `count ${count} > 0`);
    }
  });

  it('respects limit parameter', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3]);
    const limited = getTopStandoutTags(result, 2);

    assertEqual(limited.length, 2, 'returns only 2 tags');
  });
});

describe('aggregateFacets - neighborhoods', () => {
  it('counts neighborhoods correctly', () => {
    // mockFacet1 and mockFacet2 have 'downtown', mockFacet3 and mockFacet5 have 'midtown', mockFacet4 has 'east-side'
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet4, mockFacet5]);

    // downtown: 2, midtown: 2, east-side: 1 (singleton, should be filtered out)
    assertEqual(result.neighborhoodCounts['downtown'], 2, 'downtown count is 2');
    assertEqual(result.neighborhoodCounts['midtown'], 2, 'midtown count is 2');
    assertEqual(result.neighborhoodCounts['east-side'], undefined, 'east-side filtered out (count < MIN_NEIGHBORHOOD_COUNT)');
  });

  it('filters out singleton neighborhoods', () => {
    const result = aggregateFacets([mockFacet1, mockFacet4]); // downtown: 1, east-side: 1

    // Both are singletons, should be empty
    assertEqual(Object.keys(result.neighborhoodCounts).length, 0, 'no neighborhoods (all singletons)');
  });

  it('handles buffets without neighborhoods', () => {
    const noNeighborhood: BuffetFacetData = {
      ...mockFacet1,
      neighborhood: null,
    };
    const result = aggregateFacets([mockFacet1, mockFacet2, noNeighborhood]);

    // downtown: 2 (from mockFacet1 and mockFacet2), null is ignored
    assertEqual(result.neighborhoodCounts['downtown'], 2, 'downtown count is 2');
    assertEqual(result.totalBuffets, 3, 'totalBuffets includes buffet without neighborhood');
  });

  it('includes all neighborhoods meeting threshold', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet5]);

    // downtown: 2, midtown: 2
    const keys = Object.keys(result.neighborhoodCounts);
    assertEqual(keys.length, 2, 'has 2 neighborhoods');
    assert(keys.includes('downtown'), 'includes downtown');
    assert(keys.includes('midtown'), 'includes midtown');
  });
});

describe('getNeighborhoods', () => {
  it('returns neighborhoods sorted by count descending', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet5, mockFacet1, mockFacet1]); // downtown: 4, midtown: 2
    const neighborhoods = getNeighborhoods(result);

    assertEqual(neighborhoods.length, 2, 'returns 2 neighborhoods');
    assertEqual(neighborhoods[0][0], 'downtown', 'downtown is first (higher count)');
    assertEqual(neighborhoods[0][1], 4, 'downtown has count 4');
    assertEqual(neighborhoods[1][0], 'midtown', 'midtown is second');
    assertEqual(neighborhoods[1][1], 2, 'midtown has count 2');
  });

  it('respects limit parameter', () => {
    const result = aggregateFacets([mockFacet1, mockFacet2, mockFacet3, mockFacet5]);
    const limited = getNeighborhoods(result, 1);

    assertEqual(limited.length, 1, 'returns only 1 neighborhood');
  });

  it('returns empty for no neighborhoods', () => {
    const result = aggregateFacets([mockFacet4]); // Only singleton
    const neighborhoods = getNeighborhoods(result);

    assertEqual(neighborhoods.length, 0, 'returns empty array');
  });
});

describe('formatNeighborhoodLabel', () => {
  it('formats single word', () => {
    assertEqual(formatNeighborhoodLabel('downtown'), 'Downtown', 'capitalizes single word');
  });

  it('formats hyphenated words', () => {
    assertEqual(formatNeighborhoodLabel('east-side'), 'East Side', 'formats hyphenated');
  });

  it('formats multiple hyphens', () => {
    assertEqual(formatNeighborhoodLabel('south-central-houston'), 'South Central Houston', 'formats multiple hyphens');
  });
});

describe('MIN_NEIGHBORHOOD_COUNT constant', () => {
  it('is set to 2', () => {
    assertEqual(MIN_NEIGHBORHOOD_COUNT, 2, 'MIN_NEIGHBORHOOD_COUNT is 2');
  });
});

describe('createEmptyAggregatedFacets - neighborhoods', () => {
  it('includes empty neighborhoodCounts', () => {
    const empty = createEmptyAggregatedFacets();
    assert('neighborhoodCounts' in empty, 'has neighborhoodCounts property');
    assertEqual(Object.keys(empty.neighborhoodCounts).length, 0, 'neighborhoodCounts is empty');
  });
});

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('\n========================================');
console.log('aggregateFacets Tests');
console.log('========================================');

// Tests are run when describe/it are called above

console.log('\n========================================');
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log('========================================\n');

process.exit(failCount > 0 ? 1 : 0);
