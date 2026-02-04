import { Metadata } from 'next';
import Link from 'next/link';
import { getCitiesRollup } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

export const metadata: Metadata = {
  title: 'Chinese Buffets by Neighborhood - Browse Local Areas',
  description: 'Browse Chinese buffets by neighborhood. Find all-you-can-eat Chinese restaurants in local areas across US cities with hours, prices, and reviews.',
  alternates: {
    canonical: `${BASE_URL}/chinese-buffets/neighborhoods`,
  },
};

export default async function NeighborhoodsIndexPage() {
  const { cities } = await getCitiesRollup();
  
  // Get cities that have neighborhoods, sorted by buffet count
  const citiesWithNeighborhoods = cities
    .filter(c => c.buffetCount >= 3) // Only cities with enough buffets likely have neighborhood data
    .slice(0, 50); // Top 50 cities

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">Neighborhoods</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets by Neighborhood
          </h1>
          <p className="text-lg text-[var(--muted)]">
            Browse local areas in {cities.length} cities
          </p>
        </div>
      </header>

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-[var(--text-secondary)] max-w-3xl">
            Find Chinese buffets in specific neighborhoods across the United States. 
            Select a city below to explore buffets in local areas, complete with 
            hours, pricing, ratings, and customer reviews.
          </p>
        </div>
      </section>

      {/* Cities Grid */}
      <section className="bg-[var(--surface2)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
            Browse Neighborhoods by City
          </h2>
          {citiesWithNeighborhoods.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[var(--muted)]">No cities with neighborhood data found.</p>
              <Link href="/chinese-buffets/cities" className="text-[var(--accent1)] hover:opacity-80 mt-4 inline-block">
                Browse All Cities →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {citiesWithNeighborhoods.map((city) => (
                <Link
                  key={city.slug}
                  href={`/chinese-buffets/${city.slug}/neighborhoods`}
                  className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
                >
                  <div className="flex justify-between items-start">
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
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets by neighborhood
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
