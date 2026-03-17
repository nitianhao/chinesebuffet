# Neighborhood Champion Display Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface neighborhood champion ranking badges on the buffet detail page hero, city listing cards, and city neighborhoods section.

**Architecture:** Three independent changes to three surfaces, all reading from already-computed `lib/neighborhoodChampion.ts` functions. The city page computes champions once from `CityBuffetRow[]` (mapped to the minimal shape `computeAllNeighborhoodChampions` needs) and derives two data structures: a `Set<string>` of champion IDs for cards, and a `Map<string, string>` of neighborhood → champion name for the neighborhoods section. The detail page calls `computeNeighborhoodChampion` with the already-available `cityInfo.buffets` array.

**Tech Stack:** Next.js App Router (server components), TypeScript, Tailwind CSS. No new dependencies.

---

## File Structure

| File | Change |
|---|---|
| `components/BuffetHeroHeader.tsx` | Add `neighborhoodBadgeText?: string \| null` prop; render amber badge |
| `app/chinese-buffets/[city-state]/[slug]/page.tsx` | Call `computeNeighborhoodChampion`; pass prop to desktop hero and mobile inline block |
| `app/chinese-buffets/[city-state]/page.tsx` | Compute champion set/map; update `BuffetCardSlim` and neighborhoods section |

---

### Task 1: Add `neighborhoodBadgeText` prop to `BuffetHeroHeader`

**Files:**
- Modify: `components/BuffetHeroHeader.tsx`

**Context:**
The component already renders a violet hidden gem badge when `hiddenGemTier` is set (around line 96–101). The badge row is a single `<div className="mb-3 -mt-1">`. We need to expand it to show both badges side by side, with the neighborhood badge in amber.

Current badge block (lines ~96–101):
```tsx
{hiddenGemTier && (
  <div className="mb-3 -mt-1">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 ring-1 ring-violet-200 px-3 py-1 text-xs font-medium text-violet-700">
      {hiddenGemTier}
    </span>
  </div>
)}
```

- [ ] **Step 1: Add `neighborhoodBadgeText` to the props interface**

In `components/BuffetHeroHeader.tsx`, locate `interface BuffetHeroHeaderProps` and add:
```ts
neighborhoodBadgeText?: string | null;
```

Also add it to the destructured props in the function signature:
```tsx
export default function BuffetHeroHeader({ buffet, openStatus, cuisineInfo, hiddenGemTier, neighborhoodBadgeText }: BuffetHeroHeaderProps) {
```

- [ ] **Step 2: Replace the hidden gem badge block with a combined badge row**

Replace the existing `{hiddenGemTier && (...)}` block with:
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

- [ ] **Step 3: Verify TypeScript compiles with no new errors in this file**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet" && npx tsc --noEmit 2>&1 | grep "BuffetHeroHeader"
```

Expected: no output (no errors in this file).

- [ ] **Step 4: Commit**

```bash
git add components/BuffetHeroHeader.tsx
git commit -m "feat: add neighborhoodBadgeText amber badge to BuffetHeroHeader"
```

---

### Task 2: Wire `neighborhoodBadgeText` on the buffet detail page

**Files:**
- Modify: `app/chinese-buffets/[city-state]/[slug]/page.tsx`

**Context:**
The page already has:
```tsx
const { hiddenGemScore, hiddenGemTier } = computeHiddenGemScore(
  buffet as any,
  cityInfo?.buffets ?? [buffet]
);
```
(around line 452). `cityInfo?.buffets` is the full `Buffet[]` for the city — use the same array.

The page passes `hiddenGemTier` to `BuffetHeroHeader` at line 752:
```tsx
<BuffetHeroHeader buffet={buffet} openStatus={openStatus} cuisineInfo={menuData} hiddenGemTier={hiddenGemTier} />
```

There is also a **mobile inline badge block** around line 669 that renders `hiddenGemTier` directly (not via `BuffetHeroHeader`):
```tsx
{hiddenGemTier && (
  <div className="pt-1">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 ring-1 ring-violet-200 px-2.5 py-0.5 text-xs font-medium text-violet-700">
      {hiddenGemTier}
    </span>
  </div>
)}
```
Both the desktop and mobile paths must be updated.

- [ ] **Step 1: Add the import for `computeNeighborhoodChampion`**

Near the top of `app/chinese-buffets/[city-state]/[slug]/page.tsx`, alongside the existing score imports. First check whether `lib/neighborhoodChampion` is already imported:

```bash
grep "neighborhoodChampion" "app/chinese-buffets/[city-state]/[slug]/page.tsx"
```

If no existing import, add a new line:
```tsx
import { computeNeighborhoodChampion } from '@/lib/neighborhoodChampion';
```

If there is already an import from `@/lib/neighborhoodChampion`, add `computeNeighborhoodChampion` to that existing import statement rather than creating a duplicate.

- [ ] **Step 2: Compute `neighborhoodBadgeText` right after `hiddenGemTier`**

Immediately after the `computeHiddenGemScore` call, add:
```tsx
const { neighborhoodBadgeText } = computeNeighborhoodChampion(
  buffet as any,
  cityInfo?.buffets ?? [buffet]
);
```

- [ ] **Step 3: Pass `neighborhoodBadgeText` to the desktop `BuffetHeroHeader`**

Find the `<BuffetHeroHeader ... />` call (line ~752) and add the prop:
```tsx
<BuffetHeroHeader
  buffet={buffet}
  openStatus={openStatus}
  cuisineInfo={menuData}
  hiddenGemTier={hiddenGemTier}
  neighborhoodBadgeText={neighborhoodBadgeText}
/>
```

- [ ] **Step 4: Add the neighborhood badge to the mobile inline block**

Find the mobile `{hiddenGemTier && (...)}` block (around line 669). Replace it with:
```tsx
{(hiddenGemTier || neighborhoodBadgeText) && (
  <div className="pt-1 flex flex-wrap gap-1.5">
    {hiddenGemTier && (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 ring-1 ring-violet-200 px-2.5 py-0.5 text-xs font-medium text-violet-700">
        {hiddenGemTier}
      </span>
    )}
    {neighborhoodBadgeText && (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 ring-1 ring-amber-200 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        {neighborhoodBadgeText}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify TypeScript compiles with no new errors in this file**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet" && npx tsc --noEmit 2>&1 | grep "city-state\]\/\[slug\]"
```

Expected: same errors as before (pre-existing, unrelated to our changes) — no new errors.

- [ ] **Step 6: Commit**

```bash
git add "app/chinese-buffets/[city-state]/[slug]/page.tsx"
git commit -m "feat: show neighborhood champion badge on buffet detail page hero"
```

---

### Task 3: Add champion emoji to city listing cards and neighborhoods section

**Files:**
- Modify: `app/chinese-buffets/[city-state]/page.tsx`

**Context:**
This file contains three things we need to change:

1. **`BuffetCardSlim` inline component** (lines 62–96): currently accepts `{ buffet: CityBuffetRow; citySlug: string }`. We need to add `isChampion?: boolean` and prepend 🏆 to the neighborhood tag when true.

2. **Card grid render** (line ~558): `<BuffetCardSlim key={buffet.id} buffet={buffet} citySlug={citySlug} />`. Needs `isChampion` prop.

3. **Neighborhoods section** (lines ~498–531): renders `neighborhood.neighborhood` name and `{count} buffets`. Needs champion name appended.

The available variables after destructuring (line ~268):
- `cityName: string` — city display name
- `stateAbbr: string` — from `data.stateAbbr` (line 230)
- `buffets: CityBuffetRow[]` — full unfiltered list
- `neighborhoods: NeighborhoodRollupRow[]` — with `.neighborhood` (name), `.slug`, `.buffetCount`
- `citySlug: string` — from `params['city-state']`

**`CityBuffetRow.address` is a flat string**, so we must construct a proper nested address object when building `buffetsForRanking`. We also coerce null `rating`/`reviewsCount` to `0` to prevent NaN in the sort comparator.

- [ ] **Step 1: Add the import for `computeAllNeighborhoodChampions`**

Near the top of `app/chinese-buffets/[city-state]/page.tsx`, add:
```tsx
import { computeAllNeighborhoodChampions } from '@/lib/neighborhoodChampion';
```

- [ ] **Step 2: Add `isChampion` prop to `BuffetCardSlim`**

Find the `BuffetCardSlim` function definition (line ~62). Change:
```tsx
function BuffetCardSlim({ buffet, citySlug }: { buffet: CityBuffetRow; citySlug: string }) {
```
to:
```tsx
function BuffetCardSlim({ buffet, citySlug, isChampion }: { buffet: CityBuffetRow; citySlug: string; isChampion?: boolean }) {
```

- [ ] **Step 3: Update the neighborhood tag inside `BuffetCardSlim`**

Find the neighborhood tag (line ~83):
```tsx
{buffet.neighborhood && (
  <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">{buffet.neighborhood}</span>
)}
```
Replace with:
```tsx
{buffet.neighborhood && (
  <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">
    {isChampion ? `🏆 ${buffet.neighborhood}` : buffet.neighborhood}
  </span>
)}
```

- [ ] **Step 4: Compute `championIds` and `championByNeighborhood`**

After the pagination lines (`const initialBuffets`, `const remainingBuffets`, `const hasMore`), add:

```tsx
// Compute neighborhood champion data for cards and neighborhoods section
const buffetsForRanking = buffets.map(b => ({
  ...b,
  rating: b.rating ?? 0,
  reviewsCount: b.reviewsCount ?? 0,
  address: { city: cityName, stateAbbr },
  citySlug,
}));
const rankedBuffets = computeAllNeighborhoodChampions(buffetsForRanking as any);

const championIds = new Set(
  rankedBuffets.filter(b => b.isNeighborhoodChampion).map(b => b.id)
);

const championByNeighborhood = new Map<string, string>();
for (const b of rankedBuffets) {
  if (b.isNeighborhoodChampion && b.neighborhood) {
    championByNeighborhood.set(b.neighborhood, b.name);
  }
}
```

- [ ] **Step 5: Pass `isChampion` to the card grid**

Find the card grid (line ~558):
```tsx
{initialBuffets.map((buffet) => (
  <BuffetCardSlim key={buffet.id} buffet={buffet} citySlug={citySlug} />
))}
```
Replace with:
```tsx
{initialBuffets.map((buffet) => (
  <BuffetCardSlim key={buffet.id} buffet={buffet} citySlug={citySlug} isChampion={championIds.has(buffet.id)} />
))}
```

- [ ] **Step 6: Update the neighborhoods section**

Find the neighborhood card `<p>` element (inside the neighborhoods grid, shows buffet count):
```tsx
<p className="text-[var(--muted)] text-xs">
  {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
</p>
```
Replace with:
```tsx
<p className="text-[var(--muted)] text-xs">
  {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
  {championByNeighborhood.has(neighborhood.neighborhood) && (
    <> · {championByNeighborhood.get(neighborhood.neighborhood)} 🏆</>
  )}
</p>
```

- [ ] **Step 7: Verify TypeScript compiles with no new errors in this file**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet" && npx tsc --noEmit 2>&1 | grep "city-state\]\/page"
```

Expected: same pre-existing errors — no new errors introduced.

- [ ] **Step 8: Commit**

```bash
git add "app/chinese-buffets/[city-state]/page.tsx"
git commit -m "feat: show neighborhood champion on city cards and neighborhoods section"
```

---

### Task 4: Smoke-test in the browser

**Files:** No code changes — verification only.

- [ ] **Step 1: Start the dev server**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet" && npm run dev
```

- [ ] **Step 2: Check the city page**

Open a city page that has neighborhoods (e.g. Houston: `http://localhost:3000/chinese-buffets/houston-tx`).

Verify:
- At least one card in the initial 12 shows `🏆 <neighborhood name>` in the tag row
- The neighborhoods section shows `· <buffet name> 🏆` on the second line for neighborhoods with a champion

- [ ] **Step 3: Check the detail page**

Click through to a buffet that is the neighborhood champion. Verify:
- An amber badge appears in the hero (e.g. `#1 of 9 in Montrose 🏆`) alongside or below the hidden gem badge (if applicable)
- The badge appears on both desktop layout (via `BuffetHeroHeader`) and mobile layout

- [ ] **Step 4: Check a non-champion buffet**

Navigate to a buffet that is NOT the neighborhood champion. Verify no amber badge appears.

- [ ] **Step 5: Fix any issues found, then commit only the changed files**

If smoke testing revealed bugs, fix them and commit only the files you modified:
```bash
git add components/BuffetHeroHeader.tsx "app/chinese-buffets/[city-state]/[slug]/page.tsx" "app/chinese-buffets/[city-state]/page.tsx"
git commit -m "fix: <describe what was fixed>"
```

If no issues, no commit needed — the previous task commits already captured all changes.
