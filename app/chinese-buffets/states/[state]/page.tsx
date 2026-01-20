import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BuffetCard from '@/components/BuffetCard';
import Map from '@/components/MapWrapper';
import SchemaMarkup from '@/components/SchemaMarkup';
import { getStateByAbbr, getAllStateAbbrs } from '@/lib/data-instantdb';

interface StatePageProps {
  params: {
    state: string;
  };
}

export async function generateStaticParams() {
  const stateAbbrs = await getAllStateAbbrs();
  return stateAbbrs.map((abbr) => ({
    state: abbr.toLowerCase(),
  }));
}

export async function generateMetadata({ params }: StatePageProps): Promise<Metadata> {
  const stateData = await getStateByAbbr(params.state.toUpperCase());
  
  if (!stateData) {
    return {
      title: 'State Not Found',
    };
  }

  return {
    title: `Chinese Buffets in ${stateData.state} - ${stateData.buffetCount} Locations`,
    description: `Find ${stateData.buffetCount} Chinese buffets across ${stateData.cityCount} cities in ${stateData.state}. Compare hours, prices, ratings, and locations.`,
  };
}

export default async function StatePage({ params }: StatePageProps) {
  const stateData = await getStateByAbbr(params.state.toUpperCase());

  if (!stateData) {
    notFound();
  }

  // Sort buffets by rating (highest first)
  const sortedBuffets = [...stateData.buffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );

  // Get top 10 buffets for highlights
  const topBuffets = sortedBuffets.slice(0, 10);

  // Group cities by buffet count
  const citiesByCount = stateData.cities.map(cityName => {
    const cityBuffets = stateData.buffets.filter((b: any) => 
      b.address.city === cityName
    );
    return {
      name: cityName,
      buffetCount: cityBuffets.length,
      topBuffet: cityBuffets[0],
    };
  }).sort((a, b) => b.buffetCount - a.buffetCount);

  // Create map markers
  const mapMarkers = stateData.buffets.map((buffet: any) => ({
    id: buffet.id,
    name: buffet.name,
    lat: buffet.location.lat,
    lng: buffet.location.lng,
    rating: buffet.rating,
    citySlug: buffet.citySlug,
    slug: buffet.slug,
  }));

  // Generate state-specific content
  const introContent = [
    `Discover the best Chinese buffets across ${stateData.state}. With ${stateData.buffetCount} locations spanning ${stateData.cityCount} cities, you're sure to find an all-you-can-eat Chinese buffet near you.`,
    `Whether you're looking for traditional Chinese cuisine, Mongolian grill, sushi, or American-Chinese favorites, our directory covers all the Chinese buffet restaurants in ${stateData.state}.`,
    `Each listing includes hours, prices, ratings, reviews, and detailed location information to help you find the perfect Chinese buffet experience.`,
  ];

  return (
    <>
      <SchemaMarkup type="state" data={stateData} />
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <nav className="text-sm text-gray-600 mb-4">
              <Link href="/" className="hover:text-blue-600">Home</Link>
              <span className="mx-2">/</span>
              <span className="text-gray-900">Chinese Buffets in {stateData.state}</span>
            </nav>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Chinese Buffets in {stateData.state}
            </h1>
            <p className="text-lg text-gray-600">
              {stateData.buffetCount} locations across {stateData.cityCount} cities
            </p>
          </div>
        </header>

        {/* Stats Section */}
        <section className="bg-white py-8 border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {stateData.buffetCount.toLocaleString()}
                </div>
                <div className="text-gray-600 mt-2">Chinese Buffets</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {stateData.cityCount.toLocaleString()}
                </div>
                <div className="text-gray-600 mt-2">Cities</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-blue-600">
                  {topBuffets.length > 0 ? topBuffets[0].rating.toFixed(1) : 'N/A'}
                </div>
                <div className="text-gray-600 mt-2">Top Rated</div>
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

        {/* Top Cities Section */}
        {citiesByCount.length > 0 && (
          <section className="bg-blue-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Cities with Chinese Buffets in {stateData.state}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {citiesByCount.slice(0, 12).map((city) => (
                  <Link
                    key={city.name}
                    href={`/chinese-buffets/${stateData.buffets.find((b: any) => b.address.city === city.name)?.citySlug || ''}`}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {city.name}
                        </h3>
                        <p className="text-gray-600 text-sm mt-1">
                          {city.buffetCount} {city.buffetCount === 1 ? 'buffet' : 'buffets'}
                        </p>
                      </div>
                      <span className="text-blue-600">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Top Buffets Section */}
        {topBuffets.length > 0 && (
          <section className="bg-white py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Top Rated Chinese Buffets in {stateData.state}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {topBuffets.map((buffet: any) => (
                  <BuffetCard
                    key={buffet.id}
                    buffet={buffet}
                    citySlug={buffet.citySlug || ''}
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
              Map of Chinese Buffets in {stateData.state}
            </h2>
            <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
              <Map
                markers={mapMarkers}
                height="600px"
                showClusters={true}
              />
            </div>
          </div>
        </section>

        {/* All Buffets Section */}
        <section className="bg-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Chinese Buffets in {stateData.state}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedBuffets.map((buffet: any) => (
                <BuffetCard
                  key={buffet.id}
                  buffet={buffet}
                  citySlug={buffet.citySlug || ''}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-gray-400">
                Chinese Buffets Directory - Find all-you-can-eat Chinese buffets in {stateData.state}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}




















