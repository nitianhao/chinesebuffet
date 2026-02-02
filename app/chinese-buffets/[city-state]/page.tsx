import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCityBuffetsRollup, STATE_ABBR_TO_NAME, RollupDebugInfo, CityBuffetRow } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

interface CityPageProps {
  params: {
    'city-state': string;
  };
}

// Debug panel component (dev-only)
function DebugPanel({ debug }: { debug: RollupDebugInfo }) {
  if (!isDev) return null;
  
  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 my-4">
      <h3 className="font-bold text-yellow-800 mb-2">🔧 Rollup Debug (dev only)</h3>
      <div className="text-sm text-yellow-900 space-y-1">
        <p><strong>Rollup:</strong> {debug.rollupType}/{debug.rollupKey}</p>
        <p><strong>Status:</strong> {debug.found ? (debug.stale ? '⚠️ STALE' : '✅ HIT') : '❌ MISSING'}</p>
        <p><strong>Updated:</strong> {debug.updatedAt ? new Date(debug.updatedAt).toLocaleString() : 'never'}</p>
        <p><strong>Buffets:</strong> {debug.dataLength}</p>
        <p><strong>Fetch time:</strong> {debug.fetchDurationMs}ms</p>
        {!debug.found && (
          <div className="mt-2 p-2 bg-red-100 rounded">
            <p className="text-red-800 font-semibold">⚠️ Rollup missing!</p>
            <p className="text-red-700 mt-1">Run: <code className="bg-red-200 px-1">node scripts/rebuildRollups.js</code></p>
          </div>
        )}
      </div>
    </div>
  );
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

export default async function CityPage({ params }: CityPageProps) {
  const pageStart = Date.now();
  const citySlug = params['city-state'];
  
  const { data, debug } = await getCityBuffetsRollup(citySlug);
  const pageRenderMs = Date.now() - pageStart;
  
  // If no rollup data, show helpful message in dev or 404 in prod
  if (!data || data.buffets.length === 0) {
    if (isDev) {
      return (
        <div className="min-h-screen bg-[var(--bg)] p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Rollup Missing</h1>
          <p className="mb-4">The city buffets rollup for {citySlug} is missing or empty.</p>
          <p className="mb-4">Run: <code className="bg-gray-100 px-2 py-1 rounded">node scripts/rebuildRollups.js</code></p>
          <DebugPanel debug={{ ...debug, fetchDurationMs: pageRenderMs }} />
        </div>
      );
    }
    notFound();
  }

  const { cityName, state, stateAbbr, buffets, neighborhoods, buffetCount } = data;
  
  // Sort by rating for top rated section
  const sortedByRating = [...buffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );
  
  // Sort by reviews for most popular section
  const sortedByPopularity = [...buffets].sort((a, b) => 
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
      {/* Header */}
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
            {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} found
          </p>
        </div>
      </header>

      {/* Debug Panel - shows in dev */}
      {isDev && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <DebugPanel debug={{ ...debug, fetchDurationMs: pageRenderMs }} />
        </div>
      )}

      {/* Summary Block */}
      <section className="bg-[var(--surface2)] py-6 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--surface)] rounded-lg p-4 shadow-sm border border-[var(--border)]">
              <div className="text-sm text-[var(--muted)] mb-1">Total Buffets</div>
              <div className="text-2xl font-bold text-[var(--accent1)]">{buffetCount}</div>
            </div>
            {topBuffets.length > 0 && topBuffets[0]?.rating && (
              <div className="bg-[var(--surface)] rounded-lg p-4 shadow-sm border border-[var(--border)]">
                <div className="text-sm text-[var(--muted)] mb-1">Top Rated</div>
                <div className="text-lg font-semibold text-[var(--text)] line-clamp-1">{topBuffets[0].name}</div>
                <div className="text-sm text-[var(--muted)]">⭐ {topBuffets[0].rating.toFixed(1)}</div>
              </div>
            )}
            <div className="bg-[var(--surface)] rounded-lg p-4 shadow-sm border border-[var(--border)]">
              <div className="text-sm text-[var(--muted)] mb-1">Price Range</div>
              <div className="text-lg font-semibold text-[var(--text)]">{priceRange}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose max-w-none">
            <p className="text-[var(--text-secondary)] mb-4">
              Looking for Chinese buffets in {cityName}, {state}? You've come to the right place. Our directory 
              features {buffetCount} {buffetCount === 1 ? 'Chinese buffet' : 'Chinese buffets'} in {cityName}, 
              offering all-you-can-eat dining experiences throughout the city.
            </p>
            {buffetCount > 5 && (
              <p className="text-[var(--text-secondary)] mb-4">
                With {buffetCount} locations to choose from, {cityName} offers plenty of options for Chinese 
                buffet enthusiasts. Whether you're looking for a quick lunch buffet or a full dinner experience 
                with crab legs and sushi, you'll find diverse options across the city.
              </p>
            )}
            <p className="text-[var(--text-secondary)]">
              Browse through our detailed listings below. Each listing includes hours, prices, ratings, and 
              contact information to help you plan your visit.
            </p>
          </div>
        </div>
      </section>

      {/* Top Rated Section */}
      {topBuffets.length > 0 && (
        <section className="bg-[var(--surface2)] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
              Top Rated Chinese Buffets in {cityName}
            </h2>
            <p className="text-[var(--muted)] mb-6">
              Highest-rated options based on customer reviews
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topBuffets.map((buffet) => (
                <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Most Popular Section */}
      {popularBuffets.length > 0 && popularBuffets[0]?.reviewsCount && popularBuffets[0].reviewsCount > 10 && (
        <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
              Most Popular Chinese Buffets in {cityName}
            </h2>
            <p className="text-[var(--muted)] mb-6">
              Most-reviewed options, indicating high customer engagement
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {popularBuffets.map((buffet) => (
                <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Neighborhoods Section */}
      {neighborhoods.length > 0 && (
        <section className="bg-[var(--surface2)] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
              Chinese Buffets by Neighborhood in {cityName}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {neighborhoods.map((neighborhood) => (
                <Link
                  key={neighborhood.slug}
                  href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
                  className="border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-shadow bg-[var(--surface)] hover:border-[var(--accent1)] group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)]">
                        {neighborhood.neighborhood}
                      </h3>
                      <p className="text-[var(--muted)] text-sm mt-1">
                        {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
                      </p>
                    </div>
                    <span className="text-[var(--accent1)]">→</span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4">
              <Link 
                href={`/chinese-buffets/${citySlug}/neighborhoods`}
                className="text-[var(--accent1)] hover:opacity-80 font-medium"
              >
                View all neighborhoods →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* All Buffets Section */}
      <section className="bg-[var(--surface)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[var(--text)]">
              All Chinese Buffets in {cityName}, {state}
            </h2>
            <span className="text-sm text-[var(--muted)]">
              {buffetCount} {buffetCount === 1 ? 'location' : 'locations'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buffets.map((buffet) => (
              <BuffetCard key={buffet.id} buffet={buffet} citySlug={citySlug} />
            ))}
          </div>
        </div>
      </section>

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
