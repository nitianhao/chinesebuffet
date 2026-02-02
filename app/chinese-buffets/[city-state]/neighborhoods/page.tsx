import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCityNeighborhoodsRollup, RollupDebugInfo, STATE_ABBR_TO_NAME } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

interface NeighborhoodsIndexPageProps {
  params: {
    'city-state': string;
  };
}

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

export async function generateMetadata({ params }: NeighborhoodsIndexPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const { data } = await getCityNeighborhoodsRollup(citySlug);
  
  if (!data) {
    return {
      title: 'Neighborhoods Not Found',
    };
  }

  const neighborhoodCount = data.neighborhoods.length;
  
  return {
    title: `Chinese Buffets by Neighborhood in ${data.cityName}, ${data.stateAbbr}`,
    description: `Browse Chinese buffets in ${neighborhoodCount} neighborhoods across ${data.cityName}, ${data.stateAbbr}. Find all-you-can-eat restaurants with hours, prices, and reviews.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods`,
    },
  };
}

export default async function NeighborhoodsIndexPage({ params }: NeighborhoodsIndexPageProps) {
  const citySlug = params['city-state'];
  const pageStart = Date.now();
  const { data, debug } = await getCityNeighborhoodsRollup(citySlug);
  const pageRenderMs = Date.now() - pageStart;
  
  // If no data at all, show 404-like state but don't hard fail
  // The city might exist but have no neighborhood rollup yet
  const cityName = data?.cityName || citySlug.split('-').slice(0, -1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const stateAbbr = data?.stateAbbr || citySlug.split('-').pop()?.toUpperCase() || '';
  const state = data?.state || STATE_ABBR_TO_NAME[stateAbbr] || stateAbbr;
  const neighborhoods = data?.neighborhoods || [];
  
  // Calculate total buffets across all neighborhoods
  const totalBuffets = neighborhoods.reduce((sum, n) => sum + n.buffetCount, 0);
  const isEmpty = neighborhoods.length === 0;

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
            <Link 
              href={`/chinese-buffets/${citySlug}`}
              className="hover:text-[var(--accent1)]"
            >
              {cityName}
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">Neighborhoods</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets by Neighborhood in {cityName}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {totalBuffets} buffets across {neighborhoods.length} neighborhoods
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
            {!isEmpty 
              ? `Explore Chinese buffets in ${neighborhoods.length} neighborhoods across ${cityName}, ${stateAbbr}. 
                 Select a neighborhood below to find all-you-can-eat restaurants with detailed hours, 
                 pricing, ratings, and customer reviews.`
              : `We're still mapping neighborhoods in ${cityName}. Browse all buffets in the city instead.`
            }
          </p>
        </div>
      </section>

      {/* Neighborhoods Grid */}
      <section className="bg-[var(--surface2)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isEmpty ? (
            <div className="text-center py-12">
              <p className="text-[var(--muted)] mb-4">
                No neighborhoods with buffets found in {cityName}.
              </p>
              {isDev && !debug.found && (
                <p className="text-yellow-600 mb-4">
                  Rollup missing. Run: <code className="bg-yellow-100 px-2 py-1 rounded">node scripts/rebuildRollups.js</code>
                </p>
              )}
              <Link 
                href={`/chinese-buffets/${citySlug}`}
                className="text-[var(--accent1)] hover:opacity-80 font-medium"
              >
                View all buffets in {cityName} →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {neighborhoods.map((neighborhood) => (
                <Link
                  key={neighborhood.slug}
                  href={`/chinese-buffets/${citySlug}/neighborhoods/${neighborhood.slug}`}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="font-semibold text-lg text-[var(--text)] group-hover:text-[var(--accent1)]">
                        {neighborhood.neighborhood}
                      </h2>
                      <p className="text-[var(--muted)] text-sm mt-1">
                        {neighborhood.buffetCount} {neighborhood.buffetCount === 1 ? 'buffet' : 'buffets'}
                      </p>
                    </div>
                    <span className="text-[var(--accent1)]">→</span>
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
          <Link 
            href={`/chinese-buffets/${citySlug}`}
            className="text-[var(--accent1)] hover:opacity-80 font-medium"
          >
            ← Back to {cityName}
          </Link>
          <span className="mx-4 text-[var(--muted)]">|</span>
          <Link 
            href={`/chinese-buffets/states/${stateAbbr.toLowerCase()}`}
            className="text-[var(--accent1)] hover:opacity-80 font-medium"
          >
            All Cities in {state} →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {cityName} neighborhoods
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
