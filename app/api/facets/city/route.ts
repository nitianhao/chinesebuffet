import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getCityBuffetsRollup, getCityFacetsRollup, type CityBuffetRow } from '@/lib/rollups';
import { perfMark, perfMs, PERF_ENABLED } from '@/lib/perf';
import {
  parsePriceToBucket,
  bucketizeRating,
  bucketizeReviewCount,
} from '@/lib/facets/taxonomy';
import {
  createEmptyAggregatedFacets,
  MIN_NEIGHBORHOOD_COUNT,
  type AggregatedFacets,
} from '@/lib/facets/aggregateFacets';

// ---------------------------------------------------------------------------
// Route config
// ---------------------------------------------------------------------------
// force-dynamic: handler runs on every request (not pre-rendered at build).
// We set Cache-Control ourselves for CDN-level caching.
// Individual fetch() calls inside still use the data cache via force-cache.
export const dynamic = 'force-dynamic';

/** Revalidation interval for unstable_cache (6 hours). */
const REVALIDATE_S = 21600;

// ---------------------------------------------------------------------------
// In-process memory cache  (avoids even the unstable_cache lookup)
// ---------------------------------------------------------------------------

interface MemEntry {
  facets: AggregatedFacets;
  partial: boolean;
  ts: number;
}

const mem = new Map<string, MemEntry>();
const MEM_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Light facets — computed from already-cached rollup data (no facetIndex)
// ---------------------------------------------------------------------------

/**
 * Compute filter counts from the city-buffets rollup rows.
 *
 * Covers: price, rating, reviews, neighborhoods, totalBuffets.
 * Does NOT cover: amenities, nearby, dineOptions, standoutTags, buffetsWithHours
 * (those require the facetIndex blob — provided by the cityFacets rollup).
 *
 * This is pure computation — zero IO, microseconds for 200 buffets.
 */
function computeLightFacets(buffets: CityBuffetRow[]): AggregatedFacets {
  const result = createEmptyAggregatedFacets();
  const neighborhoodRaw: Record<string, number> = {};

  for (const b of buffets) {
    result.totalBuffets++;

    // Price
    const pb = parsePriceToBucket(b.price);
    result.priceCounts[pb]++;

    // Rating thresholds (cumulative: 4.7 → rating_45, rating_40, rating_35 all true)
    const rb = bucketizeRating(b.rating);
    if (rb.rating_45) result.ratingCounts.rating_45++;
    if (rb.rating_40) result.ratingCounts.rating_40++;
    if (rb.rating_35) result.ratingCounts.rating_35++;

    // Review-count thresholds
    const rv = bucketizeReviewCount(b.reviewsCount);
    if (rv.reviews_100) result.reviewCountCounts.reviews_100++;
    if (rv.reviews_500) result.reviewCountCounts.reviews_500++;
    if (rv.reviews_1000) result.reviewCountCounts.reviews_1000++;

    // Neighborhood
    if (b.neighborhood) {
      neighborhoodRaw[b.neighborhood] =
        (neighborhoodRaw[b.neighborhood] || 0) + 1;
    }
  }

  // Only keep neighborhoods with enough buffets
  for (const [n, c] of Object.entries(neighborhoodRaw)) {
    if (c >= MIN_NEIGHBORHOOD_COUNT) result.neighborhoodCounts[n] = c;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Cached data accessors  (cross-request persistence via unstable_cache)
// ---------------------------------------------------------------------------

/** Light facets: derived from the city-buffets rollup (always fast). */
const getLightFacetsCached = unstable_cache(
  async (cityState: string): Promise<AggregatedFacets> => {
    const { data } = await getCityBuffetsRollup(cityState);
    if (!data?.buffets?.length) return createEmptyAggregatedFacets();
    return computeLightFacets(data.buffets);
  },
  ['city-facets-light'],
  { revalidate: REVALIDATE_S },
);

/**
 * Full facets: read from the pre-aggregated cityFacets rollup.
 *
 * Previously this called getCityFacets() which queried InstantDB for
 * ALL buffet fields via cities→buffets (~21MB, 34s for LA).
 * Now it reads a single ~5KB rollup record instead.
 *
 * Generate rollups with: node scripts/rebuildRollups.js --city-facets-only
 */
const getFullFacetsCached = unstable_cache(
  async (cityState: string): Promise<AggregatedFacets | null> => {
    try {
      const { data } = await getCityFacetsRollup(cityState);
      return data;
    } catch {
      return null;
    }
  },
  ['city-facets-full-v2'],  // v2: switched from InstantDB query to rollup
  { revalidate: REVALIDATE_S },
);

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const t0 = perfMark();
  const cityState = request.nextUrl.searchParams.get('cityState');

  if (!cityState) {
    return NextResponse.json(
      { ok: false, facets: null, error: 'Missing cityState param' },
      { status: 400 },
    );
  }

  // ---- 1. In-process memory cache (instant) ----
  const cached = mem.get(cityState);
  if (cached && Date.now() - cached.ts < MEM_TTL_MS) {
    if (PERF_ENABLED) {
      console.log(
        `[perf][facets-api] ${JSON.stringify({ cityState, totalMs: perfMs(t0), source: 'mem', partial: cached.partial })}`,
      );
    }
    return respond(cached.facets, cached.partial);
  }

  // ---- 2. Try full facets from rollup ----
  //
  // The cityFacets rollup is a single ~5KB record containing pre-aggregated
  // AggregatedFacets. Generated by: node scripts/rebuildRollups.js --city-facets-only
  // If the rollup doesn't exist yet, falls back to light facets.
  let facets: AggregatedFacets | null = null;
  let partial = false;
  let source = 'full';

  try {
    facets = await getFullFacetsCached(cityState);
  } catch {
    facets = null;
  }

  const afterFullMs = perfMs(t0);

  // ---- 3. No rollup found → light facets (always fast) ----
  if (!facets) {
    const tLight = perfMark();
    facets = await getLightFacetsCached(cityState);
    partial = true;
    source = 'light';

    if (PERF_ENABLED) {
      console.log(
        `[perf][facets-api] light-fallback ${JSON.stringify({ cityState, lightMs: perfMs(tLight), afterFullMs })}`,
      );
    }
  }

  // ---- 4. Persist in memory cache ----
  mem.set(cityState, { facets, partial, ts: Date.now() });
  if (mem.size > 200) {
    const oldest = mem.keys().next().value;
    if (oldest) mem.delete(oldest);
  }

  const totalMs = perfMs(t0);

  if (PERF_ENABLED) {
    console.log(
      `[perf][facets-api] ${JSON.stringify({ cityState, totalMs, source, partial })}`,
    );
  }

  return respond(facets, partial);
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function respond(
  facets: AggregatedFacets,
  partial: boolean,
): NextResponse {
  // Shorter CDN cache for partial results so the CDN retries sooner.
  const cacheControl = partial
    ? 'public, s-maxage=300, stale-while-revalidate=60' // 5 min
    : 'public, s-maxage=21600, stale-while-revalidate=3600'; // 6 h

  return NextResponse.json(
    { ok: true, facets, partial },
    { status: 200, headers: { 'Cache-Control': cacheControl } },
  );
}
