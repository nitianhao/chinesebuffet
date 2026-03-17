/**
 * Tests for lib/neighborhoodChampion.ts
 *
 * Run with: npx tsx lib/neighborhoodChampion.test.ts
 */

import {
  rankBuffetsInGroup,
  computeNeighborhoodChampion,
  computeAllNeighborhoodChampions,
} from './neighborhoodChampion';
import type { Buffet } from './data';

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
// MOCK BUFFET FACTORY
// =============================================================================

let _id = 0;
function makeBuffet(overrides: Partial<Buffet> & { name: string }): Buffet {
  _id++;
  return {
    id: `buffet-${_id}`,
    slug: overrides.name.toLowerCase().replace(/\s+/g, '-'),
    address: {
      street: '123 Main St',
      city: 'Houston',
      state: 'Texas',
      stateAbbr: 'TX',
      postalCode: '77001',
      full: '123 Main St, Houston, TX 77001',
    },
    location: { lat: 29.7, lng: -95.4 },
    phone: '',
    phoneUnformatted: '',
    website: null,
    price: null,
    rating: 4.0,
    reviewsCount: 100,
    hours: [],
    categories: [],
    categoryName: 'Chinese Buffet',
    neighborhood: null,
    permanentlyClosed: false,
    temporarilyClosed: false,
    placeId: null,
    imagesCount: 0,
    citySlug: 'houston-tx',
    ...overrides,
  } as Buffet;
}

// =============================================================================
// MOCK DATA — matches spec validation examples
// =============================================================================

// Houston / Sharpstown (15 buffets)
const sharpstownChampion = makeBuffet({ name: 'Stone Age Street Food', rating: 4.8, reviewsCount: 476, neighborhood: 'Sharpstown', citySlug: 'houston-tx' });
const sharpstownBuffets: Buffet[] = [
  sharpstownChampion,
  ...Array.from({ length: 14 }, (_, i) =>
    makeBuffet({ name: `Sharpstown Other ${i + 1}`, rating: 4.7 - i * 0.05, reviewsCount: 200, neighborhood: 'Sharpstown', citySlug: 'houston-tx' })
  ),
];

// Houston / Montrose (9 buffets)
const montroseBuffets: Buffet[] = [
  makeBuffet({ name: 'Triple Pepper', rating: 4.8, reviewsCount: 324, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Cooking Girl',  rating: 4.7, reviewsCount: 354, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet C',      rating: 4.5, reviewsCount: 200, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet D',      rating: 4.4, reviewsCount: 150, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet E',      rating: 4.3, reviewsCount: 120, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet F',      rating: 4.2, reviewsCount: 100, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet G',      rating: 4.1, reviewsCount:  90, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet H',      rating: 4.0, reviewsCount:  80, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
  makeBuffet({ name: 'Buffet I',      rating: 3.9, reviewsCount:  70, neighborhood: 'Montrose', citySlug: 'houston-tx' }),
];
const [triplePepper, cookingGirl] = montroseBuffets;

// Chicago / Armour Square (20 buffets) — tie on rating at top
const armourSquareTop2: Buffet[] = [
  makeBuffet({ name: 'Qing Xiang Yuan', rating: 4.6, reviewsCount: 3073, neighborhood: 'Armour Square', citySlug: 'chicago-il', address: { street: '1', city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', postalCode: '60616', full: '' } }),
  makeBuffet({ name: 'Golden Bull',     rating: 4.6, reviewsCount:  507, neighborhood: 'Armour Square', citySlug: 'chicago-il', address: { street: '1', city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', postalCode: '60616', full: '' } }),
];
const armourSquareOthers: Buffet[] = Array.from({ length: 18 }, (_, i) =>
  makeBuffet({ name: `Armour Other ${i + 1}`, rating: 4.0 - i * 0.1, reviewsCount: 200, neighborhood: 'Armour Square', citySlug: 'chicago-il', address: { street: '1', city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', postalCode: '60616', full: '' } })
);
const armourSquareBuffets = [...armourSquareTop2, ...armourSquareOthers];
const [qingXiangYuan, goldenBull] = armourSquareTop2;

// Chicago / Wicker Park (sole occupant)
const chengduBistro = makeBuffet({
  name: 'Chengdu Bistro', rating: 4.8, reviewsCount: 288,
  neighborhood: 'Wicker Park', citySlug: 'chicago-il',
  address: { street: '1', city: 'Chicago', state: 'Illinois', stateAbbr: 'IL', postalCode: '60647', full: '' },
});

// Two-buffet neighborhood (rank-2 count=2 edge case)
const twoBuffetNeighborhood: Buffet[] = [
  makeBuffet({ name: 'Alpha Buffet', rating: 4.5, reviewsCount: 200, neighborhood: 'Tiny Hood', citySlug: 'dallas-tx', address: { street: '1', city: 'Dallas', state: 'Texas', stateAbbr: 'TX', postalCode: '75001', full: '' } }),
  makeBuffet({ name: 'Beta Buffet',  rating: 4.2, reviewsCount: 100, neighborhood: 'Tiny Hood', citySlug: 'dallas-tx', address: { street: '1', city: 'Dallas', state: 'Texas', stateAbbr: 'TX', postalCode: '75001', full: '' } }),
];
const [, betaTinyHood] = twoBuffetNeighborhood;

// No neighborhood
const noNeighborBuffet = makeBuffet({ name: 'No Hood', rating: 4.5, reviewsCount: 100, neighborhood: null, citySlug: 'houston-tx' });

// =============================================================================
// TESTS: rankBuffetsInGroup
// =============================================================================

describe('rankBuffetsInGroup', () => {
  it('returns empty array for empty input', () => {
    assertEqual(rankBuffetsInGroup([]), [], 'empty input → empty output');
  });

  it('assigns rank 1 to a single buffet', () => {
    const result = rankBuffetsInGroup([triplePepper]);
    assertEqual(result.length, 1, 'result length is 1');
    assertEqual(result[0].rank, 1, 'rank is 1');
    assert(result[0].buffet === triplePepper, 'buffet object identity preserved');
  });

  it('sorts by rating descending', () => {
    const a = makeBuffet({ name: 'Low',  rating: 4.0, reviewsCount: 500 });
    const b = makeBuffet({ name: 'High', rating: 4.8, reviewsCount: 100 });
    const result = rankBuffetsInGroup([a, b]);
    assertEqual(result[0].buffet.name, 'High', 'higher rating is rank 1');
    assertEqual(result[1].buffet.name, 'Low',  'lower rating is rank 2');
    assertEqual(result[0].rank, 1, 'rank 1 assigned');
    assertEqual(result[1].rank, 2, 'rank 2 assigned');
  });

  it('breaks rating tie by reviewsCount descending', () => {
    const a = makeBuffet({ name: 'Few Reviews',  rating: 4.6, reviewsCount:  507 });
    const b = makeBuffet({ name: 'Many Reviews', rating: 4.6, reviewsCount: 3073 });
    const result = rankBuffetsInGroup([a, b]);
    assertEqual(result[0].buffet.name, 'Many Reviews', 'more reviews wins tie');
    assertEqual(result[1].buffet.name, 'Few Reviews',  'fewer reviews loses tie');
  });

  it('breaks rating+reviewsCount tie by name ascending', () => {
    const a = makeBuffet({ name: 'Zebra', rating: 4.6, reviewsCount: 500 });
    const b = makeBuffet({ name: 'Apple', rating: 4.6, reviewsCount: 500 });
    const result = rankBuffetsInGroup([a, b]);
    assertEqual(result[0].buffet.name, 'Apple', 'alphabetically first wins tie');
    assertEqual(result[1].buffet.name, 'Zebra', 'alphabetically last loses tie');
  });

  it('assigns sequential ranks for the Montrose group', () => {
    const result = rankBuffetsInGroup(montroseBuffets);
    assertEqual(result.length, 9, '9 buffets ranked');
    assertEqual(result[0].rank, 1, 'first is rank 1');
    assertEqual(result[0].buffet.name, 'Triple Pepper', 'Triple Pepper is rank 1');
    assertEqual(result[1].rank, 2, 'second is rank 2');
    assertEqual(result[1].buffet.name, 'Cooking Girl', 'Cooking Girl is rank 2');
    assertEqual(result[8].rank, 9, 'last is rank 9');
  });
});

// =============================================================================
// TESTS: computeNeighborhoodChampion — champion cases
// =============================================================================

describe('computeNeighborhoodChampion — champion', () => {
  it('Triple Pepper is champion of Montrose (9 buffets)', () => {
    const result = computeNeighborhoodChampion(triplePepper, montroseBuffets);
    assertEqual(result.isNeighborhoodChampion, true, 'isNeighborhoodChampion');
    assertEqual(result.neighborhoodRank, 1, 'rank 1');
    assertEqual(result.neighborhoodBuffetCount, 9, 'count 9');
    assertEqual(result.ratingGap, 0.1, 'ratingGap 0.1 (4.8 - 4.7)');
    assertEqual(result.neighborhoodBadgeText, '#1 of 9 in Montrose 🏆', 'badgeText');
    assertEqual(result.neighborhoodBadgeEmoji, '🏆', 'badgeEmoji');
    assertEqual(result.neighborhoodRankText, '#1 of 9 in Montrose', 'rankText');
    assertEqual(result.isOnlyInNeighborhood, false, 'not sole occupant');
  });

  it('Stone Age Street Food is champion of Sharpstown (15 buffets)', () => {
    const result = computeNeighborhoodChampion(sharpstownChampion, sharpstownBuffets);
    assertEqual(result.isNeighborhoodChampion, true, 'isNeighborhoodChampion');
    assertEqual(result.neighborhoodRank, 1, 'rank 1');
    assertEqual(result.neighborhoodBuffetCount, 15, 'count 15');
    assertEqual(result.neighborhoodBadgeText, '#1 of 15 in Sharpstown 🏆', 'badgeText');
    assertEqual(result.neighborhoodBadgeEmoji, '🏆', 'badgeEmoji');
    assertEqual(result.neighborhoodRankText, '#1 of 15 in Sharpstown', 'rankText');
    assertEqual(result.isOnlyInNeighborhood, false, 'not sole occupant');
  });

  it('Qing Xiang Yuan wins Armour Square tie by reviewsCount (ratingGap 0.0)', () => {
    const result = computeNeighborhoodChampion(qingXiangYuan, armourSquareBuffets);
    assertEqual(result.isNeighborhoodChampion, true, 'isNeighborhoodChampion');
    assertEqual(result.neighborhoodRank, 1, 'rank 1');
    assertEqual(result.neighborhoodBuffetCount, 20, 'count 20');
    assertEqual(result.ratingGap, 0.0, 'ratingGap is 0.0 for tied rating');
    assertEqual(result.neighborhoodBadgeText, '#1 of 20 in Armour Square 🏆', 'badgeText');
    assertEqual(result.neighborhoodBadgeEmoji, '🏆', 'badgeEmoji');
    assertEqual(result.neighborhoodRankText, '#1 of 20 in Armour Square', 'rankText');
    assertEqual(result.isOnlyInNeighborhood, false, 'not sole occupant');
  });
});

// =============================================================================
// TESTS: computeNeighborhoodChampion — non-champion
// =============================================================================

describe('computeNeighborhoodChampion — non-champion', () => {
  it('Cooking Girl is rank 2 in Montrose with 🥈', () => {
    const result = computeNeighborhoodChampion(cookingGirl, montroseBuffets);
    assertEqual(result.isNeighborhoodChampion, false, 'not champion');
    assertEqual(result.neighborhoodRank, 2, 'rank 2');
    assertEqual(result.neighborhoodBuffetCount, 9, 'count 9');
    assertEqual(result.ratingGap, null, 'ratingGap null for non-champion');
    assertEqual(result.neighborhoodBadgeText, null, 'badgeText null');
    assertEqual(result.neighborhoodBadgeEmoji, '🥈', 'badgeEmoji 🥈');
    assertEqual(result.neighborhoodRankText, '#2 of 9 in Montrose', 'rankText');
    assertEqual(result.isOnlyInNeighborhood, false, 'not sole occupant');
  });

  it('Golden Bull is rank 2 in Armour Square with 🥈', () => {
    const result = computeNeighborhoodChampion(goldenBull, armourSquareBuffets);
    assertEqual(result.isNeighborhoodChampion, false, 'not champion');
    assertEqual(result.neighborhoodRank, 2, 'rank 2');
    assertEqual(result.neighborhoodBadgeEmoji, '🥈', 'badgeEmoji 🥈');
    assertEqual(result.ratingGap, null, 'ratingGap null');
  });

  it('rank 3 in a group of 4 gets 🥉', () => {
    const group = [
      makeBuffet({ name: 'A', rating: 4.8, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' }),
      makeBuffet({ name: 'B', rating: 4.7, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' }),
      makeBuffet({ name: 'C', rating: 4.6, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' }),
      makeBuffet({ name: 'D', rating: 4.5, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' }),
    ];
    const result = computeNeighborhoodChampion(group[2], group);
    assertEqual(result.neighborhoodRank, 3, 'rank 3');
    assertEqual(result.neighborhoodBadgeEmoji, '🥉', '🥉 for rank 3 count≥4');
    assertEqual(result.neighborhoodBadgeText, null, 'no badgeText for rank 3');
  });

  it('rank 4+ gets null emoji', () => {
    const group = Array.from({ length: 5 }, (_, i) =>
      makeBuffet({ name: `Buffet ${i}`, rating: 4.8 - i * 0.1, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' })
    );
    const result = computeNeighborhoodChampion(group[3], group);
    assertEqual(result.neighborhoodRank, 4, 'rank 4');
    assertEqual(result.neighborhoodBadgeEmoji, null, 'null emoji for rank 4+');
    assertEqual(result.neighborhoodBadgeText, null, 'no badgeText');
  });

  it('rank 2 in group of exactly 2 gets null emoji (🥈 requires count≥3)', () => {
    const result = computeNeighborhoodChampion(betaTinyHood, twoBuffetNeighborhood);
    assertEqual(result.isNeighborhoodChampion, false, 'not champion');
    assertEqual(result.neighborhoodRank, 2, 'rank 2');
    assertEqual(result.neighborhoodBuffetCount, 2, 'count 2');
    assertEqual(result.neighborhoodBadgeEmoji, null, 'null emoji (count < 3)');
    assertEqual(result.neighborhoodRankText, '#2 of 2 in Tiny Hood', 'rankText');
    assertEqual(result.neighborhoodBadgeText, null, 'null badgeText');
    assertEqual(result.ratingGap, null, 'null ratingGap');
  });
});

// =============================================================================
// TESTS: computeNeighborhoodChampion — sole occupant
// =============================================================================

describe('computeNeighborhoodChampion — sole occupant', () => {
  it('Chengdu Bistro is sole occupant of Wicker Park', () => {
    const result = computeNeighborhoodChampion(chengduBistro, [chengduBistro]);
    assertEqual(result.isOnlyInNeighborhood, true, 'isOnlyInNeighborhood true');
    assertEqual(result.isNeighborhoodChampion, false, 'not champion (sole occupant)');
    assertEqual(result.neighborhoodRank, 1, 'still rank 1');
    assertEqual(result.neighborhoodBuffetCount, 1, 'count 1');
    assertEqual(result.ratingGap, null, 'ratingGap null (no #2)');
    assertEqual(result.neighborhoodBadgeText, null, 'no badgeText');
    assertEqual(result.neighborhoodBadgeEmoji, null, 'no badgeEmoji');
    assertEqual(result.neighborhoodRankText, 'Only buffet in Wicker Park', 'rankText sole occupant');
  });
});

// =============================================================================
// TESTS: computeNeighborhoodChampion — no neighborhood
// =============================================================================

describe('computeNeighborhoodChampion — no neighborhood', () => {
  it('null neighborhood → all-null/false result', () => {
    const result = computeNeighborhoodChampion(noNeighborBuffet, [noNeighborBuffet]);
    assertEqual(result.isNeighborhoodChampion, false, 'not champion');
    assertEqual(result.neighborhoodRank, null, 'rank null');
    assertEqual(result.neighborhoodBuffetCount, null, 'count null');
    assertEqual(result.ratingGap, null, 'ratingGap null');
    assertEqual(result.neighborhoodBadgeText, null, 'badgeText null');
    assertEqual(result.neighborhoodBadgeEmoji, null, 'badgeEmoji null');
    assertEqual(result.neighborhoodRankText, null, 'rankText null');
    assertEqual(result.isOnlyInNeighborhood, false, 'isOnlyInNeighborhood false');
  });

  it('empty string neighborhood treated same as null', () => {
    const emptyNeighbor = makeBuffet({ name: 'Empty Hood', rating: 4.0, reviewsCount: 100, neighborhood: '' as unknown as null });
    const result = computeNeighborhoodChampion(emptyNeighbor, [emptyNeighbor]);
    assertEqual(result.isNeighborhoodChampion, false, 'not champion');
    assertEqual(result.neighborhoodRank, null, 'rank null');
    assertEqual(result.neighborhoodRankText, null, 'rankText null');
  });
});

// =============================================================================
// TESTS: computeAllNeighborhoodChampions
// =============================================================================

describe('computeAllNeighborhoodChampions', () => {
  it('returns array of same length as input', () => {
    const all = [...montroseBuffets, chengduBistro, noNeighborBuffet];
    const result = computeAllNeighborhoodChampions(all);
    assertEqual(result.length, all.length, 'output length === input length');
  });

  it('champions are computed independently per city', () => {
    const all = [...montroseBuffets, chengduBistro];
    const result = computeAllNeighborhoodChampions(all);
    const triplePepperOut = result.find(b => b.name === 'Triple Pepper')!;
    const chengduOut = result.find(b => b.name === 'Chengdu Bistro')!;
    assertEqual(triplePepperOut.isNeighborhoodChampion, true, 'Triple Pepper is champion');
    assertEqual(chengduOut.isOnlyInNeighborhood, true, 'Chengdu Bistro is sole occupant');
    assertEqual(chengduOut.isNeighborhoodChampion, false, 'Chengdu Bistro not champion');
  });

  it('buffets without citySlug fall back to address.city+stateAbbr grouping', () => {
    const a = makeBuffet({ name: 'No Slug A', rating: 4.8, reviewsCount: 100, neighborhood: 'Old Town', citySlug: undefined as unknown as string, address: { street: '', city: 'Denver', state: 'Colorado', stateAbbr: 'CO', postalCode: '', full: '' } });
    const b = makeBuffet({ name: 'No Slug B', rating: 4.5, reviewsCount: 100, neighborhood: 'Old Town', citySlug: undefined as unknown as string, address: { street: '', city: 'Denver', state: 'Colorado', stateAbbr: 'CO', postalCode: '', full: '' } });
    const result = computeAllNeighborhoodChampions([a, b]);
    const aOut = result.find(x => x.name === 'No Slug A')!;
    assertEqual(aOut.isNeighborhoodChampion, true, 'No Slug A is champion in fallback group');
  });

  it('buffets with missing citySlug and missing address fields go to "unknown" group', () => {
    const orphan = makeBuffet({ name: 'Orphan', rating: 4.0, reviewsCount: 100, neighborhood: 'Ghost Hood', citySlug: undefined as unknown as string, address: { street: '', city: '', state: '', stateAbbr: '', postalCode: '', full: '' } });
    const result = computeAllNeighborhoodChampions([orphan]);
    assertEqual(result.length, 1, 'orphan still in output');
    assertEqual(result[0].isOnlyInNeighborhood, true, 'orphan is sole occupant');
  });

  it('merges fields onto buffets without mutating original objects', () => {
    const original = makeBuffet({ name: 'Merge Test', rating: 4.5, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' });
    const result = computeAllNeighborhoodChampions([original]);
    assert(result[0] !== original, 'result is a new object (spread, not mutation)');
    assertEqual(result[0].neighborhoodRank, 1, 'neighborhoodRank is 1 (sole buffet in neighborhood is rank 1)');
  });
});

// =============================================================================
// SUMMARY
// =============================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passCount} passed, ${failCount} failed`);
if (failCount > 0) {
  console.log('FAIL');
  process.exit(1);
} else {
  console.log('PASS');
}
