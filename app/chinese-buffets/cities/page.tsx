import { Metadata } from 'next';
import Link from 'next/link';
import { getCitiesRollup, RollupDebugInfo } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

export const metadata: Metadata = {
  title: 'Chinese Buffets by City - Complete US Directory',
  description: 'Browse Chinese buffets in cities across the United States. Find all-you-can-eat Chinese restaurants with hours, prices, ratings, and customer reviews.',
  alternates: {
    canonical: `${BASE_URL}/chinese-buffets/cities`,
  },
};

// Debug panel component (dev-only)
function DebugPanel({ debug, isEmpty }: { debug: RollupDebugInfo; isEmpty: boolean }) {
  if (!isDev) return null;
  
  return (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 my-4">
      <h3 className="font-bold text-yellow-800 mb-2">🔧 Rollup Debug (dev only)</h3>
      <div className="text-sm text-yellow-900 space-y-1">
        <p><strong>Rollup:</strong> {debug.rollupType}{debug.rollupKey ? `/${debug.rollupKey}` : ''}</p>
        <p><strong>Status:</strong> {debug.found ? (debug.stale ? '⚠️ STALE' : '✅ HIT') : '❌ MISSING'}</p>
        <p><strong>Updated:</strong> {debug.updatedAt ? new Date(debug.updatedAt).toLocaleString() : 'never'}</p>
        <p><strong>Records:</strong> {debug.dataLength}</p>
        <p><strong>Fetch time:</strong> {debug.fetchDurationMs}ms</p>
        {!debug.found && (
          <div className="mt-2 p-2 bg-red-100 rounded">
            <p className="text-red-800 font-semibold">⚠️ Rollup missing!</p>
            <p className="text-red-700 mt-1">Run: <code className="bg-red-200 px-1">node scripts/rebuildRollups.js</code></p>
          </div>
        )}
        {debug.stale && debug.found && (
          <div className="mt-2 p-2 bg-orange-100 rounded">
            <p className="text-orange-800">Rollup is stale (older than 24h). Consider rebuilding.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default async function CitiesIndexPage() {
  const pageStart = Date.now();
  const { cities, debug } = await getCitiesRollup();
  const pageRenderMs = Date.now() - pageStart;
  
  // Group cities by state for better organization
  const citiesByState: Record<string, typeof cities> = {};
  cities.forEach(city => {
    const stateKey = city.stateAbbr || 'Other';
    if (!citiesByState[stateKey]) {
      citiesByState[stateKey] = [];
    }
    citiesByState[stateKey].push(city);
  });
  
  // Sort states alphabetically
  const sortedStates = Object.keys(citiesByState).sort();
  
  // Calculate totals
  const totalBuffets = cities.reduce((sum, c) => sum + c.buffetCount, 0);
  const isEmpty = cities.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">Cities</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets by City
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {totalBuffets.toLocaleString()} buffets in {cities.length} cities
          </p>
        </div>
      </header>

      {/* Debug Panel - shows in dev */}
      {isDev && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <DebugPanel debug={{ ...debug, fetchDurationMs: pageRenderMs }} isEmpty={isEmpty} />
        </div>
      )}

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-[var(--text-secondary)] max-w-3xl">
            Explore Chinese buffets in {cities.length.toLocaleString()} cities across the United States. 
            Each city page includes detailed listings with hours, pricing, ratings, and reviews 
            to help you find the perfect all-you-can-eat dining experience.
          </p>
        </div>
      </section>

      {/* Top Cities Section */}
      <section className="bg-[var(--surface2)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
            Top Cities by Buffet Count
          </h2>
          {isEmpty ? (
            <div className="text-center py-12">
              <p className="text-[var(--muted)]">No cities with buffets found.</p>
              {isDev && !debug.found && (
                <p className="text-yellow-600 mt-2">
                  Rollup missing. Run: <code className="bg-yellow-100 px-2 py-1 rounded">node scripts/rebuildRollups.js</code>
                </p>
              )}
              <Link href="/" className="text-[var(--accent1)] hover:opacity-80 mt-4 inline-block">
                ← Back to Home
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {cities.slice(0, 24).map((city) => (
                <Link
                  key={city.slug}
                  href={`/chinese-buffets/${city.slug}`}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)]">
                        {city.city}
                      </h3>
                      <p className="text-[var(--muted)] text-sm mt-1">
                        {city.state}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[var(--accent1)] font-bold text-lg">
                        {city.buffetCount}
                      </span>
                      <p className="text-[var(--muted)] text-xs">
                        {city.buffetCount === 1 ? 'buffet' : 'buffets'}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* All Cities by State */}
      {!isEmpty && (
        <section className="bg-[var(--surface)] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
              All Cities by State
            </h2>
            <div className="space-y-8">
              {sortedStates.map((stateAbbr) => {
                const stateCities = citiesByState[stateAbbr];
                if (!stateCities || stateCities.length === 0) return null;
                
                return (
                  <div key={stateAbbr} className="border-b border-[var(--border)] pb-6 last:border-b-0">
                    <h3 className="text-xl font-semibold text-[var(--text)] mb-4 flex items-center gap-2">
                      <Link
                        href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
                        className="hover:text-[var(--accent1)]"
                      >
                        {stateCities[0]?.state || stateAbbr}
                      </Link>
                      <span className="text-sm font-normal text-[var(--muted)]">
                        ({stateCities.length} {stateCities.length === 1 ? 'city' : 'cities'})
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {stateCities.map((city) => (
                        <Link
                          key={city.slug}
                          href={`/chinese-buffets/${city.slug}`}
                          className="text-[var(--text)] hover:text-[var(--accent1)] text-sm py-1"
                        >
                          {city.city}
                          <span className="text-[var(--muted)] ml-1">
                            ({city.buffetCount})
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Back Navigation */}
      <section className="bg-[var(--surface2)] py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            ← Back to Home
          </Link>
          <span className="mx-4 text-[var(--muted)]">|</span>
          <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            Browse by State →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets by city
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
