# Buffet Detail Page ISR Implementation

## Summary

The buffet detail page is now served via **ISR (Incremental Static Regeneration)** instead of full dynamic rendering. Most requests receive cached HTML; data is revalidated every 24 hours or on-demand.

## What Prevented Static Caching

1. **Async data fetch without route-level cache** – The page fetches from InstantDB (external DB). Next.js treats such pages as dynamic by default because the data is not statically known at build time.

2. **No route config** – Without `revalidate` or `dynamic`, Next.js had no instruction to cache the output.

3. **No on-demand invalidation** – When buffet data changed in the DB, there was no way to invalidate the cache before the 24h window.

## What Was Fixed

| Change | File | Purpose |
|--------|------|---------|
| `export const revalidate = 86400` | `app/chinese-buffets/[city-state]/[slug]/page.tsx` | Enable ISR with 24h revalidation |
| `/api/revalidate` route | `app/api/revalidate/route.ts` | On-demand invalidation via webhook/cron |
| Docs update | `docs/BUFFET_PAGE_CACHE_STRATEGY.md` | Document route config and revalidation |

## Route Config

```ts
// app/chinese-buffets/[city-state]/[slug]/page.tsx
export const revalidate = 86400; // 24 hours
```

- **No `generateStaticParams`** – We do not prebuild all buffet paths (too many). Pages are generated on first request.
- **No `dynamic = 'force-dynamic'`** – Not needed; we want caching.
- **Fetch calls** – InstantDB uses its own client; we rely on page-level ISR. The `unstable_cache` in `buffet-page-transforms` already caches CPU transforms.

## On-Demand Revalidation

When buffet data changes in the DB, call:

```bash
POST /api/revalidate?secret=$REVALIDATE_SECRET&buffet=salem-or/golden-dragon
```

This invalidates:
- Page HTML cache (`revalidatePath`)
- Transform cache (`revalidateTag`)

Set `REVALIDATE_SECRET` in your environment. Use this from:
- Webhook when InstantDB data is updated
- Cron job
- Manual script after bulk updates

## Behavior

| Request | Behavior |
|---------|----------|
| First request for `/chinese-buffets/salem-or/golden-dragon` | Generates page, caches HTML |
| Subsequent requests (within 24h) | Serves cached HTML, no DB hit |
| After 24h, next request | Serves stale cache, triggers background revalidation |
| After revalidation | New HTML cached for next 24h |
| On-demand revalidate | Immediately invalidates; next request regenerates |
