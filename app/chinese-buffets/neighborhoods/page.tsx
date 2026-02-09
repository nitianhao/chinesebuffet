import { Metadata } from 'next';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { getCitiesRollup } from '@/lib/rollups';
import SiteShell from '@/components/layout/SiteShell';
import { withTimeout } from '@/lib/async-utils';
import { getSiteUrl, getCanonicalUrl } from '@/lib/site-url';

const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

const ROLLUP_TIMEOUT_MS = isDev ? 12000 : 8000;

const getCitiesCached = unstable_cache(
  async () => getCitiesRollup(),
  ['cities-rollup'],
  { revalidate }
);

export const metadata: Metadata = {
  title: 'Chinese Buffets by Neighborhood - Browse Local Areas',
  description: 'Browse Chinese buffets by neighborhood. Find all-you-can-eat Chinese restaurants in local areas across US cities with hours, prices, and reviews.',
  alternates: {
    canonical: getCanonicalUrl('/chinese-buffets/neighborhoods'),
  },
  robots: { index: true, follow: true },
};

function getBestFor(buffetCount: number) {
  if (buffetCount >= 50) return 'Best for variety';
  if (buffetCount >= 20) return 'Best for groups';
  return 'Best for quick picks';
}

function CityNeighborhoodCard({ city }: { city: { slug: string; city: string; state: string; buffetCount: number } }) {
  return (
    <Link
      href={`/chinese-buffets/${city.slug}/neighborhoods`}
      className="group flex min-h-[72px] items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all hover:border-[var(--accent1)] hover:shadow-md"
    >
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface2)]">
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-[var(--muted)]">
          {city.city.slice(0, 1)}
          {city.state.slice(0, 1)}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--text)] line-clamp-2">
            {city.city}, {city.state}
          </h3>
          <span className="text-xs text-[var(--muted)]">{city.buffetCount} buffets</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span>{getBestFor(city.buffetCount)}</span>
        </div>
      </div>
      <span className="text-[var(--muted)]">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </span>
    </Link>
  );
}

// NOTE: searchParams intentionally NOT accepted — accessing it forces dynamic
// rendering with private/no-store headers. Only 50 cities shown, no pagination needed.
export default async function NeighborhoodsIndexPage() {
  const { result, timedOut } = await withTimeout(
    'cities-rollup',
    () => getCitiesCached(),
    { cities: [] },
    ROLLUP_TIMEOUT_MS
  );
  if (timedOut) {
    return <NeighborhoodsIndexSkeleton />;
  }
  const { cities } = result;
  
  // Get cities that have neighborhoods, sorted by buffet count
  const citiesWithNeighborhoods = cities
    .filter(c => c.buffetCount >= 3) // Only cities with enough buffets likely have neighborhood data
    .slice(0, 50); // Top 50 cities

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Neighborhoods', item: `${BASE_URL}/chinese-buffets/neighborhoods` },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How do I browse neighborhoods?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Select a city to view its neighborhoods and buffet listings.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which cities have the most neighborhood data?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The list prioritizes cities with higher buffet counts where neighborhood data is available.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do neighborhood pages include reviews and prices?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. Neighborhood pages include ratings, reviews, and pricing when available.',
        },
      },
    ],
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
      <header className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <nav className="text-sm text-[var(--muted)] mb-4">
          <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-[var(--text)]">Neighborhoods</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text)] mb-2">
          Chinese Buffets by Neighborhood
        </h1>
        <p className="text-base sm:text-lg text-[var(--muted)]">
          Browse local areas in {cities.length} cities
        </p>
      </header>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <p className="text-[var(--text-secondary)] max-w-3xl">
          Find Chinese buffets in specific neighborhoods across the United States.
          Select a city below to explore buffets in local areas, complete with
          hours, pricing, ratings, and customer reviews.
        </p>
        <p className="mt-3 text-sm text-[var(--text-secondary)] max-w-2xl">
          Start with the highest‑count cities for the widest selection, then drill down by neighborhood.
        </p>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
          Browse Neighborhoods by City
        </h2>
        {citiesWithNeighborhoods.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[var(--muted)]">No cities with neighborhood data found.</p>
            <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 mt-4 inline-block">
              Browse All Cities →
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {citiesWithNeighborhoods.map((city) => (
                <CityNeighborhoodCard key={city.slug} city={city} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <h2 className="text-2xl font-bold text-[var(--text)] mb-4">FAQs</h2>
        <div className="space-y-3">
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              How do I browse neighborhoods?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              Pick a city to view its neighborhood listings and buffet counts.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Which cities have the most options?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              The list is ordered to surface cities with higher buffet counts first.
            </p>
          </details>
          <details className="rounded-md border border-[var(--border)] bg-[var(--surface2)]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--text)]">
              Do neighborhood pages include reviews and prices?
            </summary>
            <p className="px-4 pb-4 text-sm text-[var(--text-secondary)]">
              Yes, when available. Each listing includes ratings and pricing details.
            </p>
          </details>
        </div>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <Link href="/" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          ← Back to Home
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          Browse by City →
        </Link>
        <span className="mx-4 text-[var(--muted)]">|</span>
        <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:opacity-80 font-medium">
          Browse by State →
        </Link>
      </section>

      <section className="rounded-[var(--section-radius)] border border-[var(--border)] bg-[var(--surface)] p-[var(--section-pad)]">
        <p className="text-center text-sm text-[var(--muted)]">
          Chinese Buffets Directory - Find all-you-can-eat Chinese buffets by neighborhood
        </p>
      </section>
    </SiteShell>
  );
}

function NeighborhoodsIndexSkeleton() {
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
            <div key={index} className="h-20 rounded-lg bg-[var(--surface2)]" />
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
