import { Metadata } from 'next';
import Link from 'next/link';
import { getStatesRollup, STATE_ABBR_TO_NAME } from '@/lib/rollups';
import { REGION_LABELS, VALID_REGIONS } from '@/lib/regions';
import { getSiteUrl, getCanonicalUrl } from '@/lib/site-url';


const BASE_URL = getSiteUrl();
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

export const metadata: Metadata = {
  title: 'Chinese Buffets by State - All 50 States Directory',
  description: 'Browse Chinese buffets in every US state. Find all-you-can-eat Chinese restaurants near you with hours, prices, ratings, and reviews.',
  alternates: {
    canonical: getCanonicalUrl('/chinese-buffets/states'),
  },
  robots: { index: true, follow: true },
};

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[states-hub] ${label} took`, Date.now() - t0, "ms");
  }
}

export default async function StatesIndexPage() {
  const data = await timed("getStatesRollup", () => getStatesRollup());
  const { states } = data;
  console.log("[states-hub] payload bytes", Buffer.byteLength(JSON.stringify(data), "utf8"));

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

      {/* Browse by region */}
      <section className="bg-[var(--surface2)] py-8 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xl font-semibold text-[var(--text)] mb-4">Browse by region</h2>
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {VALID_REGIONS.map((region) => (
              <li key={region}>
                <Link
                  href={`/chinese-buffets/regions/${region}`}
                  className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors text-center"
                >
                  {REGION_LABELS[region]}
                </Link>
              </li>
            ))}
          </ul>
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
