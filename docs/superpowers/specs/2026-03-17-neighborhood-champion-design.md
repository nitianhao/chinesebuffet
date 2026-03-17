# Neighborhood Champion Ranking — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Add data-layer logic to rank every buffet within its neighborhood and identify a "neighborhood champion" — the highest-rated buffet in a neighborhood that has at least one competitor. Eight new fields are added to the `Buffet` type, computed by a new module `lib/neighborhoodChampion.ts`.

No UI changes. No new dependencies. No database schema changes.

---

## Data Model Changes

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

/** Badge text for the champion. E.g. "#1 of 9 in Montrose 🏆". Null when not champion. */
neighborhoodBadgeText?: string | null;

/**
 * Medal emoji: "🏆" for rank 1 (count≥2), "🥈" for rank 2 (count≥3), "🥉" for rank 3 (count≥4).
 * Null for all other cases.
 */
neighborhoodBadgeEmoji?: string | null;

/**
 * Human-readable rank string.
 * "#1 of 9 in Montrose" or "Only buffet in Wicker Park".
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

```ts
interface NeighborhoodChampionResult {
  isNeighborhoodChampion: boolean;
  neighborhoodRank: number | null;
  neighborhoodBuffetCount: number | null;
  ratingGap: number | null;
  neighborhoodBadgeText: string | null;
  neighborhoodBadgeEmoji: string | null;
  neighborhoodRankText: string | null;
  isOnlyInNeighborhood: boolean;
}
```

#### `rankBuffetsInGroup(buffets: Buffet[]): Array<{ buffet: Buffet; rank: number }>`

Pure sort-and-rank function. Sorts by `rating` desc → `reviewsCount` desc → `name` asc. Assigns sequential 1-based ranks. No dense ranking — each buffet gets a unique rank based on stable sort position.

#### `computeNeighborhoodChampion(buffet: Buffet, cityBuffets: Buffet[]): NeighborhoodChampionResult`

Accepts one buffet and all buffets in its city. Filters `cityBuffets` to those sharing the same `neighborhood` value. Calls `rankBuffetsInGroup`. Derives all 8 output fields.

**Edge cases handled:**
- `neighborhood` is null/empty → returns all-null/false result
- Only one buffet in neighborhood → `isOnlyInNeighborhood: true`, no champion, no badge
- Tied rating between #1 and #2 → `ratingGap: 0.0`
- Empty `cityBuffets` → treated as single-buffet neighborhood

#### `computeAllNeighborhoodChampions(allBuffets: Buffet[]): Buffet[]`

Groups buffets by city using `citySlug` (falls back to `address.city + "," + address.stateAbbr`). For each city group, calls `computeNeighborhoodChampion` for every buffet in that group. Merges the result fields back onto each buffet via object spread. Returns the full updated array.

---

## Ranking Logic

### Tiebreaker chain

```
1. rating DESC          (primary)
2. reviewsCount DESC    (secondary)
3. name ASC             (tertiary — deterministic final tiebreaker)
```

Ranks are sequential (1, 2, 3…). In the astronomically unlikely case of identical rating + reviewsCount + name, stable sort order determines rank.

### Badge assignment

| Condition | `isNeighborhoodChampion` | `neighborhoodBadgeEmoji` | `neighborhoodBadgeText` |
|---|---|---|---|
| No neighborhood | false | null | null |
| Only buffet (count=1) | false | null | null |
| Rank 1, count ≥ 2 | **true** | 🏆 | "#1 of N in {neighborhood} 🏆" |
| Rank 2, count ≥ 3 | false | 🥈 | null |
| Rank 3, count ≥ 4 | false | 🥉 | null |
| Any other rank | false | null | null |

### `rankText` (always set when neighborhood exists)

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
- Houston Montrose #1: `isNeighborhoodChampion: true`, `ratingGap: 0.1`, `badgeText: "#1 of 9 in Montrose 🏆"`
- Houston Sharpstown #1 (15 buffets): champion confirmed
- Chicago Armour Square #1 (tie on rating, wins by reviewsCount): `ratingGap: 0.0`

**`computeNeighborhoodChampion` — non-champion**
- Montrose #2 (Cooking Girl): `badgeEmoji: "🥈"`, `rankText: "#2 of 9 in Montrose"`
- Armour Square #2 (Golden Bull): `badgeEmoji: "🥈"`
- Rank 3, count ≥ 4: `badgeEmoji: "🥉"`
- Rank 4+: `badgeEmoji: null`

**`computeNeighborhoodChampion` — sole occupant**
- Chicago Wicker Park (1 buffet): `isOnlyInNeighborhood: true`, `isNeighborhoodChampion: false`, all badges null, `rankText: "Only buffet in Wicker Park"`

**`computeNeighborhoodChampion` — no neighborhood**
- `neighborhood: null` → all fields null/false

**`computeAllNeighborhoodChampions`**
- Two cities, multiple neighborhoods: champions computed independently per city
- Buffets without `citySlug` fall back to city+state grouping
- Output array length === input array length

---

## Validation Against Spec Examples

| Buffet | Expected `isNeighborhoodChampion` | Expected `rankText` | Expected `badgeText` |
|---|---|---|---|
| Triple Pepper River Oaks (Montrose, 9) | true | "#1 of 9 in Montrose" | "#1 of 9 in Montrose 🏆" |
| Cooking Girl (Montrose, 9) | false | "#2 of 9 in Montrose" | null |
| Stone Age Street Food (Sharpstown, 15) | true | "#1 of 15 in Sharpstown" | "#1 of 15 in Sharpstown 🏆" |
| Qing Xiang Yuan Dumplings (Armour Square, 20) | true | "#1 of 20 in Armour Square" | "#1 of 20 in Armour Square 🏆" |
| Golden Bull (Armour Square, 20) | false | "#2 of 20 in Armour Square" | null |
| Chengdu Bistro West Town (Wicker Park, 1) | false | "Only buffet in Wicker Park" | null |
| Any buffet with no neighborhood | false | null | null |

---

## Files Changed

| File | Change |
|---|---|
| `lib/data.ts` | Add 8 new optional fields to `Buffet` interface |
| `lib/neighborhoodChampion.ts` | New — computation module |
| `lib/neighborhoodChampion.test.ts` | New — test file |

No other files are modified.
