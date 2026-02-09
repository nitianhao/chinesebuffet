# Page Speed Baseline Runbook

## Required Environment

- Node.js: 18+ (20 LTS recommended)
- OS: macOS 14 (darwin 23.x) or Linux (use the same OS for comparisons)

## Commands

Run in this order:

1) `rm -rf .next`
2) `npm ci` (only if `node_modules` differs from `package-lock.json`; otherwise skip)
3) `npm run build`
4) `npm run start`

### Performance budget modes

The build runs bundle-size and Lighthouse checks after `next build`.

| Mode | Command | Behaviour |
| --- | --- | --- |
| **Warn only** (default) | `npm run build` | Prints the full report; build exits 0 even if budgets are exceeded. |
| **Strict** (CI) | `PERF_BUDGET_STRICT=1 npm run build` | Prints the full report **and** fails the build (exit 1) if any budget is exceeded. |
| **Skip checks** | `npm run build:skip-budgets` | Runs `next build` only, no budget checks at all. |

For local baseline measurements use the default (warn-only) mode so the build
always succeeds and you can start the production server.

## Deep Performance Snapshot (`perf:snapshot:deep`)

The deep snapshot script measures **cold** and **warm** performance for every
route in `scripts/perf-routes.json`. It uses only built-in Node.js modules (no
Lighthouse, no Puppeteer) and is designed for fast, repeatable server-side
timing.

### How to run

```bash
# 1. Build & start the production server
npm run build
npm run start            # runs on port 3000 by default

# 2. In a second terminal, run the deep snapshot
npm run perf:snapshot:deep

# Or point at a deployed URL
BASE_URL=https://staging.example.com npm run perf:snapshot:deep
```

When run in an interactive terminal the script will pause and ask you to restart
the server before the cold run. This gives you true cold-start numbers (empty
server-side caches). Press Enter to continue.

### What it measures

| Metric | Description |
| --- | --- |
| **Cold ms** | Total response time for the first request after server restart. |
| **Warm med ms** | Median total response time over 5 back-to-back requests. |
| **Warm p95 ms** | 95th-percentile total response time over 5 requests. |
| **TTFB med ms** | Median time-to-first-byte (warm). |
| **HTML KB** | Response body size in kilobytes. |
| **cache-control** | Value of the `Cache-Control` header. |
| **x-nextjs-cache** | Next.js ISR cache status (`HIT`, `MISS`, `STALE`). |
| **server-timing** | `Server-Timing` header if present (custom timings). |

### How to interpret

- **Cold ≫ Warm:** Expected. The first request populates Next.js SSR caches,
  data-fetching caches, and possibly ISR page caches.
- **Warm p95 ≫ Warm median:** Indicates outlier spikes — could be GC pauses or
  upstream data-fetch latency. Investigate with `server-timing`.
- **x-nextjs-cache = HIT:** Page is served from the ISR cache. Miss/Stale means
  the page was regenerated during the request.
- **HTML KB growing:** Watch for regressions — a big jump may mean you're
  inlining too much data or the page gained unneeded sections.

### Editing routes

Routes live in `scripts/perf-routes.json`. Add or remove entries as needed. Keep
at least one route per page type (homepage, state, city, neighborhood, detail,
search, POI).

### Output

The script prints a markdown table to stdout and saves structured JSON to
`perf-snapshot-deep-results.json` (git-ignored) for CI diffing.

---

## Cold Run vs Warm Run

- **Cold run:** first request after a fresh server start and empty `.next` build cache.
- **Warm run:** subsequent request in the same server process after the cold request has completed.

## Baseline Table Template

Replace the example slugs if needed, but keep the same route types.

| Route | TTFB (ms) | LCP (s) | CLS | Total JS transferred (KB) | Total image transferred (KB) | Number of requests | HTML size (KB) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | | | | | | | | |
| `/chinese-buffets/states/ny` | | | | | | | | |
| `/chinese-buffets/los-angeles-ca` | | | | | | | | |
| `/chinese-buffets/los-angeles-ca/neighborhoods/downtown` | | | | | | | | |
| `/chinese-buffets/los-angeles-ca/china-buffet` | | | | | | | | |
