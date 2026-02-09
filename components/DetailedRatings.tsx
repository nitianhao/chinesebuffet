import { Review } from '@/lib/data';

interface DetailedRatingsProps {
  reviews: Review[];
}

export default function DetailedRatings({ reviews }: DetailedRatingsProps) {
  if (!reviews || reviews.length === 0) {
    return null;
  }

  // Calculate averages for Food, Service, and Atmosphere
  const ratings: Record<string, { sum: number; count: number }> = {};

  reviews.forEach((review) => {
    if (review.reviewDetailedRating) {
      Object.entries(review.reviewDetailedRating).forEach(([key, value]) => {
        if (typeof value === 'number' && value > 0) {
          if (!ratings[key]) {
            ratings[key] = { sum: 0, count: 0 };
          }
          ratings[key].sum += value;
          ratings[key].count += 1;
        }
      });
    }
  });

  const averages = Object.entries(ratings).map(([key, data]) => ({
    category: key,
    average: data.count > 0 ? data.sum / data.count : 0,
    count: data.count,
  }));

  if (averages.length === 0) {
    return null;
  }

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className={`text-lg ${
              i < Math.round(rating) ? 'text-yellow-500' : 'text-gray-300'
            }`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 bg-amber-100 rounded-lg">
            <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Rating Breakdown</h2>
        </div>
        <p className="text-sm text-gray-600 mt-2 ml-14">
          Average ratings based on {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
        </p>
      </div>
      <div className="px-4 sm:px-6 pb-5 sm:pb-6">
        <div className="space-y-4">
          {averages.map(({ category, average, count }) => (
            <div key={category} className="border-b border-gray-100 last:border-b-0 pb-4 last:pb-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900 capitalize">{category}</span>
                  <span className="text-sm text-gray-500">({count} {count === 1 ? 'rating' : 'ratings'})</span>
                </div>
                <div className="flex items-center gap-3">
                  {renderStars(average)}
                  <span className="text-lg font-bold text-gray-900 w-12 text-right">
                    {average.toFixed(1)}
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-500 h-2 rounded-full transition-all"
                  style={{ width: `${(average / 5) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
