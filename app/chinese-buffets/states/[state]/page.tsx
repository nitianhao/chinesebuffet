import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStateCitiesRollup, STATE_ABBR_TO_NAME } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 12 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 43200;

interface StatePageProps {
  params: {
    state: string;
  };
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateAbbr = params.state.toUpperCase();
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];
  
  if (!stateName) {
    return {
      title: 'State Not Found',
      robots: { index: false, follow: false },
    };
  }
  
  const { data } = await getStateCitiesRollup(stateAbbr);
  
  if (!data || data.cities.length === 0) {
    return {
      title: `Chinese Buffets in ${stateName}`,
      description: `Find Chinese buffets in ${stateName}.`,
      robots: { index: false, follow: true },
    };
  }

  return {
    title: `Chinese Buffets in ${stateName} - ${data.buffetCount} Locations`,
    description: `Find ${data.buffetCount} Chinese buffets across ${data.cityCount} cities in ${stateName}. Compare hours, prices, ratings, and locations.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/states/${params.state.toLowerCase()}`,
    },
  };
}

export default async function StatePage({ params }: StatePageProps) {
  const stateAbbr = params.state.toUpperCase();
  const stateName = STATE_ABBR_TO_NAME[stateAbbr];
  
  // If invalid state abbreviation, 404
  if (!stateName) {
    notFound();
  }
  
  const { data } = await getStateCitiesRollup(stateAbbr);
  
  // If no rollup data, 404
  if (!data || data.cities.length === 0) {
    notFound();
  }

  const { cities, buffetCount, cityCount } = data;
  
  // Get top city for stats
  const topCity = cities[0];
  const topRated = cities.length > 0 ? cities[0] : null;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Header */}
      <header className="bg-[var(--surface)] shadow-sm border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <nav className="text-sm text-[var(--muted)] mb-4">
            <Link href="/" className="hover:text-[var(--accent1)]">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/chinese-buffets/states" className="hover:text-[var(--accent1)]">States</Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">{stateName}</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets in {stateName}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {buffetCount.toLocaleString()} locations across {cityCount} cities
          </p>
        </div>
      </header>

      {/* Stats Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
      </section>

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
      </section>

      {/* Cities Grid */}
      <section className="bg-[var(--surface2)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[var(--text)] mb-6">
            Cities with Chinese Buffets in {stateName}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {cities.map((city) => (
              <Link
                key={city.citySlug}
                href={`/chinese-buffets/${city.citySlug}`}
                className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md hover:border-[var(--accent1)] transition-all group"
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
        </div>
      </section>

      {/* Back Navigation */}
      <section className="bg-[var(--surface)] py-6 border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/chinese-buffets/states" className="text-[var(--accent1)] hover:opacity-80 font-medium">
            ← Back to All States
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
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {stateName}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
