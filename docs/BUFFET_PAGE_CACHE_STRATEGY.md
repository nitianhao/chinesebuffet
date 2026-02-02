# Buffet Detail Page Cache Strategy

## Overview

The buffet detail page (`/chinese-buffets/[city-state]/[slug]`) uses a layered caching strategy to reduce TTFB by avoiding heavy CPU work on every request. It is served via **ISR (Incremental Static Regeneration)** with on-demand generation.

## Route Config (ISR)

```ts
export const revalidate = 86400; // 24 hours
```

- **No `generateStaticParams`** – Too many pages to prebuild; we use on-demand ISR.
- **First request** for a slug generates the page and caches it.
- **Subsequent requests** within 24h receive cached HTML.
- **After 24h**, the next request triggers background revalidation (stale-while-revalidate).

## What Prevented Static Caching (Before)

| Cause | Fix |
|-------|-----|
| Async data fetch (InstantDB) without route-level cache | `export const revalidate = 86400` |
| No route config for ISR | Added revalidate export |
| No on-demand invalidation when data changes | `/api/revalidate` with tag/path support |

The page does **not** use `cookies()`, `headers()`, or `searchParams`, so it was eligible for ISR once `revalidate` was set.

## What Was Computed on Every Request (Before)

The following CPU-heavy transforms ran on **every** request:

| Transform | Purpose |
|-----------|---------|
| `formatHoursList` | Parse raw hours into `{day, ranges}` format |
| `formatHoursList` (secondary) | Same for secondary opening hours |
| `summarizePopularTimes` | Build "Popular times available (N days)" string |
| `normalizePopularTimes` | Normalize histogram into day-ordered array |
| `parseOrderByItems` | Parse JSON/object orderBy into `{name, url}[]` |
| `generateDecisionSummary` | Build 140-char decision summary |
| `extractKeyPOIsForSchema` | Extract top 5 POIs for JSON-LD |
| `transformAdditionalInfoArray` | Transform 8 amenity keys (Accessibility, Amenities, etc.) |
| `sortImages` | Sort images by area (largest first) |

## What Is Cached Now

All of the above are computed once and cached via **Next.js `unstable_cache`** in `lib/buffet-page-transforms.ts`.

### Cache Key

```
buffet-page-transforms-{cityState}-{slug}
```

Example: `buffet-page-transforms-salem-or-golden-dragon-buffet`

### Revalidation Strategy

| Strategy | Value |
|----------|-------|
| **Time-based** | `revalidate: 86400` (24 hours) |
| **Tags** | `buffet-transforms-{cityState}-{slug}`, `buffet-transforms` |

### On-Demand Invalidation

**Option 1: API route** (for webhooks, cron, external systems)

```bash
curl -X POST "https://yoursite.com/api/revalidate?secret=$REVALIDATE_SECRET&buffet=salem-or/golden-dragon"
```

This invalidates both the page HTML and the transforms cache for that buffet.

**Option 2: In code** (Server Actions, Route Handlers)

```ts
import { revalidateTag, revalidatePath } from 'next/cache';

// Single buffet
revalidateTag(`buffet-transforms-${cityState}-${slug}`);
revalidatePath(`/chinese-buffets/${cityState}/${slug}`);

// All buffet transforms
revalidateTag('buffet-transforms');
```

**Env:** Set `REVALIDATE_SECRET` for API auth.

## Request-Scoped Deduplication (React `cache`)

Within a single request, the following are deduplicated via `React.cache()`:

| Function | Purpose |
|---------|---------|
| `getCachedBuffet` | Buffet fetch shared by metadata, page, and transforms |
| `getCachedCity` | City fetch shared by page and metadata |
| `getCachedMenu` | Menu fetch shared by page |

When `getCachedPageTransforms` runs (on cache miss), it calls `getCachedBuffet` internally. Because both use the same React-cached getter, the buffet is **not** fetched twice.

## Data Flow

```
Request
  ├─ getCachedBuffet(cityState, slug)     [React cache]
  ├─ getCachedCity(cityState)             [React cache]
  ├─ getCachedMenu(placeId)                [React cache]
  └─ getCachedPageTransforms(cityState, slug)
       └─ On cache miss:
            └─ getCachedBuffet(cityState, slug)  [React cache HIT]
            └─ computeTransforms(buffet)
            └─ Store in unstable_cache
       └─ On cache hit: return cached result
```

## Fallback

If `getCachedPageTransforms` fails (e.g. cache error), the page falls back to `computeTransforms(buffet)` inline. Output remains identical.

## Output Guarantee

The refactor guarantees **identical output** to the original. All transform logic lives in `lib/buffet-page-transforms.ts` and is shared by both the cached path and the fallback.
