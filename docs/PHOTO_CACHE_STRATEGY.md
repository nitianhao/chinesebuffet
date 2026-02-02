# Photo Cache Strategy – DB-First External Calls

This document describes the caching layer for external image fetches, eliminating slow external API calls during page render.

## Problem

- **place-photo** and **photo** API routes fetched from Google Places / external URLs on every request
- Page render blocked on repeated external calls (12+ images per buffet page)
- Slow TTFB and LCP when external APIs are slow

## Solution

**DB-first approach:**

1. **If cached exists, use it** – Serve from Next.js `unstable_cache`
2. **If missing, fetch once, store, and serve** – First request fetches from external API, caches result, returns
3. **Page render never blocks on repeated external calls** – Subsequent requests hit cache

## Implementation

### Caching Layer (`lib/photo-cache.ts`)

- `getPlacePhotoCached(photoReference, maxWidthPx, maxHeightPx)` – Google Places photos
- `getExternalPhotoCached(url, maxWidthPx)` – External URLs (Google, Yelp)
- Uses `unstable_cache` with 24h revalidation
- Cache keys: hash of params for uniqueness

### API Routes

- **`/api/place-photo`** – Uses `getPlacePhotoCached` instead of direct fetch
- **`/api/photo`** – Uses `getExternalPhotoCached` instead of direct fetch

### Refresh Script (Out-of-Band)

**`scripts/refresh-photo-cache.ts`**

Warms the cache by:

1. Querying InstantDB for buffets with `imagesCount > 0`
2. Extracting `photoReference` and `photoUrl` from each buffet's images
3. Hitting `/api/place-photo` and `/api/photo` for each unique image

**Run:**

```bash
# Local (requires dev server running)
npm run refresh-photo-cache

# Against production
BASE_URL=https://yoursite.com npm run refresh-photo-cache
```

**Cron example:**

```bash
# Daily at 3am – warm cache before traffic
0 3 * * * cd /path/to/project && BASE_URL=https://yoursite.com npm run refresh-photo-cache
```

## Cache Invalidation

- **Automatic**: 24h revalidation (`revalidate: 86400`)
- **On-demand**: `revalidateTag('place-photo')` or `revalidateTag('external-photo')` via `/api/revalidate`

## Flow

```
Request → /api/place-photo?photoReference=...&maxWidthPx=800
       → getPlacePhotoCached()
       → unstable_cache checks key
       → if hit: return cached (no external call)
       → if miss: fetch from Google, cache, return
```

## Dependencies

- No new external services (uses Next.js built-in cache)
- `INSTANT_ADMIN_TOKEN` required for refresh script (queries DB)
- `GOOGLE_MAPS_API_KEY` or `GOOGLE_PLACES_API_KEY` required for place-photo
