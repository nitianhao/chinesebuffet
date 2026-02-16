# Vercel Cost Audit Report

**Date:** 2026-02-14
**Scope:** Entire Next.js Application (`app/`, `lib/`, `components/`)
**Objective:** Identify code patterns causing accidental dynamic rendering or excessive ISR writes.

## 🚨 Critical Findings (High Cost Impact)

These items force serverless function execution on *every* request, bypassing the Data Cache and CDN.

### 1. Dynamic Sitemaps Rebuilding on Every Request
**Files:**
- `app/sitemap-buffets.xml/route.ts` (Lines 8-9)
- `app/sitemap-cities.xml/route.ts` (Lines 12-13)

**Snippet:**
```typescript
export const dynamic = 'force-dynamic';
export const revalidate = 0;
```

**Why it increases cost:**
These sitemaps are generated on-demand for every single request from Googlebot/Bingbot. There is no caching. Sitemaps usually require heavy database queries (fetching all cities/buffets), consuming significant Function Duration and DB Reads.

**Recommended Fix:**
Switch to ISR by setting a revalidation period (e.g., 24 hours).
```typescript
// Remove: export const dynamic = 'force-dynamic';
export const revalidate = 86400; // 24 hours
```

### 2. Map API Uncached & Dynamic
**File:**
- `app/api/buffets/map/route.ts` (Line 5)

**Snippet:**
```typescript
export const dynamic = 'force-dynamic';

export async function GET() {
  // ...
  return NextResponse.json({ markers }); // No Cache-Control headers
}
```

**Why it increases cost:**
This API is called by the client map component. `force-dynamic` combined with `NextResponse.json` (without explicit headers) defaults to `Cache-Control: no-store`. Every time a user views the map, a serverless function spins up and querying the DB.

**Recommended Fix:**
Add `Cache-Control` headers for CDN caching or use `unstable_cache` for data caching.
```typescript
// Option A: Add CDN caching (simplest)
return NextResponse.json(
  { markers },
  { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
);
```

## ⚠️ Warnings (Potential Cost Optimizations)

These items are cached but have configurations that might be optimized further.

### 3. Search API Low TTL
**File:**
- `app/api/search/route.ts` (Lines 165, 184, 569)

**Snippet:**
```typescript
'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
```

**Observation:**
The search results are cached at the Edge for only **60 seconds**.
**Impact:** High-traffic search terms will trigger function execution frequently.
**Recommendation:** Increase `s-maxage` to 300 (5 mins) or 600 (10 mins) if near-real-time updates are not critical.

### 4. City Facets API (Standardized)
**File:**
- `app/api/facets/city/route.ts`

**Observation:**
Uses `export const dynamic = 'force-dynamic'` but correctly implements manual `Cache-Control` headers (`s-maxage=21600`).
**Status:** **Acceptable**. This pattern is valid for controlling Edge Caching manually. Bypassing static optimization is intentional here to allow the handler to set dynamic headers based on the response. The high `s-maxage` (6 hours) prevents cost leaks.

## ✅ Good Practices Identified

The following dangerous patterns were checked and found to be handled correctly:

- **InstantDB Default Caching:** `lib/data-instantdb.ts` correctly overrides the default `no-store` behavior of the InstantDB SDK by using `{ cache: 'force-cache' }` or wrapping calls in `unstable_cache`.
- **Page-Level caching:** City and Neighborhood pages correctly use `export const revalidate` and `export const fetchCache = 'force-cache'` to ensure they remain static/ISR.
- **Route Handlers:** API routes like `search-suggestions` correctly use `s-maxage` headers.

## Summary of Actions Required

1.  **[URGENT]** Remove `force-dynamic` and set `revalidate = 86400` in both `sitemap-*.xml/route.ts` files.
2.  **[URGENT]** Add `Cache-Control` headers to `app/api/buffets/map/route.ts`.
3.  **[OPTIONAL]** Increase cache TTL in `app/api/search/route.ts` to reduce search invocation costs.
