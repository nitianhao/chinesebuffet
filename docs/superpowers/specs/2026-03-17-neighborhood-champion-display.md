# Neighborhood Champion Display — Design Spec

**Date:** 2026-03-17
**Status:** Approved

---

## Overview

Surface the neighborhood champion ranking data (computed by `lib/neighborhoodChampion.ts`) on three UI surfaces:

1. **Buffet detail page hero** — badge alongside the existing hidden gem badge
2. **City listing cards** (`BuffetCardSlim`) — 🏆 emoji for rank-1 buffets only
3. **City page neighborhoods section** — champion buffet name appended to each neighborhood link

No new pages. No new dependencies. Data-layer fields already exist on `Buffet`; the work is purely display.

---

## Surface 1: Buffet Detail Page Hero

**File:** `components/BuffetHeroHeader.tsx`

### Change

Add a new optional prop `neighborhoodBadgeText?: string | null` to `BuffetHeroHeaderProps`. Render it as a badge in the same badge row as `hiddenGemTier` (the existing violet pill).

### Rendering

The badge row (currently `{/* 3. Hidden gem badge */}`) expands to show both badges side by side when both are present, or one when only one is present.

```tsx
{(hiddenGemTier || neighborhoodBadgeText) && (
  <div className="mb-3 -mt-1 flex flex-wrap gap-2">
    {hiddenGemTier && (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 ring-1 ring-violet-200 px-3 py-1 text-xs font-medium text-violet-700">
        {hiddenGemTier}
      </span>
    )}
    {neighborhoodBadgeText && (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
        {neighborhoodBadgeText}
      </span>
    )}
  </div>
)}
```

Amber/yellow color differentiates the neighborhood badge from the violet hidden gem badge.

### Caller change

**File:** `app/chinese-buffets/[city-state]/[slug]/page.tsx`

The page already calls `computeHiddenGemScore`. Add a call to `computeNeighborhoodChampion` (importing from `lib/neighborhoodChampion.ts`) and pass `neighborhoodBadgeText` to `BuffetHeroHeader`.

**Mobile hero:** The detail page has two hero render paths — the desktop `BuffetHeroHeader` component and a separate mobile inline block (around the `{/* Hidden gem badge */}` comment in the mobile section). Both must be updated. The mobile inline block renders the hidden gem badge directly; add the neighborhood badge immediately after it using the same amber pill style as the desktop version.

```tsx
import { computeNeighborhoodChampion } from '@/lib/neighborhoodChampion';

// In the page component, after buffet is loaded and cityBuffets is available:
const { neighborhoodBadgeText } = computeNeighborhoodChampion(buffet, cityBuffets);

// Pass to hero:
<BuffetHeroHeader
  buffet={buffet}
  openStatus={openStatus}
  cuisineInfo={menuData}
  hiddenGemTier={hiddenGemTier}
  neighborhoodBadgeText={neighborhoodBadgeText}
/>
```

**`cityBuffets` source:** Use `cityInfo?.buffets ?? [buffet]` — the same array already used for `computeHiddenGemScore` on this page. Do not add a separate fetch.

---

## Surface 2: City Listing Cards (`BuffetCardSlim`)

**File:** `app/chinese-buffets/[city-state]/page.tsx` (inline component)

### Change

`CityBuffetRow` does not include neighborhood champion fields — those live on the full `Buffet` type from `lib/data.ts`. The neighborhood champion computation happens at the city page level.

**Approach:** Before rendering the card grid, compute champion status for all buffets in the city using `computeAllNeighborhoodChampions`. Store a `Set<string>` of champion buffet IDs (where `isNeighborhoodChampion === true`). Pass a boolean `isChampion` prop to `BuffetCardSlim`.

```tsx
// In the page component (server-side):
import { computeAllNeighborhoodChampions } from '@/lib/neighborhoodChampion';

// Convert CityBuffetRows to minimal Buffet objects for computation.
// CityBuffetRow.address is a flat string; Buffet.address is a nested object.
// We supply address as a nested object here so city-grouping fallback works correctly.
// rating and reviewsCount are coerced from null to 0 so the sort arithmetic in
// rankBuffetsInGroup never encounters NaN (null - null = NaN breaks the sort).
const buffetsForRanking = buffets.map(b => ({
  ...b,
  rating: b.rating ?? 0,
  reviewsCount: b.reviewsCount ?? 0,
  address: { city: cityName, stateAbbr },
  citySlug,
}));
const ranked = computeAllNeighborhoodChampions(buffetsForRanking as any);
const championIds = new Set(
  ranked.filter(b => b.isNeighborhoodChampion).map(b => b.id)
);
```

Pass `isChampion` to the card:

```tsx
<BuffetCardSlim
  buffet={buffet}
  citySlug={citySlug}
  isChampion={championIds.has(buffet.id)}
/>
```

**`BuffetCardSlim` change:** Add `isChampion?: boolean` prop. When true, append 🏆 to the neighborhood tag:

```tsx
{buffet.neighborhood && (
  <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">
    {isChampion ? `🏆 ${buffet.neighborhood}` : buffet.neighborhood}
  </span>
)}
```

Only rank-1 buffets (champions) show the emoji. No change for other ranks.

**Scope note:** `BuffetCardSlim` is used only for the server-rendered initial batch (first 12 cards). Remaining buffets beyond that limit are passed to `CityBuffetList` (a client component) as `SlimBuffet[]`. Champion badges are intentionally **not** propagated to `CityBuffetList` — this is an accepted limitation. The 🏆 emoji appears only on the initial server-rendered cards. A future enhancement could serialize `championIds` into a JSON prop on `CityBuffetList` if full coverage is needed.

---

## Surface 3: City Page Neighborhoods Section

**File:** `app/chinese-buffets/[city-state]/page.tsx`

### Change

The neighborhoods section iterates `neighborhoods` (a `NeighborhoodRollupRow[]`). Each item has `neighborhood` (name), `slug`, and `buffetCount`. To show the champion, we need to know which buffet is rank 1 for each neighborhood.

**Approach:** Build a `Map<string, string>` from neighborhood name → champion buffet name, derived from the same `ranked` array computed for Surface 2.

```tsx
const championByNeighborhood = new Map<string, string>();
for (const b of ranked) {
  if (b.isNeighborhoodChampion && b.neighborhood) {
    championByNeighborhood.set(b.neighborhood, b.name);
  }
}
```

In the neighborhoods grid, append the champion name when available:

```tsx
<h3 className="font-semibold text-sm text-[var(--text)] group-hover:text-[var(--accent1)]">
  {neighborhood.neighborhood}
</h3>
<p className="text-[var(--muted)] text-xs">
  {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
  {championByNeighborhood.has(neighborhood.neighborhood) && (
    <> · {championByNeighborhood.get(neighborhood.neighborhood)} 🏆</>
  )}
</p>
```

The champion name appears on the second line alongside the buffet count, separated by `·`.

**Neighborhood name matching:** Both `ranked[].neighborhood` (from `CityBuffetRow`, sourced from the rollup's `buffets` array) and `neighborhood.neighborhood` (from `NeighborhoodRollupRow`, sourced from the rollup's `neighborhoods` array) originate from the same `CityBuffetsRollup` object, so string values are expected to match exactly. If there is any concern about whitespace or casing inconsistency in the rollup, normalize both sides with `.trim()` when building/querying the map.

---

## Data Flow Summary

```
lib/neighborhoodChampion.ts
  └── computeAllNeighborhoodChampions(buffets)
        ↓
  City page (server component)
        ├── championIds Set → BuffetCardSlim (isChampion prop)
        └── championByNeighborhood Map → neighborhoods section

lib/neighborhoodChampion.ts
  └── computeNeighborhoodChampion(buffet, cityBuffets)
        ↓
  Buffet detail page (server component)
        └── neighborhoodBadgeText → BuffetHeroHeader prop
```

---

## Files Changed

| File | Change |
|---|---|
| `components/BuffetHeroHeader.tsx` | Add `neighborhoodBadgeText` prop; render amber badge alongside hidden gem badge |
| `app/chinese-buffets/[city-state]/[slug]/page.tsx` | Call `computeNeighborhoodChampion`; pass `neighborhoodBadgeText` to hero |
| `app/chinese-buffets/[city-state]/page.tsx` | Compute champion set/map; update `BuffetCardSlim` and neighborhoods section |

No new files. No new dependencies. No database changes.

---

## Edge Cases

- **No neighborhood champion in a neighborhood** — neighborhood link renders without the champion line; no change to existing layout.
- **`neighborhoodBadgeText` is null** — badge simply not rendered; hidden gem badge still works independently.
- **`isChampion` is false or undefined** — neighborhood tag renders exactly as today.
- **Null rating/reviewsCount in sort** — `rating` and `reviewsCount` are coerced to `0` before passing to `computeAllNeighborhoodChampions` so the sort arithmetic never produces NaN. Without this coercion, `null - null` in the comparator returns NaN which breaks the sort.
- **Buffet with no neighborhood** — `computeNeighborhoodChampion` returns `neighborhoodBadgeText: null`; no badge rendered.
