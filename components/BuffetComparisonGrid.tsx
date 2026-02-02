import Link from 'next/link';
import SafeImage from './SafeImage';

interface BuffetComparisonItem {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  rating: number;
  reviewsCount?: number;
  price?: string | null;
  distance: number; // in miles
  imageUrl?: string;
}

interface BuffetComparisonGridProps {
  buffets: BuffetComparisonItem[];
}

/**
 * Format distance for display
 */
function formatDistance(miles: number): string {
  if (miles < 0.1) {
    return '< 0.1 mi';
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * Format price range
 */
function formatPrice(price: string | null | undefined): string {
  if (!price) return 'Price not shown';
  return price;
}

export default function BuffetComparisonGrid({ buffets }: BuffetComparisonGridProps) {
  if (!buffets || buffets.length === 0) {
    return null;
  }

  return (
    <section id="related-buffets" className="mb-8 scroll-mt-24">
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="bg-white px-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900">Compare with similar Chinese buffets nearby</h2>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 md:p-6">
          {buffets.map((buffet) => (
            <Link
              key={buffet.id}
              href={`/chinese-buffets/${buffet.citySlug}/${buffet.slug}`}
              className="group bg-[var(--surface)] rounded-lg border border-[var(--border)] p-4 hover:border-[#C1121F]/40 hover:shadow-md transition-all"
            >
              <div className="flex flex-col h-full">
                {/* Buffet Name */}
                <h3 className="font-semibold text-[var(--text)] mb-3 line-clamp-2 group-hover:text-[#C1121F] transition-colors">
                  {buffet.name}
                </h3>

                {/* Rating and Reviews */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.round(buffet.rating)
                            ? 'text-yellow-400 fill-current'
                            : 'text-gray-300'
                        }`}
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {buffet.rating.toFixed(1)}
                  </span>
                  {buffet.reviewsCount && buffet.reviewsCount > 0 && (
                    <span className="text-xs text-gray-500">
                      ({buffet.reviewsCount.toLocaleString()})
                    </span>
                  )}
                </div>

                {/* Distance */}
                <div className="flex items-center gap-2 mb-3 text-sm text-gray-600">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{formatDistance(buffet.distance)}</span>
                </div>

                {/* Price Range */}
                <div className="flex items-center gap-2 text-sm text-gray-600 mt-auto">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className={buffet.price ? 'font-medium text-gray-700' : 'text-gray-500'}>
                    {formatPrice(buffet.price)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
