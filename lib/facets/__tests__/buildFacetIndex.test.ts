/**
 * Tests for buildFacetIndex
 *
 * Run with: npx tsx lib/facets/__tests__/buildFacetIndex.test.ts
 */

import {
  buildFacetIndex,
  parseDistanceToMiles,
  normalizeNeighborhoodSlug,
  type BuffetForFacets,
} from '../buildFacetIndex';
import {
  bucketizeRating,
  bucketizeReviewCount,
  parsePriceToBucket,
  extractStandoutTags,
} from '../taxonomy';

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

const mockBuffetFull: BuffetForFacets = {
  id: 'test-buffet-1',
  amenities: {
    takeout: true,
    delivery: false,
    dineIn: true,
    reservable: true,
    wifi: 'yes',
    parking: { streetParking: true, freeParking: true },
    wheelchairAccessible: true,
    alcohol: true,
    creditCards: true,
    outdoorSeating: false,
    amenities: ['Free WiFi', 'Parking Available', 'Family Friendly'],
  },
  accessibility: {
    wheelchairAccessibleEntrance: true,
  },
  transportationAutomotive: {
    summary: 'Good transit options nearby',
    highlights: [
      {
        label: 'Parking',
        items: [
          { name: 'City Garage', category: 'parking_lot', distanceText: '~200 ft' },
          { name: 'Street Parking', category: 'parking', distanceText: '~500 ft' },
        ],
      },
      {
        label: 'Public Transit',
        items: [
          { name: 'Main St Station', category: 'bus_station', distanceText: '~0.3 mi' },
          { name: 'Downtown Metro', category: 'subway', distanceText: '~0.8 mi' },
        ],
      },
      {
        label: 'Gas Stations',
        items: [
          { name: 'Shell Gas', category: 'gas_station', distanceText: '~0.4 mi' },
        ],
      },
    ],
    poiCount: 5,
  },
  accomodationLodging: {
    summary: 'Several hotels nearby',
    highlights: [
      {
        label: 'Hotels',
        items: [
          { name: 'Hilton Downtown', category: 'hotel', distanceText: '~0.2 mi' },
          { name: 'Budget Inn', category: 'motel', distanceText: '~0.6 mi' },
          { name: 'Far Away Hotel', category: 'hotel', distanceText: '~1.5 mi' }, // Should be excluded (>1mi)
        ],
      },
    ],
    poiCount: 3,
  },
  retailShopping: {
    summary: 'Shopping options',
    highlights: [
      {
        label: 'Grocery',
        items: [
          { name: 'Whole Foods', category: 'supermarket', distanceText: '~800 ft' },
        ],
      },
      {
        label: 'Shopping',
        items: [
          { name: 'Downtown Mall', category: 'shopping_mall', distanceText: '~0.5 mi' },
        ],
      },
    ],
    poiCount: 2,
  },
  recreationEntertainment: {
    summary: 'Parks and entertainment',
    highlights: [
      {
        label: 'Parks',
        items: [
          { name: 'Central Park', category: 'park', distanceText: '~1000 ft' },
        ],
      },
      {
        label: 'Nightlife',
        items: [
          { name: 'Jazz Club', category: 'bar', distanceText: '~0.25 mi' },
        ],
      },
      {
        label: 'Attractions',
        items: [
          { name: 'City Museum', category: 'museum', distanceText: '~0.7 mi' },
        ],
      },
    ],
    poiCount: 3,
  },
  educationLearning: {
    summary: 'Schools nearby',
    highlights: [
      {
        label: 'Schools',
        items: [
          { name: 'State University', category: 'university', distanceText: '~0.9 mi' },
        ],
      },
    ],
    poiCount: 1,
  },
};

const mockBuffetMinimal: BuffetForFacets = {
  id: 'test-buffet-2',
};

const mockBuffetPartial: BuffetForFacets = {
  id: 'test-buffet-3',
  amenities: {
    takeout: true,
    // Most amenities missing
  },
  transportationAutomotive: {
    highlights: [
      {
        label: 'Parking',
        items: [
          { name: 'Lot A', category: 'parking', distanceFt: 500 }, // Using distanceFt instead of distanceText
        ],
      },
    ],
  },
};

// Full buffet with all new fields
const mockBuffetWithNewFields: BuffetForFacets = {
  id: 'test-buffet-4',
  rating: 4.6,
  reviewsCount: 750,
  price: '$$',
  neighborhood: 'Downtown Houston',
  amenities: {
    takeout: true,
    delivery: true,
    dineIn: true,
  },
  what_customers_are_saying_seo: 'Customers love the fresh crab legs and huge selection. The sushi is always fresh and the staff is very friendly.',
  reviewSummaryParagraph1: 'Great value for money with generous portions.',
};

// Buffet with missing rating
const mockBuffetNoRating: BuffetForFacets = {
  id: 'test-buffet-5',
  rating: null,
  reviewsCount: 50,
  price: '$15-25',
};

// Buffet with missing price
const mockBuffetNoPrice: BuffetForFacets = {
  id: 'test-buffet-6',
  rating: 3.8,
  reviewsCount: null,
  price: null,
};

// Buffet with edge case values
const mockBuffetEdgeCases: BuffetForFacets = {
  id: 'test-buffet-7',
  rating: 4.0, // Exactly on boundary
  reviewsCount: 100, // Exactly on boundary
  price: '$$$',
  neighborhood: '  East Side / Arts District  ', // Extra spaces and special chars
  what_customers_are_saying_seo: 'The mongolian grill station is great. Very clean restaurant with friendly staff.',
};

// =============================================================================
// TESTS
// =============================================================================

describe('parseDistanceToMiles', () => {
  it('parses feet distances', () => {
    assertEqual(parseDistanceToMiles('~800 ft'), 800 / 5280, 'parses "~800 ft"');
    assertEqual(parseDistanceToMiles('1000ft'), 1000 / 5280, 'parses "1000ft"');
    assertEqual(parseDistanceToMiles('~500 feet'), 500 / 5280, 'parses "~500 feet"');
  });

  it('parses mile distances', () => {
    assertEqual(parseDistanceToMiles('~0.5 mi'), 0.5, 'parses "~0.5 mi"');
    assertEqual(parseDistanceToMiles('1.2mi'), 1.2, 'parses "1.2mi"');
    assertEqual(parseDistanceToMiles('~0.25 miles'), 0.25, 'parses "~0.25 miles"');
  });

  it('falls back to distanceFt', () => {
    assertEqual(
      parseDistanceToMiles(undefined, 5280),
      1.0,
      'converts 5280 ft to 1.0 mi'
    );
    assertEqual(
      parseDistanceToMiles('invalid', 2640),
      0.5,
      'uses distanceFt when text invalid'
    );
  });

  it('returns Infinity for invalid input', () => {
    assertEqual(parseDistanceToMiles(), Infinity, 'returns Infinity for no input');
    assertEqual(
      parseDistanceToMiles('invalid text'),
      Infinity,
      'returns Infinity for invalid text'
    );
  });
});

describe('buildFacetIndex - amenities', () => {
  it('extracts amenities from full buffet', () => {
    const result = buildFacetIndex(mockBuffetFull);

    assertEqual(result.amenities.takeout, true, 'takeout is true');
    assertEqual(result.amenities.delivery, false, 'delivery is false');
    assertEqual(result.amenities.reservations, true, 'reservations is true');
    assertEqual(result.amenities.wifi, true, 'wifi is true');
    assertEqual(result.amenities.parking, true, 'parking is true');
    assertEqual(result.amenities.wheelchair_accessible, true, 'wheelchair_accessible is true');
    assertEqual(result.amenities.alcohol, true, 'alcohol is true');
    assertEqual(result.amenities.credit_cards_accepted, true, 'credit_cards_accepted is true');
    assertEqual(result.amenities.kids_friendly, true, 'kids_friendly from amenities array');
  });

  it('returns all false for minimal buffet', () => {
    const result = buildFacetIndex(mockBuffetMinimal);

    for (const key of Object.keys(result.amenities)) {
      assertEqual(
        result.amenities[key as keyof typeof result.amenities],
        false,
        `${key} is false`
      );
    }
  });

  it('handles partial amenities', () => {
    const result = buildFacetIndex(mockBuffetPartial);

    assertEqual(result.amenities.takeout, true, 'takeout is true');
    assertEqual(result.amenities.delivery, false, 'delivery defaults to false');
  });
});

describe('buildFacetIndex - nearby POIs', () => {
  it('extracts nearby POIs with correct bucket flags', () => {
    const result = buildFacetIndex(mockBuffetFull);

    // Parking: 200ft and 500ft - both within025
    assertEqual(result.nearby.parking_lot.count, 2, 'parking_lot count is 2');
    assertEqual(result.nearby.parking_lot.within025, true, 'parking within 0.25mi');
    assertEqual(result.nearby.parking_lot.within05, true, 'parking within 0.5mi');
    assertEqual(result.nearby.parking_lot.within1, true, 'parking within 1mi');

    // Transit: 0.3mi and 0.8mi
    assertEqual(result.nearby.transit.count, 2, 'transit count is 2');
    assertEqual(result.nearby.transit.within025, false, 'transit not within 0.25mi');
    assertEqual(result.nearby.transit.within05, true, 'transit within 0.5mi');
    assertEqual(result.nearby.transit.within1, true, 'transit within 1mi');

    // Gas station: 0.4mi
    assertEqual(result.nearby.gas_station.count, 1, 'gas_station count is 1');
    assertEqual(result.nearby.gas_station.within025, false, 'gas_station not within 0.25mi');
    assertEqual(result.nearby.gas_station.within05, true, 'gas_station within 0.5mi');

    // Hotels: 0.2mi and 0.6mi (1.5mi excluded)
    assertEqual(result.nearby.hotel.count, 2, 'hotel count is 2 (1.5mi excluded)');
    assertEqual(result.nearby.hotel.within025, true, 'hotel within 0.25mi');
    assertEqual(result.nearby.hotel.within1, true, 'hotel within 1mi');

    // Grocery: 800ft
    assertEqual(result.nearby.grocery.count, 1, 'grocery count is 1');
    assertEqual(result.nearby.grocery.within025, true, 'grocery within 0.25mi');

    // Shopping: 0.5mi
    assertEqual(result.nearby.shopping.count, 1, 'shopping count is 1');
    assertEqual(result.nearby.shopping.within05, true, 'shopping within 0.5mi');

    // Park: 1000ft
    assertEqual(result.nearby.park.count, 1, 'park count is 1');
    assertEqual(result.nearby.park.within025, true, 'park within 0.25mi');

    // Nightlife: 0.25mi
    assertEqual(result.nearby.nightlife.count, 1, 'nightlife count is 1');
    assertEqual(result.nearby.nightlife.within025, true, 'nightlife within 0.25mi');

    // Tourist attraction: 0.7mi
    assertEqual(result.nearby.tourist_attraction.count, 1, 'tourist_attraction count is 1');
    assertEqual(result.nearby.tourist_attraction.within1, true, 'tourist_attraction within 1mi');

    // Education: 0.9mi
    assertEqual(result.nearby.education.count, 1, 'education count is 1');
    assertEqual(result.nearby.education.within1, true, 'education within 1mi');
  });

  it('returns zero counts for minimal buffet', () => {
    const result = buildFacetIndex(mockBuffetMinimal);

    for (const key of Object.keys(result.nearby)) {
      assertEqual(
        result.nearby[key as keyof typeof result.nearby].count,
        0,
        `${key} count is 0`
      );
    }
  });

  it('handles distanceFt fallback', () => {
    const result = buildFacetIndex(mockBuffetPartial);

    // 500ft = ~0.095mi, so within025
    assertEqual(result.nearby.parking_lot.count, 1, 'parking_lot count is 1');
    assertEqual(result.nearby.parking_lot.within025, true, 'parking within 0.25mi (from distanceFt)');
  });
});

describe('buildFacetIndex - result structure', () => {
  it('returns correct shape', () => {
    const result = buildFacetIndex(mockBuffetFull);

    assert('amenities' in result, 'has amenities property');
    assert('nearby' in result, 'has nearby property');
    assert(typeof result.amenities === 'object', 'amenities is object');
    assert(typeof result.nearby === 'object', 'nearby is object');
  });

  it('has all amenity keys', () => {
    const result = buildFacetIndex(mockBuffetFull);
    const expectedKeys = [
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
    ];

    for (const key of expectedKeys) {
      assert(key in result.amenities, `has amenity key: ${key}`);
    }
  });

  it('has all nearby category keys', () => {
    const result = buildFacetIndex(mockBuffetFull);
    const expectedKeys = [
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
    ];

    for (const key of expectedKeys) {
      assert(key in result.nearby, `has nearby key: ${key}`);
      assert('count' in result.nearby[key as keyof typeof result.nearby], `${key} has count`);
      assert(
        'within025' in result.nearby[key as keyof typeof result.nearby],
        `${key} has within025`
      );
      assert(
        'within05' in result.nearby[key as keyof typeof result.nearby],
        `${key} has within05`
      );
      assert(
        'within1' in result.nearby[key as keyof typeof result.nearby],
        `${key} has within1`
      );
    }
  });
});

// =============================================================================
// NEW FACET FIELD TESTS
// =============================================================================

describe('bucketizeRating', () => {
  it('bucketizes rating above 4.5', () => {
    const result = bucketizeRating(4.7);
    assertEqual(result.rating_45, true, '4.7 is >= 4.5');
    assertEqual(result.rating_40, true, '4.7 is >= 4.0');
    assertEqual(result.rating_35, true, '4.7 is >= 3.5');
  });

  it('bucketizes rating at 4.0', () => {
    const result = bucketizeRating(4.0);
    assertEqual(result.rating_45, false, '4.0 is not >= 4.5');
    assertEqual(result.rating_40, true, '4.0 is >= 4.0');
    assertEqual(result.rating_35, true, '4.0 is >= 3.5');
  });

  it('bucketizes rating below 3.5', () => {
    const result = bucketizeRating(3.2);
    assertEqual(result.rating_45, false, '3.2 is not >= 4.5');
    assertEqual(result.rating_40, false, '3.2 is not >= 4.0');
    assertEqual(result.rating_35, false, '3.2 is not >= 3.5');
  });

  it('handles null/undefined rating', () => {
    const resultNull = bucketizeRating(null);
    assertEqual(resultNull.rating_45, false, 'null rating: 4.5 is false');
    assertEqual(resultNull.rating_40, false, 'null rating: 4.0 is false');
    assertEqual(resultNull.rating_35, false, 'null rating: 3.5 is false');

    const resultUndefined = bucketizeRating(undefined);
    assertEqual(resultUndefined.rating_45, false, 'undefined rating: 4.5 is false');
  });
});

describe('bucketizeReviewCount', () => {
  it('bucketizes high review count', () => {
    const result = bucketizeReviewCount(1500);
    assertEqual(result.reviews_100, true, '1500 is >= 100');
    assertEqual(result.reviews_500, true, '1500 is >= 500');
    assertEqual(result.reviews_1000, true, '1500 is >= 1000');
  });

  it('bucketizes medium review count', () => {
    const result = bucketizeReviewCount(250);
    assertEqual(result.reviews_100, true, '250 is >= 100');
    assertEqual(result.reviews_500, false, '250 is not >= 500');
    assertEqual(result.reviews_1000, false, '250 is not >= 1000');
  });

  it('handles null/undefined count', () => {
    const result = bucketizeReviewCount(null);
    assertEqual(result.reviews_100, false, 'null count: 100 is false');
    assertEqual(result.reviews_500, false, 'null count: 500 is false');
    assertEqual(result.reviews_1000, false, 'null count: 1000 is false');
  });

  it('handles boundary value', () => {
    const result = bucketizeReviewCount(100);
    assertEqual(result.reviews_100, true, '100 is >= 100 (boundary)');
    assertEqual(result.reviews_500, false, '100 is not >= 500');
  });
});

describe('parsePriceToBucket', () => {
  it('parses dollar signs', () => {
    assertEqual(parsePriceToBucket('$'), 'price_1', '$ is price_1');
    assertEqual(parsePriceToBucket('$$'), 'price_2', '$$ is price_2');
    assertEqual(parsePriceToBucket('$$$'), 'price_3', '$$$ is price_3');
    assertEqual(parsePriceToBucket('$$$$'), 'price_3', '$$$$ is price_3');
  });

  it('parses price ranges', () => {
    assertEqual(parsePriceToBucket('$10-15'), 'price_1', '$10-15 is price_1');
    assertEqual(parsePriceToBucket('$15-25'), 'price_2', '$15-25 is price_2');
    assertEqual(parsePriceToBucket('$30-50'), 'price_3', '$30-50 is price_3');
  });

  it('parses text descriptors', () => {
    assertEqual(parsePriceToBucket('Budget'), 'price_1', 'Budget is price_1');
    assertEqual(parsePriceToBucket('Moderate'), 'price_2', 'Moderate is price_2');
    assertEqual(parsePriceToBucket('Expensive'), 'price_3', 'Expensive is price_3');
  });

  it('returns unknown for missing price', () => {
    assertEqual(parsePriceToBucket(null), 'price_unknown', 'null is price_unknown');
    assertEqual(parsePriceToBucket(undefined), 'price_unknown', 'undefined is price_unknown');
    assertEqual(parsePriceToBucket(''), 'price_unknown', 'empty string is price_unknown');
  });

  it('returns unknown for unrecognized format', () => {
    assertEqual(parsePriceToBucket('varies'), 'price_unknown', '"varies" is price_unknown');
    assertEqual(parsePriceToBucket('call for price'), 'price_unknown', 'unrecognized is price_unknown');
  });
});

describe('extractStandoutTags', () => {
  it('extracts food-related tags', () => {
    const tags = extractStandoutTags('The crab legs are amazing and the sushi is always fresh');
    assert(tags.includes('crab_legs'), 'extracts crab_legs');
    assert(tags.includes('sushi'), 'extracts sushi');
    assert(tags.includes('fresh_food'), 'extracts fresh_food');
  });

  it('extracts service-related tags', () => {
    const tags = extractStandoutTags('Very clean restaurant with friendly staff and fast service');
    assert(tags.includes('clean'), 'extracts clean');
    assert(tags.includes('friendly_staff'), 'extracts friendly_staff');
    assert(tags.includes('fast_service'), 'extracts fast_service');
  });

  it('extracts value-related tags', () => {
    const tags = extractStandoutTags('Great value for the price with generous portions. Very affordable!');
    assert(tags.includes('good_value'), 'extracts good_value');
    assert(tags.includes('generous_portions'), 'extracts generous_portions');
    assert(tags.includes('affordable'), 'extracts affordable');
  });

  it('handles empty/null input', () => {
    assertEqual(extractStandoutTags(null), [], 'null returns empty array');
    assertEqual(extractStandoutTags(undefined), [], 'undefined returns empty array');
    assertEqual(extractStandoutTags(''), [], 'empty string returns empty array');
  });

  it('handles text with no matches', () => {
    const tags = extractStandoutTags('The restaurant is okay');
    assertEqual(tags.length, 0, 'no matches returns empty array');
  });

  it('extracts special feature tags', () => {
    const tags = extractStandoutTags('Great mongolian grill station and hibachi');
    assert(tags.includes('mongolian_grill'), 'extracts mongolian_grill');
    assert(tags.includes('hibachi'), 'extracts hibachi');
  });
});

describe('normalizeNeighborhoodSlug', () => {
  it('normalizes simple neighborhood', () => {
    assertEqual(normalizeNeighborhoodSlug('Downtown'), 'downtown', 'lowercases');
  });

  it('normalizes neighborhood with spaces', () => {
    assertEqual(normalizeNeighborhoodSlug('East Side'), 'east-side', 'replaces spaces');
  });

  it('normalizes neighborhood with special chars', () => {
    assertEqual(normalizeNeighborhoodSlug('Arts & Culture District'), 'arts-culture-district', 'replaces special chars');
  });

  it('handles leading/trailing spaces', () => {
    assertEqual(normalizeNeighborhoodSlug('  Downtown  '), 'downtown', 'trims spaces');
  });

  it('handles null/undefined', () => {
    assertEqual(normalizeNeighborhoodSlug(null), null, 'null returns null');
    assertEqual(normalizeNeighborhoodSlug(undefined), null, 'undefined returns null');
    assertEqual(normalizeNeighborhoodSlug(''), null, 'empty string returns null');
  });
});

describe('buildFacetIndex - new fields', () => {
  it('extracts rating buckets', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assertEqual(result.ratingBuckets.rating_45, true, 'rating 4.6 >= 4.5');
    assertEqual(result.ratingBuckets.rating_40, true, 'rating 4.6 >= 4.0');
    assertEqual(result.ratingBuckets.rating_35, true, 'rating 4.6 >= 3.5');
  });

  it('extracts review count buckets', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assertEqual(result.reviewCountBuckets.reviews_100, true, '750 reviews >= 100');
    assertEqual(result.reviewCountBuckets.reviews_500, true, '750 reviews >= 500');
    assertEqual(result.reviewCountBuckets.reviews_1000, false, '750 reviews not >= 1000');
  });

  it('extracts price bucket', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assertEqual(result.priceBucket, 'price_2', '$$ is price_2');
  });

  it('extracts dine options', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assertEqual(result.dineOptions.dine_in, true, 'dine_in is true');
    assertEqual(result.dineOptions.takeout, true, 'takeout is true');
    assertEqual(result.dineOptions.delivery, true, 'delivery is true');
  });

  it('extracts standout tags from multiple text sources', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assert(result.standoutTags.includes('crab_legs'), 'extracts crab_legs from what_customers_are_saying');
    assert(result.standoutTags.includes('sushi'), 'extracts sushi');
    assert(result.standoutTags.includes('friendly_staff'), 'extracts friendly_staff');
    assert(result.standoutTags.includes('good_value'), 'extracts good_value from reviewSummaryParagraph1');
  });

  it('extracts neighborhood slug', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assertEqual(result.neighborhood, 'downtown-houston', 'normalizes neighborhood to slug');
  });
});

describe('buildFacetIndex - missing fields', () => {
  it('handles missing rating', () => {
    const result = buildFacetIndex(mockBuffetNoRating);
    assertEqual(result.ratingBuckets.rating_45, false, 'null rating: 4.5 is false');
    assertEqual(result.ratingBuckets.rating_40, false, 'null rating: 4.0 is false');
    assertEqual(result.ratingBuckets.rating_35, false, 'null rating: 3.5 is false');
  });

  it('handles missing price', () => {
    const result = buildFacetIndex(mockBuffetNoPrice);
    assertEqual(result.priceBucket, 'price_unknown', 'null price is price_unknown');
  });

  it('handles missing reviewsCount', () => {
    const result = buildFacetIndex(mockBuffetNoPrice);
    assertEqual(result.reviewCountBuckets.reviews_100, false, 'null count: 100 is false');
    assertEqual(result.reviewCountBuckets.reviews_500, false, 'null count: 500 is false');
    assertEqual(result.reviewCountBuckets.reviews_1000, false, 'null count: 1000 is false');
  });

  it('handles missing neighborhood', () => {
    const result = buildFacetIndex(mockBuffetNoRating);
    assertEqual(result.neighborhood, null, 'missing neighborhood returns null');
  });

  it('handles missing standout text', () => {
    const result = buildFacetIndex(mockBuffetMinimal);
    assertEqual(result.standoutTags.length, 0, 'no text returns empty standout tags');
  });

  it('handles minimal buffet for all new fields', () => {
    const result = buildFacetIndex(mockBuffetMinimal);
    assertEqual(result.priceBucket, 'price_unknown', 'minimal buffet: price_unknown');
    assertEqual(result.ratingBuckets.rating_45, false, 'minimal buffet: rating buckets false');
    assertEqual(result.reviewCountBuckets.reviews_100, false, 'minimal buffet: review buckets false');
    assertEqual(result.dineOptions.dine_in, false, 'minimal buffet: dine_in false');
    assertEqual(result.dineOptions.takeout, false, 'minimal buffet: takeout false');
    assertEqual(result.dineOptions.delivery, false, 'minimal buffet: delivery false');
    assertEqual(result.neighborhood, null, 'minimal buffet: neighborhood null');
  });
});

describe('buildFacetIndex - edge cases', () => {
  it('handles boundary rating (4.0 exactly)', () => {
    const result = buildFacetIndex(mockBuffetEdgeCases);
    assertEqual(result.ratingBuckets.rating_45, false, '4.0 is not >= 4.5');
    assertEqual(result.ratingBuckets.rating_40, true, '4.0 is >= 4.0 (boundary)');
    assertEqual(result.ratingBuckets.rating_35, true, '4.0 is >= 3.5');
  });

  it('handles boundary review count (100 exactly)', () => {
    const result = buildFacetIndex(mockBuffetEdgeCases);
    assertEqual(result.reviewCountBuckets.reviews_100, true, '100 is >= 100 (boundary)');
    assertEqual(result.reviewCountBuckets.reviews_500, false, '100 is not >= 500');
  });

  it('handles $$$ price', () => {
    const result = buildFacetIndex(mockBuffetEdgeCases);
    assertEqual(result.priceBucket, 'price_3', '$$$ is price_3');
  });

  it('handles neighborhood with special characters', () => {
    const result = buildFacetIndex(mockBuffetEdgeCases);
    assertEqual(result.neighborhood, 'east-side-arts-district', 'normalizes special chars in neighborhood');
  });

  it('extracts tags from edge case text', () => {
    const result = buildFacetIndex(mockBuffetEdgeCases);
    assert(result.standoutTags.includes('mongolian_grill'), 'extracts mongolian_grill');
    assert(result.standoutTags.includes('clean'), 'extracts clean');
    assert(result.standoutTags.includes('friendly_staff'), 'extracts friendly_staff');
  });
});

describe('buildFacetIndex - result structure (new fields)', () => {
  it('has all new field properties', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    
    assert('ratingBuckets' in result, 'has ratingBuckets');
    assert('reviewCountBuckets' in result, 'has reviewCountBuckets');
    assert('priceBucket' in result, 'has priceBucket');
    assert('dineOptions' in result, 'has dineOptions');
    assert('standoutTags' in result, 'has standoutTags');
    assert('neighborhood' in result, 'has neighborhood');
  });

  it('has correct rating bucket keys', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assert('rating_45' in result.ratingBuckets, 'has rating_45');
    assert('rating_40' in result.ratingBuckets, 'has rating_40');
    assert('rating_35' in result.ratingBuckets, 'has rating_35');
  });

  it('has correct review count bucket keys', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assert('reviews_100' in result.reviewCountBuckets, 'has reviews_100');
    assert('reviews_500' in result.reviewCountBuckets, 'has reviews_500');
    assert('reviews_1000' in result.reviewCountBuckets, 'has reviews_1000');
  });

  it('has correct dine option keys', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assert('dine_in' in result.dineOptions, 'has dine_in');
    assert('takeout' in result.dineOptions, 'has takeout');
    assert('delivery' in result.dineOptions, 'has delivery');
  });

  it('standoutTags is an array', () => {
    const result = buildFacetIndex(mockBuffetWithNewFields);
    assert(Array.isArray(result.standoutTags), 'standoutTags is array');
  });
});

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('\n========================================');
console.log('buildFacetIndex Tests');
console.log('========================================');

// Tests are run when describe/it are called above

console.log('\n========================================');
console.log(`Results: ${passCount} passed, ${failCount} failed`);
console.log('========================================\n');

process.exit(failCount > 0 ? 1 : 0);
