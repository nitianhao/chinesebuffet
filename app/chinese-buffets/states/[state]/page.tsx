import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getStateCitiesRollup, getCityBuffetsRollup, STATE_ABBR_TO_NAME } from '@/lib/rollups';
import SiteShell from '@/components/layout/SiteShell';
import { withTimeout } from '@/lib/async-utils';
import { getSiteUrl } from '@/lib/site-url';
import JsonLd from '@/components/seo/JsonLd';

const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 12 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 43200;
// Force all fetch() calls (including InstantDB SDK) to use cache, preventing
// the SDK's default no-store from making the page dynamic.
export const fetchCache = 'force-cache';

const ROLLUP_TIMEOUT_MS = isDev ? 12000 : 8000;

// generateStaticParams enables ISR for dynamic [state] segments.
// We pre-render all known state abbreviations; unknown ones fall through
// to on-demand ISR thanks to dynamicParams defaulting to true.
export async function generateStaticParams() {
  return Object.keys(STATE_ABBR_TO_NAME).map((abbr) => ({
    state: abbr.toLowerCase(),
  }));
}

const getStateCitiesCached = unstable_cache(
  async (stateAbbr: string) => getStateCitiesRollup(stateAbbr),
  ['state-cities-rollup'],
  { revalidate }
);

const getCityBuffetsCached = unstable_cache(
  async (citySlug: string) => getCityBuffetsRollup(citySlug),
  ['city-buffets-rollup'],
  { revalidate }
);

interface StatePageProps {
  params: {
    state: string;
  };
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateAbbr = params.state.toUpperCase();
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];

  const statePath = `/chinese-buffets/states/${params.state.toLowerCase()}`;
  if (!stateName) {
    return {
      title: 'State Not Found',
      robots: { index: false, follow: true },
      alternates: { canonical: `${BASE_URL}${statePath}` },
    };
  }

  const { result, timedOut } = await withTimeout(
    'state-rollup-metadata',
    () => getStateCitiesCached(stateAbbr),
    { data: null },
    ROLLUP_TIMEOUT_MS
  );
  const { data } = result;
  if (timedOut) {
    return {
      title: `Chinese Buffets in ${stateName}`,
      description: `Find Chinese buffets across ${stateName}.`,
      alternates: {
        canonical: `${BASE_URL}/chinese-buffets/states/${params.state.toLowerCase()}`,
      },
      robots: { index: true, follow: true },
    };
  }

  if (!data || data.cities.length === 0) {
    return {
      title: `Chinese Buffets in ${stateName}`,
      description: `Find Chinese buffets in ${stateName}.`,
      robots: { index: false, follow: true },
      alternates: { canonical: `${BASE_URL}${statePath}` },
    };
  }

  return {
    title: `Chinese Buffets in ${stateName} - ${data.buffetCount} Locations`,
    description: `Find ${data.buffetCount} Chinese buffets across ${data.cityCount} cities in ${stateName}. Compare hours, prices, ratings, and locations.`,
    alternates: {
      canonical: `${BASE_URL}${statePath}`,
    },
    robots: { index: true, follow: true },
  };
}

export default async function StatePage({ params }: StatePageProps) {
  const stateAbbr = params.state.toUpperCase();
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];

  // If invalid state abbreviation, 404
  if (!stateName) {
    notFound();
  }

  const { result, timedOut } = await withTimeout(
    'state-rollup-page',
    () => getStateCitiesCached(stateAbbr),
    { data: null },
    ROLLUP_TIMEOUT_MS
  );
  const { data } = result;
  if (timedOut) {
    return <StatePageSkeleton stateName={stateName} />;
  }

  // If no rollup data, 404
  if (!data || data.cities.length === 0) {
    notFound();
  }

  const { cities, buffetCount, cityCount } = data;

  // Get top city for stats and for "Top buffets" cross-links
  const topCity = cities[0];
  let topBuffetsInState: Array<{ name: string; slug: string; citySlug: string }> = [];
  if (topCity) {
    const { data: cityData } = await getCityBuffetsCached(topCity.citySlug);
    if (cityData?.buffets?.length) {
      topBuffetsInState = cityData.buffets
        .filter((b) => (b.rating ?? 0) > 0)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 5)
        .map((b) => ({ name: b.name, slug: b.slug, citySlug: topCity.citySlug }));
    }
  }
  const popularCities = cities.slice(0, 10);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'States', item: `${BASE_URL}/chinese-buffets/states` },
      {
        '@type': 'ListItem',
        position: 3,
        name: stateName,
        item: `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}`,
      },
    ],
  };

  const statePageUrl = `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}`;
  const itemListItems = cities.slice(0, 50);
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${statePageUrl}#itemlist`,
    name: `Cities with Chinese Buffets in ${stateName}`,
    numberOfItems: itemListItems.length,
    itemListElement: itemListItems.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/chinese-buffets/${c.citySlug}`,
      name: c.cityName,
    })),
  };
  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: statePageUrl,
    name: `Chinese Buffets in ${stateName}`,
    mainEntity: { '@id': `${statePageUrl}#itemlist` },
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <JsonLd data={itemListSchema} />
      <JsonLd data={webPageSchema} />
      <header className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <nav className="text-sm text-[var(--muted)] mb-4">
          <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/chinese-buffets/states" className="hover:text-[var(--accent1)]">States</Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--text)]">{stateName}</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)] mb-2">
          Chinese Buffets in {stateName}
        </h1>
        <p className="text-base sm:text-lg text-[var(--muted)]">
          {buffetCount.toLocaleString()} locations across {cityCount} cities
        </p>
        <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-2xl">
          Start with the highest‑count cities below, or browse the full list to find the best
          all‑you‑can‑eat spots near you.
        </p>
      </header>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-4xl font-bold text-[var(--accent1)]">
              {buffetCount.toLocaleString()}
            </div>
            <div className="text-[var(--muted)] mt-2">Chinese Buffets</div>
          </div>
          <div>
            <div className="text-4xl font-bold text-[var(--accent1)]">
              {cityCount.toLocaleString()}
            </div>
            <div className="text-[var(--muted)] mt-2">Cities</div>
          </div>
          {topCity && (
            <div>
              <div className="text-4xl font-bold text-[var(--accent1)]">
                {topCity.buffetCount}
              </div>
              <div className="text-[var(--muted)] mt-2">in {topCity.cityName} (Top City)</div>
            </div>
          )}
        </div>
      </section>

      {/* Top buffets in state — server-rendered cross-links */}
      {topBuffetsInState.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Top buffets in {stateName}</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {topBuffetsInState.map((b) => (
              <li key={`${b.citySlug}-${b.slug}`}>
                <Link href={`/chinese-buffets/${b.citySlug}/${b.slug}`} className="text-sm text-[var(--accent1)] hover:underline">
                  {b.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Popular cities — server-rendered cross-links */}
      {popularCities.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Popular cities</h2>
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {popularCities.map((c) => (
              <li key={c.citySlug}>
                <Link href={`/chinese-buffets/${c.citySlug}`} className="text-sm text-[var(--accent1)] hover:underline">
                  {c.cityName} ({c.buffetCount})
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="prose max-w-none">
          <p className="text-[var(--text-secondary)] mb-4">
            Discover the best Chinese buffets across {stateName}. With {buffetCount.toLocaleString()} locations
            spanning {cityCount} cities, you're sure to find an all-you-can-eat Chinese buffet near you.
          </p>
          <p className="text-[var(--text-secondary)] mb-4">
            Whether you're looking for traditional Chinese cuisine, Mongolian grill, sushi, or American-Chinese
            favorites, our directory covers all the Chinese buffet restaurants in {stateName}.
          </p>
          <p className="text-[var(--text-secondary)]">
            Each listing includes hours, prices, ratings, reviews, and detailed location information to help you
            find the perfect Chinese buffet experience.
          </p>
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-2xl font-bold text-[var(--text)]">
            Cities with Chinese Buffets in {stateName}
          </h2>
          <span className="text-sm text-[var(--muted)]">
            Top cities first
          </span>
        </div>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-2xl">
          Jump into the busiest cities or explore smaller areas across the state.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {cities.map((city) => (
            <Link
              key={city.citySlug}
              href={`/chinese-buffets/${city.citySlug}`}
              className="bg-[var(--surface2)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)]">
                    {city.cityName}
                  </h3>
                  <p className="text-[var(--muted)] text-sm mt-1">
                    {city.buffetCount} {city.buffetCount === 1 ? 'buffet' : 'buffets'}
                    {city.neighborhoodCount > 0 && (
                      <span className="ml-1">
                        · {city.neighborhoodCount} {city.neighborhoodCount === 1 ? 'area' : 'areas'}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-[var(--accent1)]">→</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-4">FAQs</h2>
        <div className="space-y-3">
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              How many Chinese buffets are in {stateName}?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              We list {buffetCount.toLocaleString()} Chinese buffets across {cityCount.toLocaleString()} cities.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Which cities have the most options?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              The top cities section ranks the largest Chinese buffet hubs in {stateName}.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Do listings include hours and prices?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              Yes. Each listing shows hours, pricing when available, ratings, and directions.
            </p>
          </details>
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          ← Back to All States
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          Browse by City →
        </Link>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <p className="text-center text-sm text-[var(--muted)]">
          Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {stateName}
        </p>
      </section>
    </SiteShell>
  );
}

function StatePageSkeleton({ stateName }: { stateName: string }) {
  return (
    <SiteShell>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="h-6 w-32 rounded bg-[var(--surface2)]" />
        <div className="mt-4 h-8 w-3/4 rounded bg-[var(--surface2)]" />
        <div className="mt-3 h-4 w-1/2 rounded bg-[var(--surface2)]" />
        <div className="mt-4 text-sm text-[var(--muted)]">Loading {stateName} data…</div>
      </section>
      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 rounded-lg bg-[var(--surface2)]" />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
