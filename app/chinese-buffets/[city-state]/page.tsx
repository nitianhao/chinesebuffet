import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BuffetCard from '@/components/BuffetCard';
import Map from '@/components/MapWrapper';
import SchemaMarkup from '@/components/SchemaMarkup';
import { getCityBySlug, getAllCitySlugs } from '@/lib/data';

interface CityPageProps {
  params: {
    'city-state': string;
  };
}

export async function generateStaticParams() {
  const citySlugs = getAllCitySlugs();
  return citySlugs.map((slug) => ({
    'city-state': slug,
  }));
}

export async function generateMetadata({ params }: CityPageProps): Promise<Metadata> {
  const city = getCityBySlug(params['city-state']);
  
  if (!city) {
    return {
      title: 'City Not Found',
    };
  }

  return {
    title: `Chinese Buffets in ${city.city}, ${city.state} - ${city.buffets.length} Locations`,
    description: `Find ${city.buffets.length} Chinese buffets in ${city.city}, ${city.state}. Compare hours, prices, ratings, and locations. Map included.`,
  };
}

export default function CityPage({ params }: CityPageProps) {
  const city = getCityBySlug(params['city-state']);

  if (!city) {
    notFound();
  }

  // Sort buffets by rating (highest first)
  const sortedBuffets = [...city.buffets].sort((a, b) => 
    (b.rating || 0) - (a.rating || 0)
  );

  // Get top 5 buffets for highlights
  const topBuffets = sortedBuffets.slice(0, 5);

  // Create map markers
  const mapMarkers = city.buffets.map(buffet => ({
    id: buffet.id,
    name: buffet.name,
    lat: buffet.location.lat,
    lng: buffet.location.lng,
    rating: buffet.rating,
    citySlug: params['city-state'],
    slug: buffet.slug,
  }));

  // Generate city-specific content
  const introContent = generateCityIntro(city);
  const faqs = generateCityFAQs(city);

  return (
    <>
      <SchemaMarkup type="city" data={city} citySlug={params['city-state']} />
      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map(faq => ({
                '@type': 'Question',
                name: faq.question,
                acceptedAnswer: {
                  '@type': 'Answer',
                  text: faq.answer,
                },
              })),
            }),
          }}
        />
      )}
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <nav className="text-sm text-gray-600 mb-4">
              <Link href="/" className="hover:text-blue-600">Home</Link>
              <span className="mx-2">/</span>
              <Link 
                href={`/chinese-buffets/${city.state.toLowerCase().replace(/\s+/g, '-')}`}
                className="hover:text-blue-600"
              >
                Chinese Buffets in {city.state}
              </Link>
              <span className="mx-2">/</span>
              <span className="text-gray-900">{city.city}</span>
            </nav>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">
              Chinese Buffets in {city.city}, {city.state}
            </h1>
            <p className="text-lg text-gray-600">
              {city.buffets.length} {city.buffets.length === 1 ? 'location' : 'locations'} found
            </p>
          </div>
        </header>

        {/* Summary Block */}
        <section className="bg-blue-50 py-6 border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 shadow-sm">
                <div className="text-sm text-gray-600 mb-1">Total Buffets</div>
                <div className="text-2xl font-bold text-blue-600">{city.buffets.length}</div>
              </div>
              {topBuffets.length > 0 && topBuffets[0] && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="text-sm text-gray-600 mb-1">Top Rated</div>
                  <div className="text-lg font-semibold">{topBuffets[0].name}</div>
                  <div className="text-sm text-gray-600">⭐ {topBuffets[0].rating.toFixed(1)}</div>
                </div>
              )}
              {city.buffets.some(b => b.price) && (
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="text-sm text-gray-600 mb-1">Price Range</div>
                  <div className="text-lg font-semibold">
                    {(() => {
                      const prices = city.buffets
                        .map(b => b.price)
                        .filter(Boolean)
                        .map(p => {
                          const match = p?.match(/\$(\d+)/);
                          return match ? parseInt(match[1]) : null;
                        })
                        .filter((p): p is number => p !== null);
                      if (prices.length > 0) {
                        const min = Math.min(...prices);
                        const max = Math.max(...prices);
                        return min === max ? `$${min}` : `$${min}-$${max}`;
                      }
                      return 'Varies';
                    })()}
                  </div>
                </div>
              )}
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

        {/* Top Picks Section */}
        {topBuffets.length > 0 && (
          <section className="bg-blue-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Top Rated Chinese Buffets in {city.city}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {topBuffets.map((buffet) => (
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
              Map of Chinese Buffets in {city.city}
            </h2>
            <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
              <Map
                markers={mapMarkers}
                center={[
                  city.buffets[0]?.location.lat || 0,
                  city.buffets[0]?.location.lng || 0,
                ]}
                zoom={12}
                height="500px"
                showClusters={city.buffets.length > 10}
              />
            </div>
          </div>
        </section>

        {/* All Buffets Section */}
        <section className="bg-white py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              All Chinese Buffets in {city.city}, {city.state}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedBuffets.map((buffet) => (
                <BuffetCard
                  key={buffet.id}
                  buffet={buffet}
                  citySlug={params['city-state']}
                />
              ))}
            </div>
          </div>
        </section>

        {/* FAQs Section */}
        {faqs.length > 0 && (
          <section className="bg-gray-50 py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-6">
                {faqs.map((faq, index) => (
                  <div key={index} className="bg-white rounded-lg p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {faq.question}
                    </h3>
                    <p className="text-gray-700">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Nearby Cities Section */}
        <section className="bg-white py-8 border-t">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              More Chinese Buffets Nearby
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {getNearbyCities(city, getAllCitySlugs(), getCityBySlug).map((nearbyCity) => (
                <Link
                  key={nearbyCity.slug}
                  href={`/chinese-buffets/${nearbyCity.slug}`}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        {nearbyCity.city}, {nearbyCity.state}
                      </h3>
                      <p className="text-gray-600 text-sm mt-1">
                        {nearbyCity.buffetCount} {nearbyCity.buffetCount === 1 ? 'buffet' : 'buffets'}
                      </p>
                    </div>
                    <span className="text-blue-600">→</span>
                  </div>
                </Link>
              ))}
            </div>
            <p className="text-gray-600">
              <Link href="/" className="text-blue-600 hover:text-blue-800">
                Browse all cities →
              </Link>
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

// Generate city-specific intro content
function generateCityIntro(city: ReturnType<typeof getCityBySlug>) {
  if (!city) return [];
  
  const paragraphs = [
    `Looking for Chinese buffets in ${city.city}, ${city.state}? You've come to the right place. Our directory features ${city.buffets.length} ${city.buffets.length === 1 ? 'Chinese buffet' : 'Chinese buffets'} in ${city.city}, offering all-you-can-eat dining experiences throughout the city.`,
  ];

  if (city.buffets.length > 5) {
    paragraphs.push(
      `With ${city.buffets.length} locations to choose from, ${city.city} offers plenty of options for Chinese buffet enthusiasts. Whether you're looking for a quick lunch buffet or a full dinner experience with crab legs and sushi, you'll find diverse options across the city.`
    );
  }

  if (city.population > 500000) {
    paragraphs.push(
      `As one of the larger cities in ${city.state} with a population of over ${(city.population / 1000000).toFixed(1)} million, ${city.city} has a vibrant dining scene. The Chinese buffets here cater to a wide range of tastes and budgets, from budget-friendly options to more upscale establishments.`
    );
  }

  paragraphs.push(
    `Use the map above to find Chinese buffets near you, or browse through our detailed listings below. Each listing includes hours, prices, ratings, and contact information to help you plan your visit.`
  );

  return paragraphs;
}

// Generate city-specific FAQs
function generateCityFAQs(city: ReturnType<typeof getCityBySlug>) {
  if (!city) return [];

  const faqs = [];

  // Average price FAQ
  const prices = city.buffets
    .map(b => b.price)
    .filter(Boolean)
    .map(p => {
      const match = p?.match(/\$(\d+)/);
      return match ? parseInt(match[1]) : null;
    })
    .filter((p): p is number => p !== null);

  if (prices.length > 0) {
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    faqs.push({
      question: `How much does a Chinese buffet cost in ${city.city}?`,
      answer: `The average price for Chinese buffets in ${city.city} ranges from $${Math.floor(avgPrice)} to $${Math.ceil(avgPrice + 5)}. Most buffets offer lunch and dinner pricing, with lunch typically being more affordable. Weekend and dinner prices are usually higher.`,
    });
  }

  // Hours FAQ
  faqs.push({
    question: `What are the typical hours for Chinese buffets in ${city.city}?`,
    answer: `Most Chinese buffets in ${city.city} are open daily, typically from 11 AM to 9-10 PM. Many locations offer lunch service from 11 AM to 3 PM, followed by dinner service. Some buffets may have extended hours on weekends. Check individual listings for specific hours.`,
  });

  // Best rated FAQ
  if (city.buffets.length > 0) {
    const topRated = [...city.buffets]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
    
    if (topRated && topRated.rating > 4) {
      faqs.push({
        question: `What is the highest-rated Chinese buffet in ${city.city}?`,
        answer: `${topRated.name} is currently the highest-rated Chinese buffet in ${city.city} with a ${topRated.rating.toFixed(1)}-star rating based on ${topRated.reviewsCount.toLocaleString()} reviews.`,
      });
    }
  }

  // Variety FAQ
  faqs.push({
    question: `Do Chinese buffets in ${city.city} offer variety beyond Chinese food?`,
    answer: `Many Chinese buffets in ${city.city} feature extensive buffets that include sushi bars, Mongolian grills, American food sections, and dessert bars. Some locations also offer special items like crab legs on weekends. Check individual listings for specific features.`,
  });

  return faqs;
}

// Get nearby cities (same state, or other cities with buffets)
function getNearbyCities(
  currentCity: ReturnType<typeof getCityBySlug>,
  allCitySlugs: string[],
  getCityFn: typeof getCityBySlug
): Array<{ slug: string; city: string; state: string; buffetCount: number }> {
  if (!currentCity) return [];
  
  const nearby: Array<{ slug: string; city: string; state: string; buffetCount: number; isSameState: boolean }> = [];
  
  // Get other cities, prioritizing same state
  allCitySlugs.forEach(slug => {
    if (slug === currentCity.slug) return;
    const city = getCityFn(slug);
    if (!city || !city.buffets || city.buffets.length === 0) return;
    
    nearby.push({
      slug: city.slug,
      city: city.city,
      state: city.state,
      buffetCount: city.buffets.length,
      isSameState: city.state === currentCity.state,
    });
  });
  
  // Sort: same state first, then by buffet count
  nearby.sort((a, b) => {
    if (a.isSameState && !b.isSameState) return -1;
    if (!a.isSameState && b.isSameState) return 1;
    return b.buffetCount - a.buffetCount;
  });
  
  return nearby.slice(0, 6).map(({ isSameState, ...rest }) => rest);
}

