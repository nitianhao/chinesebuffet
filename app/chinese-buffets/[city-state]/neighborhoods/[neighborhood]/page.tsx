import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import {
  getNeighborhoodBuffetsRollup,
  getCityNeighborhoodsRollup,
  getStateCitiesRollup,
} from '@/lib/rollups';
import TopRatedBuffetCard from '@/components/homepage/TopRatedBuffetCard';
import SiteShell from '@/components/layout/SiteShell';
import { muted } from '@/lib/layout-utils';
import { withTimeout } from '@/lib/async-utils';
import { getSiteUrl, getCanonicalUrl } from '@/lib/site-url';
import JsonLd from '@/components/seo/JsonLd';

const BASE_URL = getSiteUrl();
// ISR: Revalidate every 12 hours
export const revalidate = 43200;
// Force all fetch() calls (including InstantDB SDK) to use cache, preventing
// the SDK's default no-store from making the page dynamic.
export const fetchCache = 'force-cache';

const ROLLUP_TIMEOUT_MS = process.env.NODE_ENV !== 'production' ? 12000 : 8000;

// generateStaticParams enables ISR for dynamic [neighborhood] segments.
// Return empty array: pages are generated on-demand and cached via ISR.
export async function generateStaticParams() {
  return [];
}

const getNeighborhoodRollupCached = unstable_cache(
  async (citySlug: string, neighborhoodSlug: string) =>
    getNeighborhoodBuffetsRollup(citySlug, neighborhoodSlug),
  ['neighborhood-rollup'],
  { revalidate }
);

const getCityNeighborhoodsCached = unstable_cache(
  async (citySlug: string) => getCityNeighborhoodsRollup(citySlug),
  ['city-neighborhoods-rollup'],
  { revalidate }
);

const getStateCitiesCached = unstable_cache(
  async (stateAbbr: string) => getStateCitiesRollup(stateAbbr),
  ['state-cities-rollup'],
  { revalidate }
);

interface NeighborhoodPageProps {
  params: {
    'city-state': string;
    neighborhood: string;
  };
  // NOTE: searchParams intentionally NOT included — accessing it forces the
  // entire page to dynamic rendering with private/no-store headers.
  // Search, sort, and pagination are handled by the HTML form (full page
  // navigation) or can be moved to client components in the future.
}

export async function generateMetadata({ params }: NeighborhoodPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const neighborhoodSlug = params.neighborhood;
  const pathname = `/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`;
  const canonical = getCanonicalUrl(pathname);

  const { data } = await getNeighborhoodRollupCached(citySlug, neighborhoodSlug);

  // No data: invalid neighborhood — noindex, follow (never nofollow)
  if (!data) {
    const robots = { index: false as const, follow: true as const };
    if (process.env.NODE_ENV === 'development') {
      console.log('[seo] neighborhood robots decided:', robots, '(no data)');
    }
    return {
      title: 'Neighborhood Not Found',
      robots,
      alternates: { canonical },
    };
  }

  const hasBuffets = (data.buffetCount ?? 0) > 0 || (data.buffets?.length ?? 0) > 0;
  const year = new Date().getFullYear();

  // Page-level robots are authoritative (no tier override)
  const robots = hasBuffets
    ? ({ index: true as const, follow: true as const } as const)
    : ({ index: false as const, follow: true as const } as const);
  if (process.env.NODE_ENV === 'development') {
    console.log('[seo] neighborhood robots decided:', robots, hasBuffets ? '(has buffets)' : '(empty)');
  }

  if (!hasBuffets) {
    return {
      title: `Chinese Buffets in ${data.neighborhoodName || neighborhoodSlug}`,
      description: `No Chinese buffets currently listed in ${data.neighborhoodName || neighborhoodSlug}.`,
      robots,
      alternates: { canonical },
    };
  }

  const count = data.buffetCount ?? data.buffets.length;
  const neighborhoodName = data.neighborhoodName;
  const cityName = data.cityName;

  return {
    title: `Top ${count} Chinese Buffets in ${neighborhoodName}, ${cityName}`,
    description: `${count} top Chinese buffets in ${neighborhoodName}, ${cityName}. All-you-can-eat, ratings & hours. Updated ${year}.`,
    alternates: { canonical },
    robots,
  };
}

export default async function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const citySlug = params['city-state'];
  const neighborhoodSlug = params.neighborhood;

  // Server always renders the default (unfiltered, default-sorted) view.
  // Search, sort, and pagination would require reading searchParams which
  // forces dynamic rendering. Neighborhood pages typically have few buffets
  // so rendering all of them is acceptable for ISR caching.
  const query = '';
  const sort = '';
  const hasFilter = false;
  
  const [rollupOutcome, cityNeighborhoodsOutcome] = await Promise.all([
    withTimeout(
      'neighborhood-rollup',
      () => getNeighborhoodRollupCached(citySlug, neighborhoodSlug),
      { data: null, topRatedBuffets: [] },
      ROLLUP_TIMEOUT_MS
    ),
    withTimeout(
      'city-neighborhoods',
      () => getCityNeighborhoodsCached(citySlug),
      { data: null },
      ROLLUP_TIMEOUT_MS
    ),
  ]);
  const { data: rollupData, topRatedBuffets = [] } = rollupOutcome.result;
  if (rollupOutcome.timedOut) {
    return <NeighborhoodPageSkeleton />;
  }
  
  // If no rollup data, 404
  if (!rollupData || rollupData.buffets.length === 0) {
    notFound();
  }

  const { neighborhoodName, cityName, state, stateAbbr, buffets: rollupBuffets, buffetCount } = rollupData;
  const [{ data: cityNeighborhoodsData }, { data: stateCitiesData }] = await Promise.all([
    Promise.resolve(cityNeighborhoodsOutcome.result),
    withTimeout(
      'state-cities',
      () => getStateCitiesCached(stateAbbr),
      { data: null },
      ROLLUP_TIMEOUT_MS
    ).then((outcome) => outcome.result),
  ]);
  const nearbyNeighborhoods = (cityNeighborhoodsData?.neighborhoods || [])
    .filter((neighborhood) => neighborhood.slug !== neighborhoodSlug)
    .sort((a, b) => b.buffetCount - a.buffetCount)
    .slice(0, 10);
  const nearbyCities = (stateCitiesData?.cities || [])
    .filter((city) => city.citySlug !== citySlug)
    .sort((a, b) => b.buffetCount - a.buffetCount)
    .slice(0, 10);
  // Server renders all buffets (default sort by rating).
  // Neighborhoods typically have a small number of buffets so no pagination needed.
  const buffets = [...rollupBuffets].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const totalCount = buffetCount;
  
  // Sort by rating for top rated section
  const sortedByRating = [...buffets].sort((a, b) =>
    (b.rating || 0) - (a.rating || 0)
  );

  const topBuffets = topRatedBuffets.length > 0
    ? topRatedBuffets
    : sortedByRating.slice(0, 5);
  
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: state, item: `${BASE_URL}/chinese-buffets/states/${stateAbbr.toLowerCase()}` },
      { '@type': 'ListItem', position: 3, name: cityName, item: `${BASE_URL}/chinese-buffets/${citySlug}` },
      {
        '@type': 'ListItem',
        position: 4,
        name: 'Neighborhoods',
        item: `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods`,
      },
      {
        '@type': 'ListItem',
        position: 5,
        name: neighborhoodName,
        item: `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`,
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `How many Chinese buffets are in ${neighborhoodName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `There are ${buffetCount} Chinese buffets listed in ${neighborhoodName}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What are the best rated buffets here?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The top rated section highlights the highest-rated buffets in this neighborhood.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do listings include takeout or service options?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'When available, listings note service options like dine-in or takeout.',
        },
      },
    ],
  };

  const neighborhoodPageUrl = `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`;
  const itemListItems = buffets.slice(0, 50);
  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': `${neighborhoodPageUrl}#itemlist`,
    name: `Chinese Buffets in ${neighborhoodName}, ${cityName}`,
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
    url: neighborhoodPageUrl,
    name: `Chinese Buffets in ${neighborhoodName}, ${cityName}`,
    mainEntity: { '@id': `${neighborhoodPageUrl}#itemlist` },
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <JsonLd data={itemListSchema} />
      <JsonLd data={webPageSchema} />
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
          <Link
            href={`/chinese-buffets/${citySlug}`}
            className="hover:text-[var(--accent1)]"
          >
            {cityName}
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/chinese-buffets/${citySlug}/neighborhoods`}
            className="hover:text-[var(--accent1)]"
          >
            Neighborhoods
          </Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--text)]">{neighborhoodName}</span>
        </nav>
        <div className="space-y-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)]">
              Chinese Buffets in {neighborhoodName}, {cityName}, {state}
            </h1>
            <p className={`${muted} mt-2`}>
              {totalCount.toLocaleString()} buffets
            </p>
          </div>
          <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
            Find Chinese buffet spots in {neighborhoodName} with ratings, reviews, and helpful details to plan your next meal.
          </p>
          {/* Search/sort form removed: it required searchParams which forces
              dynamic rendering. Buffets are listed sorted by rating. */}
        </div>
      </header>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <div>
            <div className="text-4xl font-bold text-[var(--accent1)]">
              {buffetCount.toLocaleString()}
            </div>
            <div className="text-[var(--muted)] mt-2">Chinese Buffets</div>
          </div>
          {topBuffets.length > 0 && topBuffets[0]?.rating && (
            <div>
              <div className="text-4xl font-bold text-[var(--accent1)]">
                {topBuffets[0].rating.toFixed(1)}
              </div>
              <div className="text-[var(--muted)] mt-2">Top Rated</div>
            </div>
          )}
          <div>
            <div className="text-4xl font-bold text-[var(--accent1)]">
              {neighborhoodName}
            </div>
            <div className="text-[var(--muted)] mt-2">Neighborhood</div>
          </div>
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="prose max-w-none">
          <p className="text-[var(--text-secondary)] mb-4">
            Discover the best Chinese buffets in {neighborhoodName}, {cityName}.
            With {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} in this neighborhood,
            you're sure to find an all-you-can-eat Chinese buffet nearby.
          </p>
          <p className="text-[var(--text-secondary)] mb-4">
            Whether you're looking for traditional Chinese cuisine, Mongolian grill, sushi, or
            American-Chinese favorites, our directory covers all the Chinese buffet restaurants
            in {neighborhoodName}.
          </p>
          <p className="text-[var(--text-secondary)]">
            Each listing includes hours, prices, ratings, reviews, and detailed location information
            to help you find the perfect Chinese buffet experience.
          </p>
        </div>
      </section>

      {topBuffets.length > 0 && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
            Top rated in this neighborhood
          </h2>
          <p className="text-[var(--muted)] mb-6">
            Highest-rated options based on customer reviews
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {topBuffets.map((buffet) => (
              <TopRatedBuffetCard
                key={buffet.id}
                buffet={{
                  name: buffet.name,
                  slug: buffet.slug,
                  city: cityName,
                  stateAbbr,
                  rating: buffet.rating ?? 0,
                  reviewCount: buffet.reviewsCount ?? 0,
                }}
                citySlug={citySlug}
                subtitle={`${neighborhoodName}, ${cityName}`}
              />
            ))}
          </div>
        </section>
      )}

      {false && hasFilter && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)] text-center">
          <svg className="w-12 h-12 mx-auto text-[var(--muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No buffets match your filters</h2>
          <p className="text-[var(--muted)] mb-4">Try adjusting your filters or clearing them to see more results.</p>
          <Link
            href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface2)] px-4 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Clear filters
          </Link>
          {topBuffets.length > 0 && (
            <div className="mt-6 text-left">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3">Popular alternatives</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {topBuffets.slice(0, 3).map((buffet) => (
                  <TopRatedBuffetCard
                    key={buffet.id}
                    buffet={{
                      name: buffet.name,
                      slug: buffet.slug,
                      city: cityName,
                      stateAbbr,
                      rating: buffet.rating ?? 0,
                      reviewCount: buffet.reviewsCount ?? 0,
                    }}
                    citySlug={citySlug}
                    subtitle={`${neighborhoodName}, ${cityName}`}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[var(--text)]">
            All Chinese Buffets in {neighborhoodName}
          </h2>
          <span className="text-sm text-[var(--muted)]">
            {totalCount} {totalCount === 1 ? 'location' : 'locations'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buffets.map((buffet) => (
            <div key={buffet.id} className="h-full">
              <TopRatedBuffetCard
                buffet={{
                  name: buffet.name,
                  slug: buffet.slug,
                  city: cityName,
                  stateAbbr,
                  rating: buffet.rating ?? 0,
                  reviewCount: buffet.reviewsCount ?? 0,
                }}
                citySlug={citySlug}
                subtitle={`${neighborhoodName}, ${cityName}`}
              />
            </div>
          ))}
        </div>
        {/* Pagination removed: rendering all buffets in ISR allows proper caching. */}
      </section>

      {(nearbyNeighborhoods.length > 0 || nearbyCities.length > 0) && (
        <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
          <div className="space-y-8">
            {nearbyNeighborhoods.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
                    Nearby neighborhoods
                  </h2>
                  <Link
                    href={`/chinese-buffets/${citySlug}/neighborhoods`}
                    className="text-sm font-medium text-[var(--accent1)] hover:underline"
                  >
                    More areas
                  </Link>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
                  {nearbyNeighborhoods.map((neighborhood) => (
                    <li key={neighborhood.slug} className="min-w-0">
                      <Link
                        href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
                        className="block min-h-[44px] text-sm text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                      >
                        <span className="block font-medium leading-tight line-clamp-2">
                          {neighborhood.neighborhood}
                        </span>
                        <span className="block text-[var(--text-secondary)]">
                          {neighborhood.buffetCount} buffets
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {nearbyCities.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between gap-4 mb-4">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
                    Nearby cities
                  </h2>
                  <Link
                    href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
                    className="text-sm font-medium text-[var(--accent1)] hover:underline"
                  >
                    More areas
                  </Link>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
                  {nearbyCities.map((city) => (
                    <li key={city.citySlug} className="min-w-0">
                      <Link
                        href={`/chinese-buffets/${city.citySlug}`}
                        className="block min-h-[44px] text-sm text-[var(--text)] hover:text-[var(--accent1)] hover:underline"
                      >
                        <span className="block font-medium leading-tight line-clamp-2">
                          {city.cityName}
                        </span>
                        <span className="block text-[var(--text-secondary)]">
                          {city.buffetCount} buffets
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-3xl">
          Chinese buffets in {neighborhoodName} give you a range of options for families, groups, and quick meals in
          {cityName}, {stateAbbr}. Each listing highlights ratings and reviews to help you compare quality and value
          at a glance. When available, we also note dine-in and takeout details so you can choose what works best for
          your visit. New places and updates are added regularly to keep the neighborhood directory fresh.
        </p>
        <div className="mt-4 space-y-3">
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              How many buffets are here?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              There are {buffetCount} Chinese buffets listed in {neighborhoodName}.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              What are the best rated?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              The top rated section above highlights the highest-rated buffets with strong review counts.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Do they offer takeout?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              Many locations offer takeout, and we list service options when they are available.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              How often is data updated?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)] leading-relaxed">
              We update the directory regularly and add new listings as they become available.
            </p>
          </details>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <Link
          href={`/chinese-buffets/${citySlug}`}
          className="text-[var(--accent1)] hover:opacity-80 font-medium"
        >
          ← Back to {cityName}
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link
          href={`/chinese-buffets/${citySlug}/neighborhoods`}
          className="text-[var(--accent1)] hover:opacity-80 font-medium"
        >
          View All Neighborhoods →
        </Link>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
        <p className="text-center text-sm text-[var(--muted)]">
          Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {neighborhoodName}, {cityName}
        </p>
      </section>
    </SiteShell>
  );
}

function NeighborhoodPageSkeleton() {
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
