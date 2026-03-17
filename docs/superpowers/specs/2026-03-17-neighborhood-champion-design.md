# Neighborhood Champion Ranking — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Add data-layer logic to rank every buffet within its neighborhood and identify a "neighborhood champion" — the highest-rated buffet in a neighborhood that has at least one competitor. Eight new fields are added to the `Buffet` type, computed by a new module `lib/neighborhoodChampion.ts`.

No UI changes. No new dependencies. No database schema changes.

---

## Data Model Changes

**Pre-existing field relied upon:** `neighborhood: string | null` already exists on `Buffet` (defined in `lib/data.ts`). It is the raw neighborhood name as returned by the data source (e.g. `"Montrose"`, `"Wicker Park"`). All computation in this module reads from this existing field — it is not modified.

Eight new optional fields added to the `Buffet` interface in `lib/data.ts`, following the flat pattern of existing computed scores (`hiddenGemScore`, `dateNightScore`, etc.):

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

---

## Module: `lib/neighborhoodChampion.ts`

### Exports

#### `NeighborhoodChampionResult`

The result type uses strict (non-nullable) booleans for `isNeighborhoodChampion` and `isOnlyInNeighborhood` because the function always computes a definite value — never "unknown". The corresponding `Buffet` fields use `boolean | null` only because a buffet record may not have been through computation yet (the field is unset). Spreading a `NeighborhoodChampionResult` onto a `Buffet` is always safe since `boolean` satisfies `boolean | null`.

```ts
interface NeighborhoodChampionResult {
  isNeighborhoodChampion: boolean;   // always true or false, never null
  neighborhoodRank: number | null;
  neighborhoodBuffetCount: number | null;
  ratingGap: number | null;
  neighborhoodBadgeText: string | null;
  neighborhoodBadgeEmoji: string | null;
  neighborhoodRankText: string | null;
  isOnlyInNeighborhood: boolean;     // always true or false, never null
}
```

#### `rankBuffetsInGroup(buffets: Buffet[]): Array<{ buffet: Buffet; rank: number }>`

Pure sort-and-rank function. Sorts by `rating` desc → `reviewsCount` desc → `name` asc. Assigns sequential 1-based ranks. No dense ranking — each buffet gets a unique rank based on stable sort position. Returns the original `buffet` object references unchanged (identity is preserved, not cloned).

#### `computeNeighborhoodChampion(buffet: Buffet, cityBuffets: Buffet[]): NeighborhoodChampionResult`

Accepts one buffet and all buffets in its city (including the subject buffet itself). Filters `cityBuffets` to those sharing the same `neighborhood` value as the subject buffet — this filtered group will always contain at least the subject buffet. Calls `rankBuffetsInGroup` on that group. Derives all 8 output fields.

**Subject buffet lookup:** After `rankBuffetsInGroup` returns the sorted array, the subject buffet is located by matching on `buffet.id` (the `id: string` field on `Buffet`). The rank of the entry whose `buffet.id === subject.id` is the subject buffet's rank. If no match is found (subject buffet was not in `cityBuffets`), the function returns the all-null/false result as if no neighborhood were present.

**`cityBuffets` inclusion:** `cityBuffets` MUST include the subject `buffet`. If the subject buffet is missing from `cityBuffets`, it will be absent from the ranking group and receive incorrect results. Passing an empty array is treated as a programming error; the function will return the sole-occupant result (count=1, `isOnlyInNeighborhood: true`) because after filtering by neighborhood the group contains only the subject buffet itself — but callers should never pass an empty array in practice.

**Edge cases handled:**
- `neighborhood` is null/empty → returns all-null/false result (`isNeighborhoodChampion: false`, all numeric/string fields null, `isOnlyInNeighborhood: false`)
- Only one buffet in neighborhood → `isOnlyInNeighborhood: true`, `isNeighborhoodChampion: false`, `ratingGap: null` (no #2 to compare against), all badge fields null
- Tied rating between #1 and #2 → `ratingGap: 0.0` (not null — signals a meaningful tie)
- Empty `cityBuffets` → programming error (subject buffet should always be present); function defensively returns sole-occupant result
- Rank 2 with count=2 → `neighborhoodBadgeEmoji: null` (🥈 requires count ≥ 3)

#### `computeAllNeighborhoodChampions(allBuffets: Buffet[]): Buffet[]`

Groups buffets by city using `citySlug` (the top-level `citySlug?: string` field on `Buffet`). "Absent" means `citySlug` is `undefined`, `null`, or `""` — all three are treated identically as missing. Falls back to `address.city + "," + address.stateAbbr` for buffets where `citySlug` is absent — `address` is a nested object on `Buffet` with `city: string` and `stateAbbr: string` sub-fields (see `Buffet.address` in `lib/data.ts`).

**Fallback nullability:** If `citySlug` is absent AND `address.city` or `address.stateAbbr` is also missing/empty, the buffet is placed in a catch-all group keyed `"unknown"`. Buffets in the `"unknown"` group are still ranked against each other (they may share a neighborhood), but cross-city contamination is accepted as a graceful degradation for malformed data.

For each city group, calls `computeNeighborhoodChampion` for every buffet in that group, passing the full city group array as `cityBuffets`. Merges the result fields back onto each buffet via object spread. Returns the full updated array.

---

## Ranking Logic

### Tiebreaker chain

```
1. rating DESC          (primary)
2. reviewsCount DESC    (secondary)
3. name ASC             (tertiary — deterministic final tiebreaker)
```

Ranks are sequential (1, 2, 3…). In the astronomically unlikely case of identical rating + reviewsCount + name, two buffets may receive consecutive ranks in any order — the output is implementation-defined for this degenerate case and the spec makes no guarantee about which one precedes the other. This is an acceptable trade-off given the practical impossibility of the scenario.

### Badge assignment

| Condition | `isNeighborhoodChampion` | `neighborhoodBadgeEmoji` | `neighborhoodBadgeText` |
|---|---|---|---|
| No neighborhood | false | null | null |
| Only buffet (count=1) | false | null | null |
| Rank 1, count ≥ 2 | **true** | 🏆 | "#1 of N in {neighborhood} 🏆" |
| Rank 2, count ≥ 3 | false | 🥈 | null |
| Rank 2, count = 2 | false | null | null |
| Rank 3, count ≥ 4 | false | 🥉 | null |
| Any other rank (rank 3 with count ≤ 3, rank 4+) | false | null | null |

### `neighborhoodRankText` (always set when neighborhood exists)

- Sole occupant: `"Only buffet in {neighborhood}"`
- Otherwise: `"#{rank} of {count} in {neighborhood}"`

---

## Test File: `lib/neighborhoodChampion.test.ts`

Run with: `npx tsx lib/neighborhoodChampion.test.ts`

Uses same `assert` / `assertEqual` / `describe` / `it` helpers as `lib/facets/__tests__/aggregateFacets.test.ts`.

### Test cases

**`rankBuffetsInGroup`**
- Single buffet → rank 1
- Multiple buffets, sorted correctly by rating
- Tie on rating → secondary sort by reviewsCount
- Tie on rating + reviewsCount → tertiary sort by name
- Empty array → empty result

**`computeNeighborhoodChampion` — champion**
- Houston Montrose #1: `isNeighborhoodChampion: true`, `ratingGap: 0.1`, `neighborhoodBadgeText: "#1 of 9 in Montrose 🏆"`
- Houston Sharpstown #1 (15 buffets): champion confirmed
- Chicago Armour Square #1 (tie on rating, wins by reviewsCount): `ratingGap: 0.0`

**`computeNeighborhoodChampion` — non-champion**
- Montrose #2 (Cooking Girl): `neighborhoodBadgeEmoji: "🥈"`, `neighborhoodRankText: "#2 of 9 in Montrose"`
- Armour Square #2 (Golden Bull): `neighborhoodBadgeEmoji: "🥈"`
- Rank 3, count ≥ 4: `neighborhoodBadgeEmoji: "🥉"`
- Rank 4+: `neighborhoodBadgeEmoji: null`
- **Rank 2, count = 2**: `neighborhoodBadgeEmoji: null`, `neighborhoodRankText: "#2 of 2 in {neighborhood}"` (🥈 requires count ≥ 3; only two buffets means no silver medal)

**`computeNeighborhoodChampion` — sole occupant**
- Chicago Wicker Park (1 buffet): `isOnlyInNeighborhood: true`, `isNeighborhoodChampion: false`, `ratingGap: null`, all badge fields null, `neighborhoodRankText: "Only buffet in Wicker Park"`

**`computeNeighborhoodChampion` — no neighborhood**
- `neighborhood: null` → all fields null/false

**`computeAllNeighborhoodChampions`**
- Two cities, multiple neighborhoods: champions computed independently per city
- Buffets without `citySlug` fall back to city+state grouping
- Buffets with missing `citySlug`, `address.city`, and `address.stateAbbr` → placed in `"unknown"` group, still ranked against each other
- Output array length === input array length

---

## Validation Against Spec Examples

| Buffet | `isNeighborhoodChampion` | `isOnlyInNeighborhood` | `neighborhoodRankText` | `neighborhoodBadgeText` | `ratingGap` | `neighborhoodBadgeEmoji` |
|---|---|---|---|---|---|---|
| Triple Pepper River Oaks (Montrose, 9) | true | false | "#1 of 9 in Montrose" | "#1 of 9 in Montrose 🏆" | 0.1 | 🏆 |
| Cooking Girl (Montrose, 9) | false | false | "#2 of 9 in Montrose" | null | null | 🥈 |
| Stone Age Street Food (Sharpstown, 15) | true | false | "#1 of 15 in Sharpstown" | "#1 of 15 in Sharpstown 🏆" | (per data) | 🏆 |
| Qing Xiang Yuan Dumplings (Armour Square, 20) — tied rating | true | false | "#1 of 20 in Armour Square" | "#1 of 20 in Armour Square 🏆" | **0.0** | 🏆 |
| Golden Bull (Armour Square, 20) | false | false | "#2 of 20 in Armour Square" | null | null | 🥈 |
| Hypothetical rank-2 buffet with count=2 | false | false | "#2 of 2 in {neighborhood}" | null | null | **null** |
| Chengdu Bistro West Town (Wicker Park, 1) — sole occupant | false | **true** | "Only buffet in Wicker Park" | null | **null** | null |
| Any buffet with no neighborhood | false | false | null | null | null | null |

---

## Files Changed

| File | Change |
|---|---|
| `lib/data.ts` | Add 8 new optional fields to `Buffet` interface |
| `lib/neighborhoodChampion.ts` | New — computation module |
| `lib/neighborhoodChampion.test.ts` | New — test file |

No other files are modified.
