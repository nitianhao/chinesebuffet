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

**`cityBuffets` source:** The detail page already loads city data. Inspect how `hiddenGemScore` gets `cityBuffets` — use the same source (likely from the rollup or a separate data fetch). If `cityBuffets` is not currently available, fetch it via `getCityBuffetsRollup(citySlug)` and map `buffets` from the rollup.

---

## Surface 2: City Listing Cards (`BuffetCardSlim`)

**File:** `app/chinese-buffets/[city-state]/page.tsx` (inline component)

### Change

`CityBuffetRow` does not include neighborhood champion fields — those live on the full `Buffet` type from `lib/data.ts`. The neighborhood champion computation happens at the city page level.

**Approach:** Before rendering the card grid, compute champion status for all buffets in the city using `computeAllNeighborhoodChampions`. Store a `Set<string>` of champion buffet IDs (where `isNeighborhoodChampion === true`). Pass a boolean `isChampion` prop to `BuffetCardSlim`.

```tsx
// In the page component (server-side):
import { computeAllNeighborhoodChampions } from '@/lib/neighborhoodChampion';

// Convert CityBuffetRows to minimal Buffet objects for computation:
const buffetsForRanking = buffets.map(b => ({
  ...b,
  address: { city: cityName, stateAbbr: stateAbbr },
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
- **`computeAllNeighborhoodChampions` called with `CityBuffetRow` cast** — these rows have `id`, `name`, `neighborhood`, `rating`, `reviewsCount` which is all the champion computation needs. The `as any` cast is acceptable here since we only read those fields.
- **Buffet with no neighborhood** — `computeNeighborhoodChampion` returns `neighborhoodBadgeText: null`; no badge rendered.
