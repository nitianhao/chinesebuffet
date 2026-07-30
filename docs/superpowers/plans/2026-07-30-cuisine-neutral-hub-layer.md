# Cuisine-neutral Hub Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the site's neutral hub/nav surfaces (homepage, `/cities`, header/footer) cuisine-agnostic routers into the existing per-cuisine route trees, so the directory serves Chinese, Indian, and future cuisines without changing any indexed money-page URL.

**Architecture:** Introduce a cuisine registry (`lib/cuisines.ts`) as the single source of truth, and a neutral data helper (`lib/hub-data.ts`) that fans out over the registry, calls each cuisine's existing rollups, and merges by city/state slug. Neutral surfaces render inline per-cuisine sub-links from that merged data. No money-page URLs, no new indexable URLs, no sitemap changes.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, InstantDB-backed rollups, Tailwind CSS variables. Tests run via `npx tsx <file>.test.ts` (repo convention — no jest/vitest).

## Global Constraints

- Do NOT change any URL under `/chinese-buffets/*` or `/indian-buffets/*` (indexed money pages).
- Do NOT create new indexable URLs or new page types in this phase.
- Do NOT restructure sitemaps.
- Keep `/cities` and `/` self-canonical and indexable; changes are content/link only.
- Retain "Chinese" wording in `/cities` and homepage titles (as "Chinese & Indian buffets") to preserve query relevance.
- Every neutral surface must derive cuisines from `CUISINES` in `lib/cuisines.ts` — no hardcoded `"chinese"` / `/chinese-buffets` literals in the changed hub surfaces.
- Validation matches repo tooling and the project's "targeted checks, not full suites" rule: `npx tsx` tests for pure logic; `npm run lint` and `npm run smoke:routes` for surfaces. No full `next build` unless explicitly requested.

---

### Task 1: Cuisine registry — `lib/cuisines.ts`

Single source of truth for which cuisines exist and how to reach them. Pure config plus a small sanity test.

**Files:**
- Create: `lib/cuisines.ts`
- Test: `lib/cuisines.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type CuisineKey = 'chinese' | 'indian'`
  - `interface CuisineDef { key: CuisineKey; label: string; routePrefix: string }`
  - `const CUISINES: readonly CuisineDef[]` — ordered `chinese`, then `indian`.
  - `function cuisineByKey(key: string): CuisineDef | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// lib/cuisines.test.ts
// Run with: npx tsx lib/cuisines.test.ts
import { CUISINES, cuisineByKey } from './cuisines';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

assert(CUISINES.length >= 2, 'has at least chinese + indian');
assert(CUISINES[0].key === 'chinese', 'chinese is first');
assert(CUISINES.some(c => c.key === 'indian'), 'indian present');
assert(CUISINES.every(c => c.routePrefix.startsWith('/') && !c.routePrefix.endsWith('/')), 'routePrefix is a clean absolute path');
assert(new Set(CUISINES.map(c => c.routePrefix)).size === CUISINES.length, 'routePrefixes are unique');
assert(new Set(CUISINES.map(c => c.key)).size === CUISINES.length, 'keys are unique');
assert(cuisineByKey('indian')?.routePrefix === '/indian-buffets', 'cuisineByKey resolves indian');
assert(cuisineByKey('nope') === undefined, 'cuisineByKey returns undefined for unknown');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/cuisines.test.ts`
Expected: FAIL — cannot find module `./cuisines` (or export missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/cuisines.ts
export type CuisineKey = 'chinese' | 'indian';

export interface CuisineDef {
  key: CuisineKey;
  label: string;
  /** Absolute route prefix for this cuisine's tree, no trailing slash. */
  routePrefix: string;
}

/**
 * Single source of truth for cuisines the directory serves.
 * Neutral hub/nav surfaces iterate this instead of hardcoding "chinese".
 * To add a cuisine: add an entry here, its route tree, and its rollup module.
 */
export const CUISINES: readonly CuisineDef[] = [
  { key: 'chinese', label: 'Chinese', routePrefix: '/chinese-buffets' },
  { key: 'indian', label: 'Indian', routePrefix: '/indian-buffets' },
] as const;

export function cuisineByKey(key: string): CuisineDef | undefined {
  return CUISINES.find((c) => c.key === key);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/cuisines.test.ts`
Expected: PASS — `8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add lib/cuisines.ts lib/cuisines.test.ts
git commit -m "feat: add cuisine registry for neutral hub layer"
```

---

### Task 2: Neutral merge helper — `lib/hub-data.ts`

The only place merge logic lives. Split into a **pure** function (unit-tested) and an **async fetcher** (thin wrapper over the pure function + real rollups).

**Files:**
- Create: `lib/hub-data.ts`
- Test: `lib/hub-data.test.ts`

**Interfaces:**
- Consumes:
  - `CUISINES`, `CuisineKey` from `lib/cuisines.ts` (Task 1).
  - Chinese rollups: `getCitiesRollup` / `getStatesRollup` from `lib/rollups.ts` → `{ cities }` / `{ states }`, rows shaped `{ slug, city?, state?, stateAbbr?, buffetCount }`.
  - Indian rollups: `getCitiesRollup` / `getStatesRollup` from `lib/indian-rollups.ts` → same shape.
- Produces:
  - `interface CuisineAvailability { key: CuisineKey; label: string; count: number }`
  - `interface NeutralCityRow { slug: string; city: string; state: string; totalCount: number; cuisines: CuisineAvailability[] }`
  - `function mergeCityRollups(perCuisine: { key: CuisineKey; label: string; rows: RawCityRow[] }[]): NeutralCityRow[]`
    where `RawCityRow = { slug: string; city?: string; state?: string; buffetCount?: number }`.
  - `async function getNeutralCitiesRollup(): Promise<NeutralCityRow[]>`

- [ ] **Step 1: Write the failing test (pure merge only)**

```ts
// lib/hub-data.test.ts
// Run with: npx tsx lib/hub-data.test.ts
import { mergeCityRollups } from './hub-data';

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
}

const merged = mergeCityRollups([
  { key: 'chinese', label: 'Chinese', rows: [
    { slug: 'dallas-tx', city: 'Dallas', state: 'TX', buffetCount: 4 },
    { slug: 'reno-nv', city: 'Reno', state: 'NV', buffetCount: 2 },
  ]},
  { key: 'indian', label: 'Indian', rows: [
    { slug: 'dallas-tx', city: 'Dallas', state: 'TX', buffetCount: 3 },
    { slug: 'edison-nj', city: 'Edison', state: 'NJ', buffetCount: 5 },
  ]},
]);

const bySlug = Object.fromEntries(merged.map(r => [r.slug, r]));

assert(merged.length === 3, 'union of slugs across cuisines (dallas, reno, edison)');
assert(bySlug['dallas-tx'].cuisines.length === 2, 'dallas has both cuisines');
assert(bySlug['dallas-tx'].totalCount === 7, 'dallas totalCount sums both (4+3)');
assert(bySlug['reno-nv'].cuisines.length === 1 && bySlug['reno-nv'].cuisines[0].key === 'chinese', 'reno chinese-only');
assert(bySlug['edison-nj'].cuisines[0].key === 'indian', 'edison indian-only');
assert(merged[0].slug === 'dallas-tx', 'sorted by totalCount desc (dallas=7 first)');
assert(bySlug['dallas-tx'].city === 'Dallas' && bySlug['dallas-tx'].state === 'TX', 'city/state carried through');

// A cuisine reporting zero for a slug must not create an empty availability entry
const zero = mergeCityRollups([
  { key: 'chinese', label: 'Chinese', rows: [{ slug: 'x-tx', city: 'X', state: 'TX', buffetCount: 0 }] },
  { key: 'indian', label: 'Indian', rows: [{ slug: 'x-tx', city: 'X', state: 'TX', buffetCount: 2 }] },
]);
assert(zero[0].cuisines.length === 1 && zero[0].cuisines[0].key === 'indian', 'zero-count cuisine excluded');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/hub-data.test.ts`
Expected: FAIL — cannot find module `./hub-data` / `mergeCityRollups` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/hub-data.ts
import { CUISINES, type CuisineKey } from './cuisines';
import { getCitiesRollup as getChineseCities } from './rollups';
import { getCitiesRollup as getIndianCities } from './indian-rollups';

export interface RawCityRow {
  slug: string;
  city?: string;
  state?: string;
  buffetCount?: number;
}

export interface CuisineAvailability {
  key: CuisineKey;
  label: string;
  count: number;
}

export interface NeutralCityRow {
  slug: string;
  city: string;
  state: string;
  totalCount: number;
  cuisines: CuisineAvailability[];
}

/**
 * Pure merge: union city rows across cuisines by slug. A cuisine only appears
 * in a row's `cuisines` list when it has a positive buffet count there.
 * Sorted by totalCount desc, then city name asc.
 */
export function mergeCityRollups(
  perCuisine: { key: CuisineKey; label: string; rows: RawCityRow[] }[],
): NeutralCityRow[] {
  const bySlug = new Map<string, NeutralCityRow>();

  for (const { key, label, rows } of perCuisine) {
    for (const row of rows) {
      const count = row.buffetCount ?? 0;
      let entry = bySlug.get(row.slug);
      if (!entry) {
        entry = {
          slug: row.slug,
          city: row.city ?? '',
          state: row.state ?? '',
          totalCount: 0,
          cuisines: [],
        };
        bySlug.set(row.slug, entry);
      }
      // Fill city/state if a later cuisine has them and we don't yet.
      if (!entry.city && row.city) entry.city = row.city;
      if (!entry.state && row.state) entry.state = row.state;
      if (count > 0) {
        entry.cuisines.push({ key, label, count });
        entry.totalCount += count;
      }
    }
  }

  return Array.from(bySlug.values())
    .filter((r) => r.cuisines.length > 0)
    .sort((a, b) => b.totalCount - a.totalCount || a.city.localeCompare(b.city));
}

/**
 * Async fetcher: pull each cuisine's cities rollup and merge.
 * Order of `rows` follows CUISINES so labels/keys stay stable.
 */
export async function getNeutralCitiesRollup(): Promise<NeutralCityRow[]> {
  const [chinese, indian] = await Promise.all([
    getChineseCities(),
    getIndianCities(),
  ]);
  const byKey: Record<CuisineKey, RawCityRow[]> = {
    chinese: (chinese.cities as RawCityRow[]) ?? [],
    indian: (indian.cities as RawCityRow[]) ?? [],
  };
  return mergeCityRollups(
    CUISINES.map((c) => ({ key: c.key, label: c.label, rows: byKey[c.key] ?? [] })),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/hub-data.test.ts`
Expected: PASS — `8 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add lib/hub-data.ts lib/hub-data.test.ts
git commit -m "feat: add neutral cities merge helper over cuisine rollups"
```

---

### Task 3: Make `/cities` cuisine-neutral

Replace the hardcoded single-link city cards with inline per-cuisine sub-links. Keep the URL and indexability; keep "Chinese & Indian" in the title.

**Files:**
- Modify: `app/cities/page.tsx`

**Interfaces:**
- Consumes: `getNeutralCitiesRollup`, `NeutralCityRow` from `lib/hub-data.ts` (Task 2); `cuisineByKey` from `lib/cuisines.ts` (Task 1).
- Produces: none (leaf page).

- [ ] **Step 1: Rewrite the page to render neutral rows**

Replace the file body with the version below. Note: `getCitiesRollup()`/`{ cities }` is replaced by `getNeutralCitiesRollup()`/rows; each card renders one link per available cuisine into `{routePrefix}/{slug}`.

```tsx
// app/cities/page.tsx
import { Metadata } from 'next';
import Link from 'next/link';
import { getNeutralCitiesRollup } from '@/lib/hub-data';
import { cuisineByKey } from '@/lib/cuisines';

export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'All Cities — Chinese & Indian Buffets Directory',
  description:
    'Browse Chinese and Indian buffets by city across the USA. Each city lists local all-you-can-eat buffets with hours, ratings, and directions.',
};

export default async function CitiesPage() {
  const cities = await getNeutralCitiesRollup();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text)] mb-3">All Cities</h1>
          <p className="text-[var(--muted)] text-lg leading-relaxed max-w-2xl">
            Browse Chinese and Indian buffets by city across the United States. Each
            city links to local all-you-can-eat buffets with hours, ratings, and
            directions.
          </p>
        </header>

        {cities.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {cities.map((c) => (
              <div
                key={c.slug}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
              >
                <span className="block truncate font-semibold text-[var(--text)]">
                  {c.city}
                </span>
                <span className="block text-[var(--muted)] text-xs mt-0.5">{c.state}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm">
                  {c.cuisines.map((cu, i) => {
                    const def = cuisineByKey(cu.key);
                    if (!def) return null;
                    return (
                      <span key={cu.key} className="whitespace-nowrap">
                        {i > 0 && <span className="text-[var(--muted)]">· </span>}
                        <Link
                          href={`${def.routePrefix}/${c.slug}`}
                          className="font-medium text-[var(--accent1)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)]"
                        >
                          {cu.label}
                        </Link>
                      </span>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)]">No cities available. Try browsing by state.</p>
        )}

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[var(--accent1)] font-medium hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint the changed file**

Run: `npm run lint -- --file app/cities/page.tsx`
Expected: no errors for this file (warnings acceptable if pre-existing project-wide).

- [ ] **Step 3: Smoke-test the route renders**

Run: `npm run smoke:routes` (or, if it accepts a filter, target `/cities`).
Expected: `/cities` returns 200 and its city cards contain `/chinese-buffets/` and/or `/indian-buffets/` hrefs. If `smoke:routes` cannot target a single route, instead start `npm run dev` in a scratch terminal, load `http://localhost:3000/cities`, and confirm inline cuisine links render for a multi-cuisine city.

- [ ] **Step 4: Commit**

```bash
git add app/cities/page.tsx
git commit -m "feat: make /cities cuisine-neutral with inline sub-links"
```

---

### Task 4: Make homepage sections cuisine-neutral

Generalize "Top cities" (and the "Browse by state" / "Browse by region" / "Top rated" links) so they no longer hardcode `/chinese-buffets`. Reuse the neutral cities data for the "Top cities" grid; for state/region sections that currently point at one cuisine, present a per-cuisine link pair (the states section already does this — extend the pattern from the registry).

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getNeutralCitiesRollup` from `lib/hub-data.ts` (Task 2); `CUISINES`, `cuisineByKey` from `lib/cuisines.ts` (Task 1); existing `getHomePageData()` from `lib/homepage-data.ts` (unchanged).
- Produces: none (leaf page).

- [ ] **Step 1: Read the current sections before editing**

Run: `sed -n '90,260p' app/page.tsx` (via Read tool) to see the exact "Top cities" (~182–205), "Browse by state" (~210–235), "Browse by region" (~238–255), and "Top rated" (~257+) markup and the `data.popularCities` shape.

- [ ] **Step 2: Add neutral cities to the page data**

At the top of the component, alongside `const data = await getHomePageData();`, add:

```tsx
import { getNeutralCitiesRollup } from '@/lib/hub-data';
import { CUISINES, cuisineByKey } from '@/lib/cuisines';
// ...
const neutralCities = (await getNeutralCitiesRollup()).slice(0, 12);
```

- [ ] **Step 3: Replace the "Top cities" grid links**

Swap the `data.popularCities.map(... href={`/chinese-buffets/${city.slug}`} ...)` block (~line 191) for a neutral card that renders inline per-cuisine sub-links, mirroring Task 3's card markup but using `neutralCities`:

```tsx
{neutralCities.map((c) => (
  <div key={c.slug} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
    <span className="block truncate font-semibold text-[var(--text)]">{c.city}</span>
    <span className="block text-[var(--muted)] text-xs mt-0.5">{c.state}</span>
    <span className="mt-1 flex flex-wrap gap-x-2 text-sm">
      {c.cuisines.map((cu, i) => {
        const def = cuisineByKey(cu.key);
        if (!def) return null;
        return (
          <span key={cu.key} className="whitespace-nowrap">
            {i > 0 && <span className="text-[var(--muted)]">· </span>}
            <Link href={`${def.routePrefix}/${c.slug}`} className="font-medium text-[var(--accent1)] hover:underline">
              {cu.label}
            </Link>
          </span>
        );
      })}
    </span>
  </div>
))}
```

Update the section's `actionHref` (~line 184) from `"/chinese-buffets/cities"` to `"/cities"` so "see all" points at the neutral directory.

- [ ] **Step 4: Neutralize the "Browse by state" and "Browse by region" section links**

For the state list (~line 219) and region list (~line 242–243), replace each single `/chinese-buffets/...` link with a per-cuisine link pair driven by `CUISINES`. For a region row:

```tsx
<span className="flex flex-wrap gap-x-2 text-sm">
  {CUISINES.map((cu, i) => (
    <span key={cu.key} className="whitespace-nowrap">
      {i > 0 && <span className="text-[var(--muted)]">· </span>}
      <Link href={`${cu.routePrefix}/regions/${region}`} className="font-medium text-[var(--accent1)] hover:underline">
        {cu.label}
      </Link>
    </span>
  ))}
</span>
```

Apply the same pattern for states, using `${cu.routePrefix}/states/${state.stateAbbr.toLowerCase()}`. Leave the "Top rated buffets" section's individual buffet cards as-is (each buffet already links to its own cuisine's `[slug]` page via existing data — do not change those hrefs).

- [ ] **Step 5: Lint the changed file**

Run: `npm run lint -- --file app/page.tsx`
Expected: no new errors for this file.

- [ ] **Step 6: Smoke-test the homepage**

Run: `npm run smoke:routes` (or load `http://localhost:3000/` via `npm run dev`).
Expected: `/` returns 200; "Top cities" cards show inline cuisine links; "Browse by state"/"Browse by region" each expose both `/chinese-buffets/` and `/indian-buffets/` links; "see all cities" points to `/cities`.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: make homepage hub sections cuisine-neutral"
```

---

### Task 5: Neutralize header/footer nav

Align the primary nav to the registry so global navigation offers both cuisines (and future cuisines) rather than only Chinese. Some nav components are already modified in the working tree; this task only touches the cuisine-routing links within them.

**Files:**
- Modify: `components/site/Header.tsx`
- Modify: `components/site/BottomNav.tsx`

**Interfaces:**
- Consumes: `CUISINES` from `lib/cuisines.ts` (Task 1).
- Produces: none.

- [ ] **Step 1: Inspect current nav links**

Run (via Read/Grep): `grep -nE "chinese-buffets|indian-buffets|/cities|/states|href=" components/site/Header.tsx components/site/BottomNav.tsx`
Identify each link that hardcodes a cuisine route.

- [ ] **Step 2: Replace hardcoded cuisine links with registry-driven links**

For any nav entry that pointed at `/chinese-buffets/cities` (or similar top-of-tree entry) where the intent is "browse all", point it at the neutral `/cities`. For entries meant to expose a specific cuisine's hub, render one link per `CUISINES` entry, e.g.:

```tsx
import { CUISINES } from '@/lib/cuisines';
// ...
{CUISINES.map((cu) => (
  <Link key={cu.key} href={cu.routePrefix} className={/* existing nav link classes */}>
    {cu.label} Buffets
  </Link>
))}
```

Preserve existing class names, ARIA attributes, and layout — only swap the href source. Do not alter unrelated working-tree changes in these files.

- [ ] **Step 3: Lint the changed files**

Run: `npm run lint -- --file components/site/Header.tsx --file components/site/BottomNav.tsx`
Expected: no new errors for these files.

- [ ] **Step 4: Smoke-test nav renders**

Run: load `http://localhost:3000/` via `npm run dev` and confirm the header and bottom nav expose both cuisine hubs and the neutral `/cities` link, with no console errors.

- [ ] **Step 5: Commit**

```bash
git add components/site/Header.tsx components/site/BottomNav.tsx
git commit -m "feat: make site nav cuisine-neutral via registry"
```

---

## Self-Review

**Spec coverage:**
- Cuisine registry (spec §1) → Task 1.
- Neutral data helpers (spec §2) → Task 2.
- `/cities` neutral (spec §3) → Task 3.
- Homepage sections neutral (spec §3) → Task 4.
- Header/footer nav neutral (spec §3) → Task 5.
- SEO guardrails (spec §4): no money-page URL changes (Tasks 3–5 only add/relabel links); `/cities` and `/` keep URLs + indexability + "Chinese & Indian" titles (Tasks 3–4); no sitemap changes (none of the tasks touch sitemaps). Covered.
- Out-of-scope items (spec §5): no `/buffets/[city]`, no `/cities/[city-state]`, no sitemap work — none introduced. Covered.

**Placeholder scan:** No TBD/TODO; all code steps show full code; commands have expected output.

**Type consistency:** `CuisineKey`, `CuisineDef`, `cuisineByKey` (Task 1) used consistently in Tasks 2–5. `NeutralCityRow`/`getNeutralCitiesRollup`/`mergeCityRollups` (Task 2) used consistently in Tasks 3–4. `routePrefix` has no trailing slash everywhere it's concatenated.

**Note for executor:** Line numbers in Task 4 are approximate (from the current `app/page.tsx`); Step 1 re-reads the file to anchor edits precisely. The states/regions data shape (`state.stateAbbr`, `region`) is taken from the existing homepage grep — confirm field names against `getHomePageData()` while editing.
