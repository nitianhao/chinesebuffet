import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getNeighborhoodBuffetsRollup, CityBuffetRow } from '@/lib/rollups';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';
const isDev = process.env.NODE_ENV !== 'production';

// ISR: Revalidate every 6 hours in prod, 1 hour in dev
export const revalidate = isDev ? 3600 : 21600;

interface NeighborhoodPageProps {
  params: {
    'city-state': string;
    neighborhood: string;
  };
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

export async function generateMetadata({ params }: NeighborhoodPageProps): Promise<Metadata> {
  const citySlug = params['city-state'];
  const neighborhoodSlug = params.neighborhood;
  
  const { data } = await getNeighborhoodBuffetsRollup(citySlug, neighborhoodSlug);
  
  if (!data || data.buffets.length === 0) {
    return {
      title: 'Neighborhood Not Found',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Chinese Buffets in ${data.neighborhoodName}, ${data.cityName} - ${data.buffetCount} Locations`,
    description: `Find ${data.buffetCount} Chinese buffets in ${data.neighborhoodName}, ${data.cityName}, ${data.stateAbbr}. Compare hours, prices, ratings, and locations.`,
    alternates: {
      canonical: `${BASE_URL}/chinese-buffets/${citySlug}/neighborhoods/${neighborhoodSlug}`,
    },
  };
}

export default async function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  const citySlug = params['city-state'];
  const neighborhoodSlug = params.neighborhood;
  
  const { data } = await getNeighborhoodBuffetsRollup(citySlug, neighborhoodSlug);
  
  // If no rollup data, 404
  if (!data || data.buffets.length === 0) {
    notFound();
  }

  const { neighborhoodName, cityName, state, stateAbbr, buffets, buffetCount } = data;
  
  // Sort by rating for top rated section
  const sortedByRating = [...buffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );
  
  const topBuffets = sortedByRating.slice(0, 5);
  
  // Create map markers
  const mapMarkers = buffets
    .filter(b => b.lat && b.lng)
    .map(b => ({
      id: b.id,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
      rating: b.rating,
      citySlug,
      slug: b.slug,
    }));

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
            <Link 
              href={`/chinese-buffets/${citySlug}/neighborhoods`}
              className="hover:text-[var(--accent1)]"
            >
              Neighborhoods
            </Link>
            <span className="mx-2">/</span>
            <span className="text-[var(--text)]">{neighborhoodName}</span>
          </nav>
          <h1 className="text-4xl font-bold text-[var(--text)] mb-2">
            Chinese Buffets in {neighborhoodName}
          </h1>
          <p className="text-lg text-[var(--muted)]">
            {buffetCount} {buffetCount === 1 ? 'location' : 'locations'} in {cityName}, {stateAbbr}
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
        </div>
      </section>

      {/* Intro Section */}
      <section className="bg-[var(--surface)] py-8 border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
        </div>
      </section>

      {/* Top Rated Section */}
      {topBuffets.length > 0 && (
        <section className="bg-[var(--surface2)] py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
              Top Rated Chinese Buffets in {neighborhoodName}
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

      {/* All Buffets Section */}
      <section className="bg-[var(--surface)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-[var(--text)]">
              All Chinese Buffets in {neighborhoodName}
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
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--headerBg)] text-white py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <p className="text-white/60">
              Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {neighborhoodName}, {cityName}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
