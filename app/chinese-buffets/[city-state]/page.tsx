import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCityBuffetsRollup, STATE_ABBR_TO_NAME, CityBuffetRow } from '@/lib/rollups';
import CityFilterBar from '@/components/city/CityFilterBar';
import { getCityFacets, parseFiltersFromParams, applyFilters, hasActiveFilters } from '@/lib/facets/getCityFacets';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

interface CityPageProps {
  params: {
    'city-state': string;
  };
  searchParams: Record<string, string | string[] | undefined>;
}

// Buffet card component
function BuffetCard({ buffet, citySlug }: { buffet: CityBuffetRow; citySlug: string }) {
  return (
    <Link
      href={`/chinese-buffets/${citySlug}/${buffet.slug}`}
      className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)] line-clamp-1">
          {buffet.name}
        </h3>
        {buffet.rating && (
          <span className="flex items-center gap-1 text-sm text-[var(--muted)]">
            ⭐ {buffet.rating.toFixed(1)}
          </span>
        )}
      </div>
      
      <p className="text-[var(--muted)] text-sm line-clamp-1 mb-2">
        {buffet.address}
      </p>
      
      <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
        {buffet.neighborhood && (
          <span className="bg-[var(--surface2)] px-2 py-1 rounded">
            {buffet.neighborhood}
          </span>
        )}
        {buffet.price && (
          <span className="bg-[var(--surface2)] px-2 py-1 rounded">
            {buffet.price}
          </span>
        )}
        {buffet.reviewsCount && buffet.reviewsCount > 0 && (
          <span className="bg-[var(--surface2)] px-2 py-1 rounded">
            {buffet.reviewsCount.toLocaleString()} reviews
          </span>
        )}
      </div>
    </Link>
  );
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const { data } = await getCityBuffetsRollup(citySlug);
  
  if (!data || data.buffets.length === 0) {
    return {
      title: 'City Not Found',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Chinese Buffets in ${data.cityName}, ${data.state} - ${data.buffetCount} Locations`,
    description: `Find ${data.buffetCount} Chinese buffets in ${data.cityName}, ${data.state}. Compare hours, prices, ratings, and locations.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}`,
    },
  };
}

export default async function CityPage({ params, searchParams }: CityPageProps) {
  const citySlug = params['city-state'];
  
  // Fetch rollup data and facets in parallel
  const [rollupResult, facetsResult] = await Promise.all([
    getCityBuffetsRollup(citySlug),
    getCityFacets(citySlug),
  ]);
  
  const { data } = rollupResult;
  
  // Parse filters from URL
  const activeFilters = parseFiltersFromParams(searchParams);
  const isFiltering = hasActiveFilters(activeFilters);
  
  // If no rollup data, 404
  if (!data || data.buffets.length === 0) {
    notFound();
  }

  const { cityName, state, stateAbbr, buffets, neighborhoods, buffetCount } = data;
  
  // Apply filters if any are active
  let filteredBuffets = buffets;
  if (isFiltering) {
    const matchingIds = applyFilters(
      facetsResult.facetsByBuffetId,
      facetsResult.allBuffetIds,
      activeFilters,
      citySlug // Pass citySlug for "open now" caching (60s TTL)
    );
    const matchingIdSet = new Set(matchingIds);
    filteredBuffets = buffets.filter(b => matchingIdSet.has(b.id));
  }
  
  const filteredCount = filteredBuffets.length;
  
  // Sort by rating for top rated section
  const sortedByRating = [...filteredBuffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );
  
  // Sort by reviews for most popular section
  const sortedByPopularity = [...filteredBuffets].sort((a, b) => 
    (b.reviewsCount || 0) - (a.reviewsCount || 0)
  );
  
  const topBuffets = sortedByRating.slice(0, 5);
  const popularBuffets = sortedByPopularity.slice(0, 5);
  
  // Calculate price range
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

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Hero Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets in {cityName}, {state}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {isFiltering ? `${filteredCount} of ${buffetCount}` : buffetCount} {buffetCount === 1 ? 'location' : 'locations'} {isFiltering ? 'matching filters' : 'found'}
          </p>
        </div>
      </header>

      {/* TOP FILTER BAR - Sticky, immediately under hero */}
      <CityFilterBar
        aggregated={facetsResult.aggregated}
        totalBuffets={buffetCount}
        filteredCount={filteredCount}
      />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Block */}
        <section className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 mb-6">
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

        {/* No Results Message */}
        {isFiltering && filteredCount === 0 && (
          <section className="bg-[var(--surface)] rounded-lg border border-[var(--border)] p-8 mb-6 text-center">
            <svg className="w-12 h-12 mx-auto text-[var(--muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-semibold text-[var(--text)] mb-2">No buffets match your filters</h3>
            <p className="text-[var(--muted)] mb-4">Try adjusting your filters to see more results.</p>
          </section>
        )}

        {/* Intro Section - only show when not filtering or has results */}
        {(!isFiltering || filteredCount > 0) && (
          <section className="mb-8">
            <p className="text-[var(--text-secondary)]">
              Looking for Chinese buffets in {cityName}, {state}? Our directory 
              features {buffetCount} {buffetCount === 1 ? 'Chinese buffet' : 'Chinese buffets'} in {cityName}, 
              offering all-you-can-eat dining experiences throughout the city.
            </p>
          </section>
        )}

        {/* Top Rated Section - show only when not filtering */}
        {!isFiltering && topBuffets.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">
              Top Rated Chinese Buffets
            </h2>
            <p className="text-[var(--muted)] mb-4 text-sm">
              Highest-rated options based on customer reviews
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topBuffets.slice(0, 6).map((buffet) => (
                <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
              ))}
            </div>
          </section>
        )}

        {/* Most Popular Section - show only when not filtering */}
        {!isFiltering && popularBuffets.length > 0 && popularBuffets[0]?.reviewsCount && popularBuffets[0].reviewsCount > 10 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[var(--text)] mb-2">
              Most Popular Chinese Buffets
            </h2>
            <p className="text-[var(--muted)] mb-4 text-sm">
              Most-reviewed options in {cityName}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {popularBuffets.slice(0, 6).map((buffet) => (
                <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
              ))}
            </div>
          </section>
        )}

        {/* Neighborhoods Section - show only when not filtering */}
        {!isFiltering && neighborhoods.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[var(--text)] mb-4">
              By Neighborhood
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {neighborhoods.slice(0, 6).map((neighborhood) => (
                <Link
                  key={neighborhood.slug}
                  href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
                  className="border border-[var(--border)] rounded-lg p-3 hover:shadow-md transition-shadow bg-[var(--surface)] hover:border-[var(--accent1)] group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-[var(--text)] group-hover:text-[var(--accent1)]">
                        {neighborhood.neighborhood}
                      </h3>
                      <p className="text-[var(--muted)] text-sm">
                        {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
                      </p>
                    </div>
                    <span className="text-[var(--accent1)]">→</span>
                  </div>
                </Link>
              ))}
            </div>
            {neighborhoods.length > 6 && (
              <div className="mt-4">
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

        {/* All Buffets / Filtered Results Section */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[var(--text)]">
              {isFiltering ? 'Filtered Results' : `All Chinese Buffets in ${cityName}`}
            </h2>
            <span className="text-sm text-[var(--muted)]">
              {filteredCount} {filteredCount === 1 ? 'location' : 'locations'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBuffets.map((buffet) => (
              <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
            ))}
          </div>
        </section>
      </main>

      {/* Back Navigation */}
      <section className="bg-[var(--surface2)] py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {cityName}, {state}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
