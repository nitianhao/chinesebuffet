# Neighborhood Champion Ranking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data-layer logic that ranks every buffet within its neighborhood, identifies the top-rated one as "neighborhood champion," and stores 8 new computed fields on the `Buffet` type.

**Architecture:** New pure-TypeScript module `lib/neighborhoodChampion.ts` with three exports (`rankBuffetsInGroup`, `computeNeighborhoodChampion`, `computeAllNeighborhoodChampions`). The `Buffet` interface in `lib/data.ts` gets 8 new optional fields. A co-located test file `lib/neighborhoodChampion.test.ts` uses the same custom assert/describe/it helpers as the existing facet tests and is run with `npx tsx`.

**Tech Stack:** TypeScript, Node.js (tsx runner), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-17-neighborhood-champion-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/data.ts` | Modify (add 8 fields near line 424) | Buffet type definition |
| `lib/neighborhoodChampion.ts` | Create | All ranking/champion computation logic |
| `lib/neighborhoodChampion.test.ts` | Create | Full test suite for all exported functions |

---

## Task 1: Add 8 new fields to the `Buffet` interface

**Files:**
- Modify: `lib/data.ts` (insert after line 424, before the closing `}` of the `Buffet` interface)

- [ ] **Step 1: Open `lib/data.ts` and locate the end of the `Buffet` interface**

The last fields before the closing `}` are `dateNightPositiveSignals` and `dateNightNegativeSignals` around line 422–424. You will insert the 8 new fields after `dateNightNegativeSignals`.

- [ ] **Step 2: Add the 8 new fields**

Insert this block immediately before the closing `}` of the `Buffet` interface (after `dateNightNegativeSignals`):

```ts
  /** Whether this buffet ranks #1 in its neighborhood AND has at least one competitor. */
  isNeighborhoodChampion?: boolean | null;
  /** 1-based rank within the neighborhood, sorted by rating desc → reviewsCount desc → name asc. Null when no neighborhood. */
  neighborhoodRank?: number | null;
  /** Total number of buffets sharing this neighborhood in the same city. Null when no neighborhood. */
  neighborhoodBuffetCount?: number | null;
  /**
   * Rating gap between this buffet (#1) and the #2 buffet, rounded to 1 decimal.
   * Set to 0.0 when champion and #2 are tied on rating.
   * Null when not champion or no neighborhood.
   */
  ratingGap?: number | null;
  /**
   * Badge text for the champion only. E.g. "#1 of 9 in Montrose 🏆".
   * The 🏆 emoji is embedded in this string as part of the display label.
   * Null for all non-champion ranks.
   */
  neighborhoodBadgeText?: string | null;
  /**
   * Standalone medal emoji for use in compact/icon contexts (e.g. table cells, map pins).
   * "🏆" for rank 1 (count≥2), "🥈" for rank 2 (count≥3), "🥉" for rank 3 (count≥4).
   * Null for rank 2 with count=2, rank 4+, sole occupant, or no neighborhood.
   * Note: for rank 1 this duplicates the emoji embedded in neighborhoodBadgeText — both
   * fields serve different rendering purposes (full label vs. standalone icon).
   */
  neighborhoodBadgeEmoji?: string | null;
  /**
   * Human-readable rank string. Always set when `neighborhood` is non-null.
   * - Sole occupant: "Only buffet in {neighborhood}"
   * - Otherwise: "#{rank} of {count} in {neighborhood}"
   * Null when no neighborhood.
   */
  neighborhoodRankText?: string | null;
  /** True when this buffet is the sole occupant of its neighborhood in the city. */
  isOnlyInNeighborhood?: boolean | null;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (these are optional fields — adding them is non-breaking).

- [ ] **Step 4: Commit**

```bash
git add lib/data.ts
git commit -m "feat: add 8 neighborhood champion fields to Buffet interface"
```

---

## Task 2: Create `lib/neighborhoodChampion.ts` — skeleton and types

**Files:**
- Create: `lib/neighborhoodChampion.ts`

This task creates the file with types and stubs. Tests come in Task 3. Implementation comes in Task 4.

- [ ] **Step 1: Create the file with types and function stubs**

```ts
/**
 * Neighborhood Champion Ranking
 *
 * Ranks every buffet within its neighborhood (within the same city) and
 * identifies the top-rated one as the "neighborhood champion."
 *
 * Ranking tiebreaker order:
 *   1. rating DESC          (primary)
 *   2. reviewsCount DESC    (secondary)
 *   3. name ASC             (tertiary — deterministic final tiebreaker)
 *
 * Champion eligibility:
 *   - Must be rank 1 in its neighborhood
 *   - Neighborhood must have ≥ 2 buffets (sole occupants do NOT get champion status)
 *
 * Badge emoji thresholds:
 *   - 🏆  rank 1,  count ≥ 2
 *   - 🥈  rank 2,  count ≥ 3
 *   - 🥉  rank 3,  count ≥ 4
 *   - null for all other cases
 */

import type { Buffet } from './data';

// =============================================================================
// TYPES
// =============================================================================

/**
 * The computed neighborhood ranking result for a single buffet.
 * Both boolean fields are strict (non-nullable) because the function always
 * returns a definite value. The corresponding Buffet fields use boolean | null
 * only because a record may be uncomputed; spreading this result onto a Buffet
 * is always safe.
 */
export interface NeighborhoodChampionResult {
  /** true only when rank === 1 AND neighborhoodBuffetCount >= 2 */
  isNeighborhoodChampion: boolean;
  /** 1-based rank within the neighborhood. null when no neighborhood. */
  neighborhoodRank: number | null;
  /** Total buffets sharing this neighborhood in the city. null when no neighborhood. */
  neighborhoodBuffetCount: number | null;
  /**
   * Rating gap between #1 and #2, rounded to 1 decimal. 0.0 when tied on rating.
   * null when not champion or no neighborhood.
   */
  ratingGap: number | null;
  /** "#1 of N in {neighborhood} 🏆". null when not champion. */
  neighborhoodBadgeText: string | null;
  /**
   * Standalone medal emoji. null when rank does not meet count threshold.
   * 🏆 (rank 1, count≥2) | 🥈 (rank 2, count≥3) | 🥉 (rank 3, count≥4)
   */
  neighborhoodBadgeEmoji: string | null;
  /**
   * Human-readable rank string. Always non-null when a neighborhood exists.
   * "Only buffet in {hood}" | "#{rank} of {count} in {hood}"
   */
  neighborhoodRankText: string | null;
  /** true when this is the only buffet in its neighborhood in the city. */
  isOnlyInNeighborhood: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Sorts buffets within a neighborhood group and assigns sequential 1-based ranks.
 *
 * Sort order: rating DESC → reviewsCount DESC → name ASC
 *
 * Object references in the returned array point to the same Buffet instances
 * passed in — they are not cloned. Rank assignment is sequential; in the
 * degenerate case of identical rating + reviewsCount + name the order is
 * implementation-defined.
 *
 * @param buffets - All buffets belonging to a single neighborhood group.
 * @returns Array of { buffet, rank } pairs sorted by rank ascending.
 */
export function rankBuffetsInGroup(
  buffets: Buffet[]
): Array<{ buffet: Buffet; rank: number }> {
  throw new Error('not implemented');
}

/**
 * Computes neighborhood champion fields for a single buffet.
 *
 * @param buffet - The buffet to evaluate. MUST also be present in cityBuffets.
 * @param cityBuffets - ALL buffets in the same city, including the subject buffet.
 *   The function filters this array to the subject's neighborhood internally.
 *   If the subject buffet is absent from this array it is treated as a missing-
 *   subject error and the all-null/false result is returned.
 * @returns A NeighborhoodChampionResult with all 8 computed fields.
 */
export function computeNeighborhoodChampion(
  buffet: Buffet,
  cityBuffets: Buffet[]
): NeighborhoodChampionResult {
  throw new Error('not implemented');
}

/**
 * Runs computeNeighborhoodChampion for every buffet in the input array,
 * grouping by city first so each buffet is ranked only against city peers.
 *
 * City grouping key: buffet.citySlug if present (non-null, non-empty).
 * Fallback: `${buffet.address.city},${buffet.address.stateAbbr}`.
 * If both are absent/empty, the buffet is placed in the "unknown" group.
 *
 * @param allBuffets - Every buffet across all cities.
 * @returns A new array of the same length with champion fields merged onto
 *   each buffet via object spread.
 */
export function computeAllNeighborhoodChampions(allBuffets: Buffet[]): Buffet[] {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (stubs throw at runtime but types are valid).

- [ ] **Step 3: Commit**

```bash
git add lib/neighborhoodChampion.ts
git commit -m "feat: add neighborhoodChampion module skeleton with types and stubs"
```

---

## Task 3: Write the test file (all tests failing)

**Files:**
- Create: `lib/neighborhoodChampion.test.ts`

Write ALL tests before implementing anything. Each test should fail with "not implemented" until Task 4.

- [ ] **Step 1: Create the test file**

```ts
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
const [triplePepper, cookingGirl, ...montroseRest] = montroseBuffets;

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
const [alphaTinyHood, betaTinyHood] = twoBuffetNeighborhood;

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
    // Houston / Montrose: Triple Pepper is champion
    // Chicago / Wicker Park: Chengdu Bistro is sole occupant (not champion)
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
    // orphan is sole occupant in its group
    assertEqual(result[0].isOnlyInNeighborhood, true, 'orphan is sole occupant');
  });

  it('merges fields onto buffets without mutating original objects', () => {
    const original = makeBuffet({ name: 'Merge Test', rating: 4.5, reviewsCount: 100, neighborhood: 'Test Hood', citySlug: 'test-tx' });
    const result = computeAllNeighborhoodChampions([original]);
    assert(result[0] !== original, 'result is a new object (spread, not mutation)');
    assert(result[0].neighborhoodRank !== undefined, 'neighborhoodRank is set');
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
```

- [ ] **Step 2: Run the tests — confirm all fail with "not implemented"**

```bash
npx tsx lib/neighborhoodChampion.test.ts
```

Expected: all tests fail with `Error: not implemented`. If any test throws a different error, fix the test setup (mock data, imports) before proceeding.

- [ ] **Step 3: Commit the failing tests**

```bash
git add lib/neighborhoodChampion.test.ts
git commit -m "test: add neighborhood champion test suite (all failing)"
```

---

## Task 4: Implement `rankBuffetsInGroup`

**Files:**
- Modify: `lib/neighborhoodChampion.ts`

- [ ] **Step 1: Replace the `rankBuffetsInGroup` stub with the real implementation**

```ts
export function rankBuffetsInGroup(
  buffets: Buffet[]
): Array<{ buffet: Buffet; rank: number }> {
  const sorted = [...buffets].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((buffet, index) => ({ buffet, rank: index + 1 }));
}
```

- [ ] **Step 2: Run only the `rankBuffetsInGroup` tests**

```bash
npx tsx lib/neighborhoodChampion.test.ts 2>&1 | head -60
```

Expected: all `rankBuffetsInGroup` describe block tests pass. The `computeNeighborhoodChampion` and `computeAllNeighborhoodChampions` tests still fail with "not implemented".

- [ ] **Step 3: Commit**

```bash
git add lib/neighborhoodChampion.ts
git commit -m "feat: implement rankBuffetsInGroup"
```

---

## Task 5: Implement `computeNeighborhoodChampion`

**Files:**
- Modify: `lib/neighborhoodChampion.ts`

- [ ] **Step 1: Add a private helper for the null-neighborhood result**

Add this just above `computeNeighborhoodChampion`:

```ts
function nullResult(): NeighborhoodChampionResult {
  return {
    isNeighborhoodChampion: false,
    neighborhoodRank: null,
    neighborhoodBuffetCount: null,
    ratingGap: null,
    neighborhoodBadgeText: null,
    neighborhoodBadgeEmoji: null,
    neighborhoodRankText: null,
    isOnlyInNeighborhood: false,
  };
}
```

- [ ] **Step 2: Replace the `computeNeighborhoodChampion` stub with the real implementation**

```ts
export function computeNeighborhoodChampion(
  buffet: Buffet,
  cityBuffets: Buffet[]
): NeighborhoodChampionResult {
  // No neighborhood → all-null/false
  if (!buffet.neighborhood) return nullResult();

  // Filter to same neighborhood; defensively ensure the subject is included
  const filtered = cityBuffets.filter(b => b.neighborhood === buffet.neighborhood);
  const group = filtered.some(b => b.id === buffet.id) ? filtered : [buffet, ...filtered];

  // Rank the group
  const ranked = rankBuffetsInGroup(group);

  // Find the subject buffet's entry by id (always present after the guard above)
  const subjectEntry = ranked.find(r => r.buffet.id === buffet.id);
  if (!subjectEntry) return nullResult(); // should never happen after guard

  const rank = subjectEntry.rank;
  const count = ranked.length;
  const neighborhood = buffet.neighborhood;

  // neighborhoodRankText — always set when neighborhood exists
  const isOnlyInNeighborhood = count === 1;
  const neighborhoodRankText = isOnlyInNeighborhood
    ? `Only buffet in ${neighborhood}`
    : `#${rank} of ${count} in ${neighborhood}`;

  // Champion requires rank 1 AND count >= 2
  const isNeighborhoodChampion = rank === 1 && count >= 2;

  // ratingGap — champion only
  let ratingGap: number | null = null;
  if (isNeighborhoodChampion) {
    const secondEntry = ranked.find(r => r.rank === 2);
    if (secondEntry) {
      ratingGap = Math.round((buffet.rating - secondEntry.buffet.rating) * 10) / 10;
    }
  }

  // neighborhoodBadgeEmoji
  let neighborhoodBadgeEmoji: string | null = null;
  if (rank === 1 && count >= 2) neighborhoodBadgeEmoji = '🏆';
  else if (rank === 2 && count >= 3) neighborhoodBadgeEmoji = '🥈';
  else if (rank === 3 && count >= 4) neighborhoodBadgeEmoji = '🥉';

  // neighborhoodBadgeText — champion only
  const neighborhoodBadgeText = isNeighborhoodChampion
    ? `#1 of ${count} in ${neighborhood} 🏆`
    : null;

  return {
    isNeighborhoodChampion,
    neighborhoodRank: rank,
    neighborhoodBuffetCount: count,
    ratingGap,
    neighborhoodBadgeText,
    neighborhoodBadgeEmoji,
    neighborhoodRankText,
    isOnlyInNeighborhood,
  };
}
```

- [ ] **Step 3: Run all tests**

```bash
npx tsx lib/neighborhoodChampion.test.ts
```

Expected: all `rankBuffetsInGroup` and `computeNeighborhoodChampion` tests pass. `computeAllNeighborhoodChampions` tests still fail with "not implemented".

- [ ] **Step 4: Commit**

```bash
git add lib/neighborhoodChampion.ts
git commit -m "feat: implement computeNeighborhoodChampion"
```

---

## Task 6: Implement `computeAllNeighborhoodChampions`

**Files:**
- Modify: `lib/neighborhoodChampion.ts`

- [ ] **Step 1: Add a private helper to derive the city grouping key**

Add just above `computeAllNeighborhoodChampions`:

```ts
function getCityKey(buffet: Buffet): string {
  if (buffet.citySlug && buffet.citySlug.trim() !== '') return buffet.citySlug;
  const city = buffet.address?.city?.trim() ?? '';
  const state = buffet.address?.stateAbbr?.trim() ?? '';
  if (city || state) return `${city},${state}`;
  return 'unknown';
}
```

- [ ] **Step 2: Replace the `computeAllNeighborhoodChampions` stub**

```ts
export function computeAllNeighborhoodChampions(allBuffets: Buffet[]): Buffet[] {
  // Group buffets by city
  const cityGroups = new Map<string, Buffet[]>();
  for (const buffet of allBuffets) {
    const key = getCityKey(buffet);
    const group = cityGroups.get(key) ?? [];
    group.push(buffet);
    cityGroups.set(key, group);
  }

  // Compute champion fields for every buffet and merge via spread
  const results: Buffet[] = [];
  for (const buffet of allBuffets) {
    const key = getCityKey(buffet);
    const cityGroup = cityGroups.get(key)!;
    const championResult = computeNeighborhoodChampion(buffet, cityGroup);
    results.push({ ...buffet, ...championResult });
  }

  return results;
}
```

- [ ] **Step 3: Run all tests**

```bash
npx tsx lib/neighborhoodChampion.test.ts
```

Expected: **all tests pass**, `Results: N passed, 0 failed`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add lib/neighborhoodChampion.ts
git commit -m "feat: implement computeAllNeighborhoodChampions"
```

---

## Task 7: TypeScript type-check and final verification

- [ ] **Step 1: Run the TypeScript compiler across the whole project**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run the full test suite one final time**

```bash
npx tsx lib/neighborhoodChampion.test.ts
```

Expected: all tests pass, exit code 0.

- [ ] **Step 3: Commit if any final cleanup was needed, otherwise confirm done**

```bash
git add -p
git commit -m "chore: final type-check cleanup for neighborhood champion"
```

(Skip this step if nothing changed.)

---

## Summary

| Task | Files touched | Commit message |
|---|---|---|
| 1 | `lib/data.ts` | `feat: add 8 neighborhood champion fields to Buffet interface` |
| 2 | `lib/neighborhoodChampion.ts` | `feat: add neighborhoodChampion module skeleton with types and stubs` |
| 3 | `lib/neighborhoodChampion.test.ts` | `test: add neighborhood champion test suite (all failing)` |
| 4 | `lib/neighborhoodChampion.ts` | `feat: implement rankBuffetsInGroup` |
| 5 | `lib/neighborhoodChampion.ts` | `feat: implement computeNeighborhoodChampion` |
| 6 | `lib/neighborhoodChampion.ts` | `feat: implement computeAllNeighborhoodChampions` |
| 7 | — | `chore: final type-check cleanup` (if needed) |
