# Homepage performance

## Checklist status

| Item | Status |
|------|--------|
| Server Component (no `"use client"`) | ✅ `app/page.tsx` has no `"use client"` |
| Data fetching cached & revalidated | ✅ `revalidate = 43200` on page; `getHomePageData` uses `unstable_cache(..., { revalidate: 43200 })` |
| No unnecessary heavy components | ✅ Only `Link`, inline HTML, no custom heavy UI |
| No images on homepage | ✅ No `<Image>` or `<img>` |
| No large client bundles from page | ✅ Page is static (○); only layout (Header) adds client JS |

## What was changed

- **Revalidate:** Set `export const revalidate = 43200` (12h) explicitly and added a short comment. Data is also cached via `unstable_cache` in `lib/homepage-data.ts` with the same 12h revalidate.
- No heavy components were removed (none were present). No images were added or removed. No new client deps.

## How to verify

### Build output (Next.js)

Run:

```bash
npx next build
```

In the route table, the homepage should appear as:

- **Route:** `┌ ○ /`
- **Symbol:** `○` = Static (prerendered as static content)
- **Size:** Small page chunk (~208 B); First Load JS is the shared bundle (layout + runtime).

So the homepage is **statically generated** at build time and revalidated every 12 hours (ISR).

### DevTools / runtime

1. **Server-rendered HTML:** View page source (right‑click → View Page Source). You should see full content (hero, stats, cities, states, top rated, FAQ) in the HTML, not a loading shell.
2. **Caching:** After the first load, subsequent requests within 12h can be served from the Next.js data cache (no refetch of `getHomePageData` until revalidate).
3. **Client JS:** In DevTools → Network, filter by JS. The page should not load a large page-specific bundle; the main chunk is the shared layout (Header, etc.).

### Bundle analysis (optional)

```bash
npx next build --profile
# or
ANALYZE=true npm run build   # if you have @next/bundle-analyzer
```

Confirm that the route `/` (or the chunk that contains the homepage) does not pull in InstantDB, MiniSearch, or other heavy libs in the **client** bundle. Those are only used in `getHomePageData` and related server code.

## Warnings to watch for

1. **Layout = Header:** The root layout imports `Header` (dynamic, `ssr: true`). Header is a client component and pulls in SearchBar, AddBuffetModal, etc. So **every page** (including the homepage) loads that shared header bundle (~96.8 kB First Load JS). That is expected; the homepage body itself does not add more client code.
2. **Adding client components to the page:** If you add a component that uses `"use client"` or import one that does, the homepage will ship that component’s JS. Prefer keeping the homepage 100% server-rendered (forms, links, `<details>`, etc.).
3. **Adding images:** If you add `<Image>` or `<img>` to the homepage, prefer small placeholders and `loading="lazy"` (or Next.js `priority={false}`) so the initial load stays light.
4. **Data cache:** `getHomePageData` uses `unstable_cache` with key `['homepage']`. Don’t change the cache key without a reason; changing it creates a new cache entry. Same for `revalidate`: keep it aligned (e.g. 43200) between the page and `getHomePageData`.
