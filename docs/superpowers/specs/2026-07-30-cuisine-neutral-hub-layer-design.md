# Cuisine-neutral hub layer — Design

Date: 2026-07-30
Status: Approved (pending spec review)

## Goal

Make the site's information architecture cuisine-agnostic so it can serve
Chinese, Indian, and future buffet types — **without changing any indexed
money-page URL** and without risking Google de-indexing or ranking loss on the
pages that currently earn.

Chosen scope (from brainstorming):
- **Primary goal:** clean navigation + scalability. Neutral hub/nav surfaces
  become routers into the existing per-cuisine route trees. Minimal new URLs,
  lowest SEO risk.
- **Multi-cuisine city routing:** inline cuisine sub-links (e.g.
  `Dallas — Chinese · Indian`). Zero new URLs, zero new page types.

## Current state (as found)

- Route trees are already cuisine-prefixed and fully parallel:
  - `/chinese-buffets/*` and `/indian-buffets/*` each have their own
    `cities`, `states`, `regions`, `neighborhoods`, `[city-state]`,
    `[city-state]/[slug]`, and modifier pages (`best`, `cheap`, `top-rated`,
    `open-now`).
  - These are the indexed money pages. They are already generic-ready and
    separated by cuisine.
- The still-Chinese-only surfaces are the neutral entry points:
  - **Homepage** (`app/page.tsx`): metadata already says "Chinese & Indian";
    the *states* section already links both cuisines (two buttons). But
    "Top cities", "Browse by state", "Browse by region", and "Top rated" still
    hardcode `/chinese-buffets/*`.
  - **Generic `/cities`** (`app/cities/page.tsx`): title
    "All Cities - Chinese Buffets Directory"; every city links to
    `/chinese-buffets/${slug}`.
- Data layer: two parallel rollup modules with identical shapes —
  `lib/rollups.ts` (Chinese) and `lib/indian-rollups.ts` (Indian) — each
  exposing `getCitiesRollup()` / `getStatesRollup()` returning
  `CityRollupRow { slug, city, state, buffetCount }` (and the state equivalent).
  Merging by `slug` yields "which cuisines exist in this city."
- Sitemaps: `sitemap-buffets/cities/states/neighborhoods.xml` are generically
  named but hold Chinese content; Indian has its own `sitemap-indian-buffets.xml`.

## Design principle

Freeze the money pages. Reshape only the neutral layer on top. Every change is
either a content/link change on an existing URL or a purely additive component.
No money-page URL changes. No new indexable URLs in this phase.

## Components

### 1. Cuisine registry — `lib/cuisines.ts` (new)

Single source of truth for what cuisines exist and how to reach them:

```ts
export const CUISINES = [
  { key: 'chinese', label: 'Chinese', routePrefix: '/chinese-buffets', rollups: chineseRollups },
  { key: 'indian',  label: 'Indian',  routePrefix: '/indian-buffets',  rollups: indianRollups },
] as const;

export type CuisineKey = (typeof CUISINES)[number]['key'];
```

`rollups` references the existing per-cuisine rollup module (`getCitiesRollup`,
`getStatesRollup`, etc.). Adding cuisine #3 later = add one registry entry, its
route tree, and its rollup module. Every neutral surface iterates this array
instead of hardcoding `"chinese"`.

### 2. Neutral data helpers — `lib/hub-data.ts` (new)

Fan out over `CUISINES`, call each cuisine's rollup, merge by slug:

```ts
interface NeutralCityRow {
  slug: string;
  city: string;
  state: string;
  cuisines: { key: CuisineKey; label: string; count: number }[];
}
```

- `getNeutralCitiesRollup(): NeutralCityRow[]` — union of all cuisines' cities,
  merged by slug, each carrying the list of cuisines present (with counts) and
  sorted (e.g. by total buffet count, then name).
- `getNeutralStatesRollup()` / region equivalent as needed by the homepage
  sections, following the same merge pattern.

These helpers are the only place the merge logic lives; surfaces just render.

### 3. Surfaces made neutral (all existing URLs)

- **`/cities`** (`app/cities/page.tsx`)
  - Neutral title/description (retain "Chinese & Indian" wording — see SEO).
  - Each city card renders inline cuisine sub-links per available cuisine
    (`Dallas — Chinese · Indian`) linking into
    `{routePrefix}/{slug}`, instead of a single hardcoded `/chinese-buffets/`
    link.
- **Homepage** (`app/page.tsx`)
  - "Top cities", "Browse by state", "Browse by region", and "Top rated"
    sections iterate cuisines / show inline cuisine sub-links using the neutral
    helpers. The states section (already dual-cuisine) is generalized to the
    same registry-driven pattern.
- **Header / footer nav** (nav components, some already modified in the working
  tree) — neutral labels routing to each cuisine hub, aligned to the registry.

### 4. SEO guardrails (explicit)

- Money-page URLs (`/chinese-buffets/*`, `/indian-buffets/*`): untouched.
- `/cities` and `/` keep their URLs, stay indexable, remain self-canonical. Only
  on-page content and internal links change — a normal content refresh to
  Google. It strengthens internal linking: the Indian tree now receives link
  equity from the homepage and `/cities` hub it previously lacked.
- Keep "Chinese" in the `/cities` and homepage titles (as "Chinese & Indian
  buffets") to preserve existing query relevance while adding Indian.
- Sitemaps: no changes — no new URLs are created in this phase.

## Out of scope (YAGNI / "minimal URLs" decision)

- No new `/buffets/[city]` place-first aggregation pages.
- No new `/cities/[city-state]` neutral hub page.
- No sitemap restructuring.
- No changes to per-cuisine route trees or their content.

## Files touched

- `lib/cuisines.ts` (new)
- `lib/hub-data.ts` (new)
- `app/cities/page.tsx`
- `app/page.tsx`
- nav components (header/footer)

Delivered as small, separately reviewable steps — not one large diff.

## Validation approach

- Reason from code + targeted render checks per changed surface.
- Confirm neutral surfaces link into both existing trees and that money-page
  URLs are unchanged.
- No full build / full test suite unless explicitly requested.
