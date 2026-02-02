import { Metadata } from 'next';
import Link from 'next/link';
import { getStatesRollup, RollupDebugInfo, STATE_ABBR_TO_NAME } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

export const metadata: Metadata = {
  title: 'Chinese Buffets by State - All 50 States Directory',
  description: 'Browse Chinese buffets in every US state. Find all-you-can-eat Chinese restaurants near you with hours, prices, ratings, and reviews.',
  alternates: {
    canonical: `${BASE_URL}/chinese-buffets/states`,
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

export default async function StatesIndexPage() {
  const pageStart = Date.now();
  const { states, debug } = await getStatesRollup();
  const pageRenderMs = Date.now() - pageStart;
  
  // Calculate totals
  const totalBuffets = states.reduce((sum, s) => sum + s.buffetCount, 0);
  const totalCities = states.reduce((sum, s) => sum + s.cityCount, 0);
  const isEmpty = states.length === 0;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">States</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets by State
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {totalBuffets.toLocaleString()} buffets across {states.length} states
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
            Find Chinese buffets in any US state. Our directory covers {totalBuffets.toLocaleString()} all-you-can-eat 
            Chinese restaurants in {totalCities.toLocaleString()} cities. Select a state below to browse local listings 
            with hours, prices, ratings, and customer reviews.
          </p>
        </div>
      </section>

      {/* States Grid */}
      <section className="bg-[var(--surface2)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isEmpty ? (
            <div className="text-center py-12">
              <p className="text-[var(--muted)]">No states with buffets found.</p>
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
              {states.map((state) => (
                <Link
                  key={state.stateAbbr}
                  href={`/chinese-buffets/states/${state.stateAbbr.toLowerCase()}`}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)]">
                        {state.stateName}
                      </h2>
                      <p className="text-[var(--muted)] text-sm mt-1">
                        {state.buffetCount} {state.buffetCount === 1 ? 'buffet' : 'buffets'}
                        {state.cityCount > 0 && (
                          <span className="ml-1">
                            · {state.cityCount} {state.cityCount === 1 ? 'city' : 'cities'}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[var(--accent1)] text-xl font-bold">
                      {state.stateAbbr}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Back Navigation */}
      <section className="bg-[var(--surface)] py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            ← Back to Home
          </Link>
          <span className="mx-4 text-[var(--muted)]">|</span>
          <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            Browse by City →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets by state
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
