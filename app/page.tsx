import { Metadata } from 'next';
import SearchBar from '@/components/SearchBar';
import Map from '@/components/MapWrapper';
import SchemaMarkup from '@/components/SchemaMarkup';
import { getSummary, getSampleBuffets } from '@/lib/data';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
};

export default function HomePage() {
  const summary = getSummary();
  const sampleBuffets = getSampleBuffets(200); // Sample for homepage map

  const mapMarkers = sampleBuffets.map(buffet => ({
    id: buffet.id,
    name: buffet.name,
    lat: buffet.location.lat,
    lng: buffet.location.lng,
    rating: buffet.rating,
    citySlug: buffet.citySlug,
    slug: buffet.slug,
  }));

  return (
    <>
      <SchemaMarkup type="homepage" />
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Chinese Buffets Directory
            </h1>
            <p className="text-lg text-gray-600">
              Find all-you-can-eat Chinese buffets across the United States
            </p>
          </div>
        </header>

        {/* Search Section */}
        <section className="bg-blue-600 text-white py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">
                Find Chinese Buffets Near You
              </h2>
              <p className="text-blue-100 text-lg">
                Search by city or buffet name
              </p>
            </div>
            <div className="flex justify-center">
              <SearchBar />
            </div>
          </div>
        </section>

        {/* Stats Section */}
        {summary && (
          <section className="bg-white py-8 border-b">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-4xl font-bold text-blue-600">
                    {summary.totalCities.toLocaleString()}
                  </div>
                  <div className="text-gray-600 mt-2">Cities</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-600">
                    {summary.totalBuffets.toLocaleString()}
                  </div>
                  <div className="text-gray-600 mt-2">Chinese Buffets</div>
                </div>
                <div>
                  <div className="text-4xl font-bold text-blue-600">
                    {summary.cities[0]?.buffetCount || 0}
                  </div>
                  <div className="text-gray-600 mt-2">
                    Most Buffets ({summary.cities[0]?.city || 'N/A'})
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Map Section */}
        <section className="py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Explore Chinese Buffets on the Map
              </h2>
              <p className="text-gray-600">
                Click on markers to see buffet details. Clusters show multiple buffets in the same area.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-lg p-4">
              <Map
                markers={mapMarkers}
                height="600px"
                showClusters={true}
              />
            </div>
          </div>
        </section>

        {/* Top Cities Section */}
        {summary && summary.cities.length > 0 && (
          <section className="bg-white py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Popular Cities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {summary.cities.slice(0, 12).map((city) => (
                  <Link
                    key={city.slug}
                    href={`/chinese-buffets/${city.slug}`}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-semibold text-lg text-gray-900">
                          {city.city}, {city.state}
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

        {/* Footer */}
        <footer className="bg-gray-800 text-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-gray-400">
                Chinese Buffets Directory - Find all-you-can-eat Chinese buffets across the USA
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Data updated regularly. Last updated: {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

