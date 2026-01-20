import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BuffetCard from '@/components/BuffetCard';
import Map from '@/components/MapWrapper';
import { getNeighborhoodBySlug, getNeighborhoodsByCity, getCityBySlug } from '@/lib/data-instantdb';

interface NeighborhoodPageProps {
  params: {
    'city-state': string;
    neighborhood: string;
  };
}

export async function generateStaticParams() {
  // This would need to fetch all city-neighborhood combinations
  // For now, we'll use dynamic rendering
  return [];
}

export async function generateMetadata({ params }: NeighborhoodPageProps): Promise<Metadata> {
  try {
    const neighborhoodData = await getNeighborhoodBySlug(
      params['city-state'],
      params.neighborhood
    );
    
    if (!neighborhoodData) {
      return {
        title: 'Neighborhood Not Found',
      };
    }

    return {
      title: `Chinese Buffets in ${neighborhoodData.neighborhood}, ${neighborhoodData.cityName || 'City'} - ${neighborhoodData.buffetCount || 0} Locations`,
      description: `Find ${neighborhoodData.buffetCount || 0} Chinese buffets in ${neighborhoodData.neighborhood}, ${neighborhoodData.cityName || 'City'}, ${neighborhoodData.stateAbbr || 'State'}. Compare hours, prices, ratings, and locations.`,
    };
  } catch (error) {
    console.error('[NeighborhoodPage] Error in generateMetadata:', error);
    return {
      title: 'Neighborhood Not Found',
    };
  }
}

export default async function NeighborhoodPage({ params }: NeighborhoodPageProps) {
  let neighborhoodData;
  try {
    neighborhoodData = await getNeighborhoodBySlug(
      params['city-state'],
      params.neighborhood
    );
  } catch (error) {
    console.error('[NeighborhoodPage] Error fetching neighborhood:', error);
    notFound();
  }

  if (!neighborhoodData) {
    notFound();
  }

  // Try to get city, but don't fail if it's not found
  let city = null;
  try {
    city = await getCityBySlug(params['city-state']);
  } catch (error) {
    // Silently handle - we have fallback data from neighborhood
    console.warn(`[NeighborhoodPage] Could not fetch city for ${params['city-state']}, using neighborhood data:`, error);
  }
  
  // If city not found, use neighborhood data for city info
  const cityName = city?.city || neighborhoodData?.cityName || 'City';
  const stateName = city?.state || neighborhoodData?.stateAbbr || 'State';

  // Sort buffets by rating (highest first)
  const sortedBuffets = [...neighborhoodData.buffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );

  // Get top 5 buffets for highlights
  const topBuffets = sortedBuffets.slice(0, 5);

  // Create map markers (filter out buffets without valid location data)
  const mapMarkers = neighborhoodData.buffets
    .filter((buffet: any) => buffet.location && typeof buffet.location.lat === 'number' && typeof buffet.location.lng === 'number')
    .map((buffet: any) => ({
      id: buffet.id,
      name: buffet.name,
      lat: buffet.location.lat,
      lng: buffet.location.lng,
      rating: buffet.rating,
      citySlug: params['city-state'],
      slug: buffet.slug,
    }));

  // Generate neighborhood-specific content
  const introContent = [
    `Discover the best Chinese buffets in ${neighborhoodData.neighborhood}, ${neighborhoodData.cityName}. With ${neighborhoodData.buffetCount} locations in this neighborhood, you're sure to find an all-you-can-eat Chinese buffet nearby.`,
    `Whether you're looking for traditional Chinese cuisine, Mongolian grill, sushi, or American-Chinese favorites, our directory covers all the Chinese buffet restaurants in ${neighborhoodData.neighborhood}.`,
    `Each listing includes hours, prices, ratings, reviews, and detailed location information to help you find the perfect Chinese buffet experience.`,
  ];

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <nav className="text-sm text-gray-600 mb-4">
              <Link href="/" className="hover:text-blue-600">Home</Link>
              <span className="mx-2">/</span>
              <Link href={`/chinese-buffets/${params['city-state']}`} className="hover:text-blue-600">
                {neighborhoodData.cityName}
              </Link>
              <span className="mx-2">/</span>
              <span className="text-gray-900">{neighborhoodData.neighborhood}</span>
            </nav>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Chinese Buffets in {neighborhoodData.neighborhood}
            </h1>
            <p className="text-lg text-gray-600">
              {neighborhoodData.buffetCount} locations in {neighborhoodData.cityName}, {neighborhoodData.stateAbbr}
            </p>
          </div>
        </header>

        {/* Stats Section */}
        <section className="bg-white py-8 border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {neighborhoodData.buffetCount.toLocaleString()}
                </div>
                <div className="text-gray-600 mt-2">Chinese Buffets</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {topBuffets.length > 0 ? topBuffets[0].rating.toFixed(1) : 'N/A'}
                </div>
                <div className="text-gray-600 mt-2">Top Rated</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {neighborhoodData.neighborhood}
                </div>
                <div className="text-gray-600 mt-2">Neighborhood</div>
              </div>
            </div>
          </div>
        </section>

        {/* Intro Section */}
        <section className="bg-white py-8 border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="prose max-w-none">
              {introContent.map((paragraph, index) => (
                <p key={index} className="text-gray-700 mb-4">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </section>

        {/* Top Buffets Section */}
        {topBuffets.length > 0 && (
          <section className="bg-blue-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Top Rated Chinese Buffets in {neighborhoodData.neighborhood}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {topBuffets.map((buffet: any) => (
                  <BuffetCard
                    key={buffet.id}
                    buffet={buffet}
                    citySlug={params['city-state']}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Map Section */}
        <section className="bg-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Map of Chinese Buffets in {neighborhoodData.neighborhood}
            </h2>
            <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
              <Map
                markers={mapMarkers}
                center={[
                  mapMarkers[0]?.lat || 0,
                  mapMarkers[0]?.lng || 0,
                ]}
                zoom={13}
                height="500px"
                showClusters={neighborhoodData.buffets.length > 10}
              />
            </div>
          </div>
        </section>

        {/* All Buffets Section */}
        <section className="bg-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Chinese Buffets in {neighborhoodData.neighborhood}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedBuffets.map((buffet: any) => (
                <BuffetCard
                  key={buffet.id}
                  buffet={buffet}
                  citySlug={params['city-state']}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Back to City Link */}
        <section className="bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link
              href={`/chinese-buffets/${params['city-state']}`}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              ← Back to {cityName}, {stateName}
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-gray-400">
                Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {neighborhoodData.neighborhood}, {neighborhoodData.cityName}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}




















