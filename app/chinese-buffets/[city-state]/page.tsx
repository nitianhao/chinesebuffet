import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getCityBuffetsRollup, getStateCitiesRollup, CityBuffetRow, StateCityRow, POI_LABELS, CityPoiSummary } from '@/lib/rollups';
import CityFacetsLoader from '@/components/city/CityFacetsLoader';
import SiteShell from '@/components/layout/SiteShell';
import { withTimeout } from '@/lib/async-utils';
import CityBuffetList from '@/components/city/CityBuffetList';
import CityMoreBuffets from '@/components/city/CityMoreBuffets';
import { perfMark, perfMs, PERF_ENABLED } from '@/lib/perf';
import { getSiteUrl } from '@/lib/site-url';
import { JsonLdServer } from '@/components/seo/JsonLdServer';

const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev.
// IMPORTANT: This page must NOT access `searchParams` in the server component,
// otherwise Next.js treats it as dynamic and sends Cache-Control: no-store.
// All filter/sort logic is handled client-side by CityFilterBar + CityBuffetList.
export const revalidate = isDev ? 3600 : 21600;
// Force all fetch() calls (including InstantDB SDK) to use cache, preventing
// the SDK's default no-store from making the page dynamic.
export const fetchCache = 'force-cache';

const ROLLUP_TIMEOUT_MS = isDev ? 12000 : 8000;

// generateStaticParams enables ISR for dynamic [city-state] segments.
// Return empty array: pages are generated on-demand and cached via ISR.
export async function generateStaticParams() {
  return [];
}

/** How many cards to include in the initial server HTML */
const INITIAL_LIMIT = 12;

const getCityBuffetsCached = unstable_cache(
  async (citySlug: string) => getCityBuffetsRollup(citySlug),
  ['city-buffets-rollup'],
  { revalidate }
);

const getStateCitiesCached = unstable_cache(
  async (stateAbbr: string) => getStateCitiesRollup(stateAbbr),
  ['state-cities-rollup'],
  { revalidate }
);

interface CityPageProps {
  params: {
    'city-state': string;
  };
  // NOTE: searchParams intentionally NOT included — accessing it forces the
  // entire page to dynamic rendering with private/no-store headers.
  // Filtering is handled client-side by CityFilterBar + CityBuffetList.
}

// ---------------------------------------------------------------------------
// Slim card — server component, no client JS, minimal HTML per item
// ---------------------------------------------------------------------------
function BuffetCardSlim({ buffet, citySlug }: { buffet: CityBuffetRow; citySlug: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group">
      <Link
        href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F] focus-visible:ring-offset-2 rounded-sm"
      >
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)] line-clamp-1">
            {buffet.name}
          </h3>
          {buffet.rating != null && buffet.rating > 0 && (
            <span className="flex items-center gap-1 text-sm text-[var(--muted)] shrink-0 ml-2">
              ⭐ {buffet.rating.toFixed(1)}
            </span>
          )}
        </div>
        <p className="text-[var(--muted)] text-sm line-clamp-1 mb-2">{buffet.address}</p>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          {buffet.neighborhood && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">{buffet.neighborhood}</span>
          )}
          {buffet.price && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">{buffet.price}</span>
          )}
          {buffet.reviewsCount != null && buffet.reviewsCount > 0 && (
            <span className="bg-[var(--surface2)] px-2 py-0.5 rounded">
              {buffet.reviewsCount.toLocaleString()} reviews
            </span>
          )}
        </div>
      </Link>
    </div>
  );
}

function CityPageSkeleton() {
  return (
    <SiteShell>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-6 w-32 rounded bg-[var(--surface2)]" />
        <div className="mt-4 h-8 w-3/4 rounded bg-[var(--surface2)]" />
        <div className="mt-3 h-4 w-1/2 rounded bg-[var(--surface2)]" />
      </section>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg bg-[var(--surface2)]" />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const { result, timedOut } = await withTimeout(
    'city-rollup-metadata',
    () => getCityBuffetsCached(citySlug),
    { data: null },
    ROLLUP_TIMEOUT_MS
  );
  const { data } = result;
  const year = new Date().getFullYear();

  if (timedOut) {
    return {
      title: 'Chinese Buffets by City',
      description: 'Find Chinese buffets by city. Compare hours, prices, and ratings.',
      alternates: {
        canonical: `${BASE_URL}/chinese-buffets/${citySlug}`,
      },
      robots: { index: true, follow: true },
    };
  }

  // Invalid slug — no city exists in DB
  if (!data) {
    return {
      title: 'City Not Found',
      robots: { index: false, follow: true },
      alternates: { canonical: `${BASE_URL}/chinese-buffets/${citySlug}` },
    };
  }

  // Valid city but 0 buffets — noindex but allow crawlers to follow links
  if (data.buffets.length === 0) {
    return {
      title: `Chinese Buffets in ${data.cityName || citySlug}`,
      description: `No Chinese buffets currently listed in ${data.cityName || citySlug}.`,
      robots: { index: false, follow: true },
      alternates: {
        canonical: `${BASE_URL}/chinese-buffets/${citySlug}`,
      },
    };
  }

  const count = data.buffetCount;
  const cityName = data.cityName;
  const state = data.state;

  return {
    title: `${count} Best Chinese Buffets in ${cityName} (All-You-Can-Eat ${year})`,
    description: `${count} best all-you-can-eat Chinese buffets in ${cityName}, ${state}. Compare ratings, hours & prices. Updated ${year}.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}`,
    },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// Minimal shape passed to the client "Load more" component — only the fields
// the slim card actually renders.  This prevents serialising lat/lng/phone/
// website/imagesCount into the RSC payload.
// ---------------------------------------------------------------------------
type SlimBuffet = Pick<CityBuffetRow, 'id' | 'slug' | 'name' | 'address' | 'neighborhood' | 'rating' | 'reviewsCount' | 'price'>;

function toSlim(b: CityBuffetRow): SlimBuffet {
  return {
    id: b.id,
    slug: b.slug,
    name: b.name,
    address: b.address,
    neighborhood: b.neighborhood,
    rating: b.rating,
    reviewsCount: b.reviewsCount,
    price: b.price,
  };
}

export default async function CityPage({ params }: CityPageProps) {
  console.time("[city] total");
  const tTotal = perfMark();
  const citySlug = params['city-state'];

  // ---- 1. Data fetch — rollup only ----
  // Facets are loaded CLIENT-SIDE via /api/facets/city to avoid the 8s
  // InstantDB facet query blocking the initial HTML response.
  console.time("[city] getCityRollupCached");
  const tFetch = perfMark();
  const rollupOutcome = await withTimeout(
    'city-rollup',
    () => getCityBuffetsCached(citySlug),
    { data: null },
    ROLLUP_TIMEOUT_MS,
  );
  console.timeEnd("[city] getCityRollupCached");
  const fetchCityMs = perfMs(tFetch);

  const { data } = rollupOutcome.result;
  if (rollupOutcome.timedOut) {
    if (PERF_ENABLED) {
      console.log(`[perf][city-page] ${JSON.stringify({ route: citySlug, fetchCityMs, rollupsMs: rollupOutcome.durationMs, transformMs: 0, totalMs: perfMs(tTotal), outcome: 'timeout' })}`);
    }
    return <CityPageSkeleton />;
  }

  // If no rollup data, 404
  if (!data || data.buffets.length === 0) {
    if (PERF_ENABLED) {
      console.log(`[perf][city-page] ${JSON.stringify({ route: citySlug, fetchCityMs, rollupsMs: rollupOutcome.durationMs, transformMs: 0, totalMs: perfMs(tTotal), outcome: '404' })}`);
    }
    notFound();
  }

  // ---- 2. State rollup for cross-links (other cities, nearby) ----
  const stateAbbr = data.stateAbbr;
  const stateRollup = await getStateCitiesCached(stateAbbr);
  const stateCities = stateRollup?.data?.cities ?? [];
  const otherCitiesInState: StateCityRow[] = stateCities
    .filter((c) => c.citySlug !== citySlug)
    .slice(0, 10);

  // Nearby cities: geo-sorted by distance from current city centroid (from buffet coords)
  type CityLink = { citySlug: string; cityName: string };
  let nearbyCities: CityLink[] = [];
  const withCoords = data.buffets.filter((b) => b.lat != null && b.lng != null && (b.lat !== 0 || b.lng !== 0));
  if (withCoords.length > 0 && otherCitiesInState.length > 0) {
    const centerLat = withCoords.reduce((s, b) => s + b.lat, 0) / withCoords.length;
    const centerLng = withCoords.reduce((s, b) => s + b.lng, 0) / withCoords.length;
    const otherForNearby = otherCitiesInState.slice(0, 8);
    const otherRollups = await Promise.all(
      otherForNearby.map((c) => getCityBuffetsCached(c.citySlug))
    );
    const withDistance = otherRollups
      .map((r, i) => {
        const city = otherForNearby[i];
        const buffets = r?.data?.buffets ?? [];
        const withB = buffets.filter((b) => b.lat != null && b.lng != null && (b.lat !== 0 || b.lng !== 0));
        if (withB.length === 0) return { city, dist: Infinity };
        const lat = withB.reduce((s, b) => s + b.lat, 0) / withB.length;
        const lng = withB.reduce((s, b) => s + b.lng, 0) / withB.length;
        const d = (lat - centerLat) ** 2 + (lng - centerLng) ** 2;
        return { city, dist: d };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
    nearbyCities = withDistance.map(({ city }) => ({ citySlug: city.citySlug, cityName: city.cityName }));
  }

  // ---- 3. Render prep (sorting, formatting, pagination) ----
  console.time("[city] buildText");
  const tPrep = perfMark();

  const { cityName, state, buffets, neighborhoods, buffetCount, cityPoiSummary } = data;

  // NOTE: No server-side filtering — filters are applied client-side by
  // CityBuffetList. The server always renders the unfiltered list. This is
  // critical for ISR caching: accessing searchParams would force dynamic rendering.

  console.log("[city] has cityPoiSummary?", Boolean(data?.cityPoiSummary));
  console.log("[city] cityPoiSummary sample", JSON.stringify(data?.cityPoiSummary?.topCategories?.slice(0, 3) ?? null));

  // Sort by rating for top rated section
  const topBuffets = [...buffets]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);

  // Calculate price range from all buffets (cheap)
  const prices = buffets
    .map(b => b.price)
    .filter(Boolean)
    .map(p => {
      const match = p?.match(/\$(\d+)/);
      return match ? parseInt(match[1]) : null;
    })
    .filter((p): p is number => p !== null);

  const priceRange = prices.length > 0
    ? `$${Math.min(...prices)}-$${Math.max(...prices)}`
    : 'Varies';

  // --- Pagination: only render INITIAL_LIMIT cards in HTML ----------------
  const initialBuffets = buffets.slice(0, INITIAL_LIMIT);
  const remainingBuffets = buffets.slice(INITIAL_LIMIT);
  const hasMore = remainingBuffets.length > 0;

  const transformMs = perfMs(tPrep);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: state, item: `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}` },
      { '@type': 'ListItem', position: 3, name: cityName, item: `${BASE_URL}/chinese-buffets/${citySlug}` },
    ],
  };



  const cityPageUrl = `${BASE_URL}/chinese-buffets/${citySlug}`;
  const itemListItems = buffets.slice(0, 50);
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${cityPageUrl}#itemlist`,
    name: `Chinese Buffets in ${cityName}, ${state}`,
    numberOfItems: itemListItems.length,
    itemListElement: itemListItems.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/chinese-buffets/${citySlug}/${b.slug}`,
      name: b.name,
    })),
  };
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: cityPageUrl,
    name: `Chinese Buffets in ${cityName}, ${state}`,
    mainEntity: { '@id': `${cityPageUrl}#itemlist` },
  };

  console.timeEnd("[city] buildText");
  console.timeEnd("[city] total");

  if (PERF_ENABLED) {
    console.log(`[perf][city-page] ${JSON.stringify({
      route: citySlug,
      fetchCityMs,
      rollupsMs: rollupOutcome.durationMs,
      transformMs,
      totalMs: perfMs(tTotal),
      buffets: buffetCount,
      initial: initialBuffets.length,
    })}`);
  }

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_START:itemlist -->' }} />
      <JsonLdServer data={itemListSchema} />
      <div style={{ display: 'none' }} aria-hidden suppressHydrationWarning dangerouslySetInnerHTML={{ __html: '<!-- JSONLD_END:itemlist -->' }} />
      <JsonLdServer data={webPageSchema} />
      <div className="space-y-4">
        <header className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <Link
              href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
              className="hover:text-[var(--accent1)]"
            >
              {state}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">{cityName}</span>
          </nav>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets in {cityName}, {state}
          </h1>

          <p className="text-base sm:text-lg text-[var(--muted)]">
            {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} found
          </p>
          <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-2xl">
            Compare ratings, prices, and neighborhoods in {cityName}.{' '}
            <Link href={`/chinese-buffets/${citySlug}/neighborhoods`} className="text-[var(--accent1)] hover:underline">
              Browse neighborhoods
            </Link>{' '}
            to narrow down your search.
          </p>
        </header>

        {/* Curated filter pages — server-rendered links */}
        {buffetCount >= 5 && (
          <nav
            aria-label="Popular searches"
            className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]"
          >
            <span className="text-sm font-medium text-[var(--text)] mr-3">Popular:</span>
            <Link href={`/chinese-buffets/${citySlug}/best`} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors mr-2 mb-2">Best</Link>
            <Link href={`/chinese-buffets/${citySlug}/top-rated`} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors mr-2 mb-2">Top Rated</Link>
            <Link href={`/chinese-buffets/${citySlug}/cheap`} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors mr-2 mb-2">Cheap</Link>
            <Link href={`/chinese-buffets/${citySlug}/open-now`} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface2)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors mr-2 mb-2">Open Now</Link>
          </nav>
        )}

        {/* Facets load client-side — shows skeleton, then real filter bar */}
        <CityFacetsLoader cityState={citySlug} totalBuffets={buffetCount} />
      </div>

      {/* Key stats — lightweight */}
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-[var(--muted)] mb-1">Total Buffets</div>
            <div className="text-2xl font-bold text-[var(--accent1)]">{buffetCount}</div>
          </div>
          {topBuffets.length > 0 && topBuffets[0]?.rating && (
            <div>
              <div className="text-sm text-[var(--muted)] mb-1">Top Rated</div>
              <div className="text-lg font-semibold text-[var(--text)] line-clamp-1">{topBuffets[0].name}</div>
              <div className="text-sm text-[var(--muted)]">⭐ {topBuffets[0].rating.toFixed(1)}</div>
            </div>
          )}
          <div>
            <div className="text-sm text-[var(--muted)] mb-1">Price Range</div>
            <div className="text-lg font-semibold text-[var(--text)]">{priceRange}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-xl font-bold text-[var(--text)] mb-2">City guide</h2>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          {buffetCount > 2 ? (
            <>
              {cityName} has {buffetCount} Chinese {buffetCount === 1 ? 'buffet' : 'buffets'} listed.
              {topBuffets.length > 0 && topBuffets[0].rating && topBuffets[0].reviewsCount && (
                <> The top-rated option is <Link href={`/chinese-buffets/${citySlug}/${topBuffets[0].slug}`} className="text-[var(--accent1)] hover:underline">{topBuffets[0].name}</Link>, satisfying diners with a {topBuffets[0].rating.toFixed(1)}★ rating from {topBuffets[0].reviewsCount} reviews.</>
              )}
              {cityPoiSummary && cityPoiSummary.topCategories && cityPoiSummary.topCategories.length >= 2 && (
                <> Buffets here are most often near {POI_LABELS[cityPoiSummary.topCategories[0].name] || cityPoiSummary.topCategories[0].name.replace(/([A-Z])/g, ' $1').trim()} and {POI_LABELS[cityPoiSummary.topCategories[1].name] || cityPoiSummary.topCategories[1].name.replace(/([A-Z])/g, ' $1').trim()}.</>
              )}
              {neighborhoods.length > 0 && (
                <> You can also browse options across specific neighborhoods like {neighborhoods[0].neighborhood}.</>
              )}
            </>
          ) : (
            <>
              Options are limited in {cityName} right now, with {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} listed.
              {topBuffets.length > 0 && topBuffets[0].rating && topBuffets[0].reviewsCount && (
                <> The main option is <Link href={`/chinese-buffets/${citySlug}/${topBuffets[0].slug}`} className="text-[var(--accent1)] hover:underline">{topBuffets[0].name}</Link>, rated {topBuffets[0].rating.toFixed(1)}★ ({topBuffets[0].reviewsCount} reviews).</>
              )}
              {nearbyCities.length > 0 && (
                <> For more choices, check nearby cities like {nearbyCities.slice(0, 3).map((nc, idx, arr) => (
                  <span key={nc.citySlug}>
                    <Link href={`/chinese-buffets/${nc.citySlug}`} className="text-[var(--accent1)] hover:underline">{nc.cityName}</Link>
                    {idx < arr.length - 1 ? ', ' : '.'}
                  </span>
                ))}</>
              )}
              {neighborhoods.length > 0 && (
                <> You can also browse options in neighborhoods like {neighborhoods[0].neighborhood}.</>
              )}
            </>
          )}
        </p>
      </section>

      {/* City POI Summary - Places around buffets */}
      {cityPoiSummary && cityPoiSummary.topCategories && cityPoiSummary.topCategories.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-xl font-bold text-[var(--text)] mb-2">
            Most common nearby place types
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Buffets in {cityName} are most commonly located near the following types of places:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-2">
            {cityPoiSummary.topCategories.slice(0, 6).map((cat) => (
              <div key={cat.name} className="flex justify-between items-center text-sm py-1 border-b border-[var(--border)] last:border-0 sm:last:border-b sm:nth-last-2:border-0">
                <span className="font-medium text-[var(--text)]">
                  {POI_LABELS[cat.name] || cat.name}
                </span>
                <span className="text-[var(--muted)] font-mono text-xs tabular-nums">
                  <span className="font-semibold text-[var(--text)]">{cat.countTotal}</span>
                  <span className="text-[var(--text-secondary)] ml-1 opacity-70">
                    ({cat.buffetsWith} buffets)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Neighborhoods — kept lightweight, max 6 links */}
      {neighborhoods.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-xl font-bold text-[var(--text)] mb-4">
            By Neighborhood
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {neighborhoods.slice(0, 6).map((neighborhood) => (
              <Link
                key={neighborhood.slug}
                href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
                className="border border-[var(--border)] rounded-lg p-3 hover:shadow-md transition-shadow bg-[var(--surface2)] hover:border-[var(--accent1)] group"
              >
                <h3 className="font-semibold text-sm text-[var(--text)] group-hover:text-[var(--accent1)]">
                  {neighborhood.neighborhood}
                </h3>
                <p className="text-[var(--muted)] text-xs">
                  {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
                </p>
              </Link>
            ))}
          </div>
          {neighborhoods.length > 6 && (
            <div className="mt-3">
              <Link
                href={`/chinese-buffets/${citySlug}/neighborhoods`}
                className="text-[var(--accent1)] hover:opacity-80 font-medium text-sm"
              >
                View all {neighborhoods.length} neighborhoods →
              </Link>
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* Buffet list — initial cards server-rendered, rest via "Load more" */}
      {/* ================================================================= */}
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-[var(--text)]">
            All Chinese Buffets in {cityName}
          </h2>
          <span className="text-sm text-[var(--muted)]">
            {buffetCount} {buffetCount === 1 ? 'location' : 'locations'}
          </span>
        </div>

        {/* Server-rendered initial batch */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialBuffets.map((buffet) => (
            <BuffetCardSlim key={buffet.id} buffet={buffet} citySlug={citySlug} />
          ))}
        </div>

        {/* Client component handles "Load more" for the rest */}
        {hasMore && (
          <CityBuffetList
            remaining={remainingBuffets.map(toSlim)}
            citySlug={citySlug}
            totalCount={buffetCount}
            initialCount={initialBuffets.length}
          />
        )}
      </section>

      {/* SEO internal links — collapsed by default to avoid link spam */}
      {hasMore && (
        <CityMoreBuffets
          buffets={remainingBuffets.map((b) => ({ id: b.id, slug: b.slug, name: b.name }))}
          cityName={cityName}
          citySlug={citySlug}
        />
      )}

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-4">FAQs</h2>
        <div className="space-y-3">
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)] open:bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              How many Chinese buffets are in {cityName}?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              We found {buffetCount} Chinese {buffetCount === 1 ? 'buffet' : 'buffets'} in {cityName}.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)] open:bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              What’s the highest-rated Chinese buffet in {cityName}?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              {topBuffets.length > 0 ? (
                <>Top-rated is {topBuffets[0].name} with {topBuffets[0].rating ? `${topBuffets[0].rating} stars` : 'positive reviews'}.</>
              ) : (
                <>Ratings vary. Check individual listings for reviews and photos.</>
              )}
            </p>
          </details>
          {cityPoiSummary && cityPoiSummary.topCategories && cityPoiSummary.topCategories.length >= 2 && (
            <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)] open:bg-[var(--surface)]">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
                What areas around buffets are most common in {cityName}?
              </summary>
              <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
                Buffets are frequently located near {POI_LABELS[cityPoiSummary.topCategories[0].name] || cityPoiSummary.topCategories[0].name} ({cityPoiSummary.topCategories[0].countTotal} places) and {POI_LABELS[cityPoiSummary.topCategories[1].name] || cityPoiSummary.topCategories[1].name} ({cityPoiSummary.topCategories[1].countTotal} places).
              </p>
            </details>
          )}
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)] open:bg-[var(--surface)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Where can I find more options near {cityName}?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              {nearbyCities.length > 0 ? (
                <>Check out options in {nearbyCities.slice(0, 3).map((nc, i, arr) => (
                  <span key={nc.citySlug}>
                    {nc.cityName}{i < arr.length - 1 ? (i === arr.length - 2 ? ' or ' : ', ') : ''}
                  </span>
                ))}, or see the full list of nearby cities below.</>
              ) : (
                <>Check out the Nearby cities section below for more buffet options in the surrounding area.</>
              )}
            </p>
          </details>
        </div>
      </section>

      {/* Other cities in state — server-rendered cross-links */}
      {otherCitiesInState.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Other cities in {state}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {otherCitiesInState.map((c) => (
              <li key={c.citySlug}>
                <Link href={`/chinese-buffets/${c.citySlug}`} className="text-sm text-[var(--accent1)] hover:underline">
                  {c.cityName} ({c.buffetCount})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Nearby cities — geo-sorted, server-rendered */}
      {nearbyCities.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Nearby cities</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {nearbyCities.map((c) => (
              <li key={c.citySlug}>
                <Link href={`/chinese-buffets/${c.citySlug}`} className="text-sm text-[var(--accent1)] hover:underline">
                  {c.cityName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <Link
          href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
          className="text-[var(--accent1)] hover:opacity-80 font-medium"
        >
          ← Back to {state}
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          Browse All Cities →
        </Link>
      </section>
    </SiteShell>
  );
}
