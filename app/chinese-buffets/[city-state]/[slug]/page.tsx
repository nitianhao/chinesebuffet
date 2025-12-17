import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BuffetCard from '@/components/BuffetCard';
import Map from '@/components/MapWrapper';
import SchemaMarkup from '@/components/SchemaMarkup';
import Reviews from '@/components/Reviews';
import ImageGallery from '@/components/ImageGallery';
import ReviewsDistribution from '@/components/ReviewsDistribution';
import ReviewsTags from '@/components/ReviewsTags';
import PopularTimes from '@/components/PopularTimes';
import ServiceOptions from '@/components/ServiceOptions';
import QuestionsAndAnswers from '@/components/QuestionsAndAnswers';
import OwnerUpdates from '@/components/OwnerUpdates';
import Menu from '@/components/Menu';
import DetailedRatings from '@/components/DetailedRatings';
import { getBuffetBySlug, getCityBySlug, getNearbyBuffets } from '@/lib/data';
import { formatAddress, formatPhoneNumber } from '@/lib/utils';
import { generateExpandedDescription } from '@/lib/generateDescription';

interface BuffetPageProps {
  params: {
    'city-state': string;
    slug: string;
  };
}

export async function generateStaticParams() {
  const { getBuffetsByCity } = await import('@/lib/data');
  const buffetsByCity = getBuffetsByCity();
  const params: Array<{ 'city-state': string; slug: string }> = [];
  
  for (const city of Object.values(buffetsByCity)) {
    for (const buffet of city.buffets) {
      params.push({
        'city-state': city.slug,
        slug: buffet.slug,
      });
    }
  }
  
  return params;
}

export async function generateMetadata({ params }: BuffetPageProps): Promise<Metadata> {
  const buffet = getBuffetBySlug(params['city-state'], params.slug);
  
  if (!buffet) {
    return {
      title: 'Buffet Not Found',
    };
  }

  return {
    title: `${buffet.name} - Chinese Buffet in ${buffet.address.city}, ${buffet.address.state}`,
    description: `${buffet.name} is a Chinese buffet in ${buffet.address.city}, ${buffet.address.state}. ${buffet.rating > 0 ? `Rated ${buffet.rating.toFixed(1)} stars` : ''} ${buffet.reviewsCount > 0 ? `with ${buffet.reviewsCount.toLocaleString()} reviews` : ''}. Find hours, prices, and location information.`,
  };
}

export default function BuffetPage({ params }: BuffetPageProps) {
  const buffet = getBuffetBySlug(params['city-state'], params.slug);
  const city = getCityBySlug(params['city-state']);

  if (!buffet || !city) {
    notFound();
  }

  // Get nearby buffets
  const nearbyBuffets = getNearbyBuffets(
    buffet.location.lat,
    buffet.location.lng,
    10,
    buffet.id
  ).slice(0, 6);

  // Create map markers (this buffet + nearby)
  const mapMarkers = [
    {
      id: buffet.id,
      name: buffet.name,
      lat: buffet.location.lat,
      lng: buffet.location.lng,
      rating: buffet.rating,
      citySlug: params['city-state'],
      slug: buffet.slug,
    },
    ...nearbyBuffets.map(b => ({
      id: b.id,
      name: b.name,
      lat: b.location.lat,
      lng: b.location.lng,
      rating: b.rating,
      citySlug: b.citySlug || params['city-state'],
      slug: b.slug,
    })),
  ];

  return (
      <>
        <SchemaMarkup type="buffet" data={buffet} citySlug={params['city-state']} />
      
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Breadcrumbs */}
            <div className="pt-5 pb-4">
              <nav className="flex items-center gap-2 text-sm">
                <Link 
                  href="/" 
                  className="text-gray-500 hover:text-gray-900 transition-colors inline-flex items-center gap-1.5 group"
                >
                  <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <span className="font-medium">Home</span>
                </Link>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <Link 
                  href={`/chinese-buffets/${params['city-state']}`}
                  className="text-gray-500 hover:text-gray-900 transition-colors truncate font-medium"
                >
                  {city.city}, {city.state}
                </Link>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-gray-900 font-semibold truncate">{buffet.name}</span>
              </nav>
            </div>

            {/* Hero Section */}
            <div className="pb-8">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6 leading-tight tracking-tight">
                {buffet.name}
              </h1>
              
              {/* Key Info Cards */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Rating Card */}
                {buffet.rating > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-br from-yellow-50 to-orange-50 border border-yellow-200 rounded-xl shadow-sm">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <svg
                          key={i}
                          className={`w-5 h-5 ${
                            i < Math.floor(buffet.rating)
                              ? 'text-yellow-500 fill-yellow-500'
                              : i < buffet.rating
                              ? 'text-yellow-500 fill-yellow-500 opacity-60'
                              : 'text-gray-300'
                          }`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      ))}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-bold text-gray-900">{buffet.rating.toFixed(1)}</span>
                      {buffet.reviewsCount > 0 && (
                        <span className="text-sm text-gray-600 font-medium">
                          ({buffet.reviewsCount.toLocaleString()})
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Price Card */}
                {buffet.price && (
                  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl shadow-sm">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-lg font-bold text-gray-900">{buffet.price}</span>
                  </div>
                )}

                {/* Location Card */}
                {buffet.neighborhood && (
                  <div className="flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-sm">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-700">{buffet.neighborhood}</span>
                  </div>
                )}

                {/* Category Badge */}
                {buffet.categoryName && (
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl">
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700">{buffet.categoryName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="space-y-4 sm:space-y-6">
              {/* Map */}
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Location</h2>
                  </div>
                </div>
                <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                  <div className="rounded-xl overflow-hidden border border-gray-200 mb-4">
                    <Map
                      markers={mapMarkers}
                      center={[buffet.location.lat, buffet.location.lng]}
                      zoom={14}
                      height="300px"
                      showClusters={false}
                    />
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${buffet.location.lat},${buffet.location.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all active:scale-95"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <span>Get Directions</span>
                  </a>
                </div>
              </section>

              {/* Description */}
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">About {buffet.name}</h2>
                  </div>
                </div>
                <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                  {buffet.subTitle && (
                    <p className="text-base sm:text-lg text-gray-600 mb-4 font-medium italic border-l-4 border-purple-200 pl-4">
                      {buffet.subTitle}
                    </p>
                  )}
                  <div className="prose prose-sm sm:prose-base text-gray-700 max-w-none">
                    <p className="text-gray-700 leading-relaxed text-base sm:text-lg">
                      {generateExpandedDescription(buffet)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Image Gallery */}
              {buffet.imageUrls && buffet.imageUrls.length > 0 && (
                <ImageGallery images={buffet.imageUrls} buffetName={buffet.name} />
              )}

              {/* Contact Information & Hours */}
              <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Contact & Hours</h2>
                  </div>
                </div>
                <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    {/* Contact Information */}
                    <div className="space-y-4">
                      {/* Address */}
                      <div className="p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-blue-100 flex items-center justify-center">
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-900 block mb-2 text-sm sm:text-base">Address</span>
                            <p className="text-gray-700 text-base sm:text-lg mb-2 leading-relaxed">
                              {formatAddress(buffet.address)}
                            </p>
                            {buffet.locatedIn && (
                              <p className="text-sm text-gray-500 mb-1.5">
                                {buffet.locatedIn}
                              </p>
                            )}
                            {buffet.plusCode && (
                              <p className="text-xs text-gray-400 mb-3">
                                Plus Code: {buffet.plusCode}
                              </p>
                            )}
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(buffet.address))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm sm:text-base transition-colors active:scale-95 min-h-[44px] shadow-sm"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span>View on Maps</span>
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Phone */}
                      {buffet.phone && (
                        <a
                          href={`tel:${buffet.phoneUnformatted || buffet.phone.replace(/\D/g, '')}`}
                          className="flex items-center gap-4 p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-green-50 hover:border-green-200 transition-all active:scale-[0.98] min-h-[72px]"
                        >
                          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-green-100 flex items-center justify-center">
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-900 block mb-1 text-sm sm:text-base">Phone</span>
                            <p className="text-lg sm:text-xl font-bold text-gray-900">{formatPhoneNumber(buffet.phone)}</p>
                          </div>
                          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </a>
                      )}

                      {/* Email */}
                      {buffet.email && (
                        <a
                          href={`mailto:${buffet.email}`}
                          className="flex items-center gap-4 p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-purple-50 hover:border-purple-200 transition-all active:scale-[0.98] min-h-[72px]"
                        >
                          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-100 flex items-center justify-center">
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-900 block mb-1 text-sm sm:text-base">Email</span>
                            <p className="text-base sm:text-lg font-semibold text-gray-700 truncate">{buffet.email}</p>
                          </div>
                          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        </a>
                      )}

                      {/* Website */}
                      {buffet.website && (
                        <a
                          href={buffet.website.startsWith('http') ? buffet.website : `https://${buffet.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-4 p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-100 hover:bg-orange-50 hover:border-orange-200 transition-all active:scale-[0.98] min-h-[72px]"
                        >
                          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-orange-100 flex items-center justify-center">
                            <svg className="w-6 h-6 sm:w-7 sm:h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-gray-900 block mb-1 text-sm sm:text-base">Website</span>
                            <p className="text-base sm:text-lg font-semibold text-gray-700 truncate">{buffet.website.replace(/^https?:\/\//, '')}</p>
                          </div>
                          <svg className="w-6 h-6 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}

                      {/* Table Reservations */}
                      {(buffet.reserveTableUrl || (buffet.tableReservationLinks && buffet.tableReservationLinks.length > 0)) && (
                        <div className="p-4 sm:p-5 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-start gap-3 sm:gap-4 mb-4">
                            <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-pink-100 flex items-center justify-center">
                              <svg className="w-6 h-6 sm:w-7 sm:h-7 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <span className="font-bold text-gray-900 block mb-3 text-sm sm:text-base">Reserve a Table</span>
                              <div className="space-y-2.5">
                                {buffet.reserveTableUrl && (
                                  <a 
                                    href={buffet.reserveTableUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 bg-pink-600 hover:bg-pink-700 text-white font-semibold rounded-xl text-base transition-colors active:scale-95 w-full sm:w-auto min-h-[48px] shadow-sm"
                                  >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span>Book Table</span>
                                  </a>
                                )}
                                {buffet.tableReservationLinks && buffet.tableReservationLinks.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {buffet.tableReservationLinks.map((link, index) => (
                                      <a
                                        key={index}
                                        href={link.url || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border-2 border-pink-200 hover:bg-pink-50 hover:border-pink-300 text-pink-700 font-semibold rounded-xl text-sm sm:text-base transition-all active:scale-95 min-h-[44px]"
                                      >
                                        {link.name || 'Reserve'}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Order Online */}
                      {(buffet.orderBy && buffet.orderBy.length > 0) || buffet.googleFoodUrl ? (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <span className="font-bold text-gray-900 block mb-2 text-sm">Order Online</span>
                              <div className="space-y-2">
                                {buffet.orderBy && buffet.orderBy.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {buffet.orderBy.map((order, index) => (
                                      <a
                                        key={index}
                                        href={order.orderUrl || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors active:scale-95 shadow-sm"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                        <span>{order.name || 'Order'}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {buffet.googleFoodUrl && (
                                  <a 
                                    href={buffet.googleFoodUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-red-300 hover:bg-red-50 text-red-700 font-semibold rounded-lg text-sm transition-colors active:scale-95 w-full sm:w-auto justify-center"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                    </svg>
                                    <span>Google Food</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* Related Links */}
                      {buffet.webResults && buffet.webResults.length > 0 && (
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-start gap-3 mb-3">
                            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <span className="font-bold text-gray-900 block mb-2 text-sm">Order Online & Menu</span>
                              <div className="space-y-2">
                                {buffet.webResults.map((result, index) => {
                                  const getIcon = (url: string) => {
                                    const lowerUrl = url.toLowerCase();
                                    if (lowerUrl.includes('facebook')) {
                                      return (
                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                        </svg>
                                      );
                                    }
                                    if (lowerUrl.includes('doordash') || lowerUrl.includes('uber') || lowerUrl.includes('grubhub')) {
                                      return (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                      );
                                    }
                                    return (
                                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    );
                                  };
                                  
                                  return (
                                    <a
                                      key={index}
                                      href={result.url || '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-3 p-3 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-300 rounded-lg transition-all active:scale-[0.98]"
                                    >
                                      <span className="text-indigo-600 flex-shrink-0">{getIcon(result.url || '')}</span>
                                      <span className="flex-1 font-medium text-gray-900 text-sm truncate">{result.title || 'External Link'}</span>
                                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Hours */}
                    {buffet.hours && buffet.hours.length > 0 && (
                      <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Hours of Operation</h2>
                        </div>
                        <div className="space-y-2">
                          {buffet.hours.map((hour, index) => (
                            <div key={index} className="flex justify-between items-center py-3 px-3 bg-white rounded-lg border border-gray-100">
                              <span className="font-semibold text-gray-900 text-base">{hour.day}</span>
                              <span className="text-gray-700 font-medium text-base">{hour.hours}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Popular Times */}
              {buffet.popularTimesHistogram && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-rose-100 rounded-lg">
                        <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">When is it busy?</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <PopularTimes
                      histogram={buffet.popularTimesHistogram}
                      liveText={buffet.popularTimesLiveText}
                      livePercent={buffet.popularTimesLivePercent}
                    />
                  </div>
                </section>
              )}

              {/* Service Options */}
              {buffet.additionalInfo && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-teal-100 rounded-lg">
                        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Service Options & Amenities</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <ServiceOptions additionalInfo={buffet.additionalInfo} />
                  </div>
                </section>
              )}

              {/* Owner Updates */}
              {buffet.ownerUpdates && buffet.ownerUpdates.length > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-cyan-100 rounded-lg">
                        <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Updates from Business</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <OwnerUpdates updates={buffet.ownerUpdates} />
                  </div>
                </section>
              )}

              {/* Questions & Answers */}
              {buffet.questionsAndAnswers && Array.isArray(buffet.questionsAndAnswers) && buffet.questionsAndAnswers.length > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-violet-100 rounded-lg">
                        <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Questions & Answers</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <QuestionsAndAnswers qna={buffet.questionsAndAnswers} />
                  </div>
                </section>
              )}

              {/* Menu */}
              {buffet.menu && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-emerald-100 rounded-lg">
                        <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Menu</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <Menu menu={buffet.menu} />
                  </div>
                </section>
              )}

              {/* Reviews Distribution */}
              {buffet.reviewsDistribution && buffet.reviewsCount > 0 && (
                <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-yellow-100 rounded-lg">
                        <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Rating Distribution</h2>
                    </div>
                  </div>
                  <div className="px-4 sm:px-6 pb-5 sm:pb-6">
                    <ReviewsDistribution 
                      distribution={buffet.reviewsDistribution} 
                      totalReviews={buffet.reviewsCount}
                    />
                  </div>
                </section>
              )}

              {/* Detailed Ratings (Food/Service/Atmosphere) */}
              {buffet.reviews && buffet.reviews.length > 0 && (
                <DetailedRatings reviews={buffet.reviews} />
              )}

              {/* Reviews */}
              {buffet.reviews && buffet.reviews.length > 0 && (
                <Reviews reviews={buffet.reviews} />
              )}

              {/* Web Results (External Links) */}
          </div>

          {/* Nearby Buffets */}
          {nearbyBuffets.length > 0 && (
            <section className="mt-6 sm:mt-8">
              <div className="flex items-center gap-3 mb-5 sm:mb-6">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Other Chinese Buffets Nearby
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {nearbyBuffets.map((nearbyBuffet) => (
                  <BuffetCard
                    key={nearbyBuffet.id}
                    buffet={nearbyBuffet}
                    citySlug={nearbyBuffet.citySlug || params['city-state']}
                    showDistance={true}
                    distance={calculateDistance(
                      buffet.location.lat,
                      buffet.location.lng,
                      nearbyBuffet.location.lat,
                      nearbyBuffet.location.lng
                    )}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

