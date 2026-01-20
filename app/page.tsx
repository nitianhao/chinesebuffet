import { Metadata } from 'next';
import Link from 'next/link';
import SearchBar from '@/components/SearchBar';
import { getSampleBuffets } from '@/lib/data-instantdb';

export const metadata: Metadata = {
  title: 'Chinese Buffets Directory - Find All-You-Can-Eat Chinese Buffets Near You',
  description: 'Discover Chinese buffets across the USA. Find locations, hours, prices, and ratings for all-you-can-eat Chinese buffets in your city.',
};

export default async function HomePage() {
  const sampleBuffets = await getSampleBuffets(27);

  return (
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

      {/* Sample Buffets Section */}
      {sampleBuffets.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">
            Featured Buffets
          </h2>
          <div className="space-y-3">
            {sampleBuffets.map((buffet) => (
              <Link
                key={buffet.id}
                href={`/chinese-buffets/${buffet.citySlug}/${buffet.slug}`}
                className="block p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200"
              >
                <div className="text-lg font-semibold text-blue-600 hover:text-blue-800">
                  {buffet.name}
                </div>
                {buffet.address?.city && buffet.address?.state && (
                  <div className="text-sm text-gray-600 mt-1">
                    {buffet.address.city}, {buffet.address.state}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

