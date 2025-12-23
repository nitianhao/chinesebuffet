'use client';

import { Review } from '@/lib/data';
import { useState } from 'react';
import ReviewsModal from './ReviewsModal';

interface ReviewsProps {
  reviews: Review[];
}

type SortOption = 'top-rated' | 'newest';

export default function Reviews({ reviews }: ReviewsProps) {
  const [showModal, setShowModal] = useState(false);
  const [sortOption, setSortOption] = useState<SortOption>('top-rated');
  
  if (!reviews || reviews.length === 0) {
    return null;
  }

  // Sort reviews based on selected option
  const sortedReviews = [...reviews].sort((a, b) => {
    if (sortOption === 'top-rated') {
      // Sort by stars (highest first), then by date if same rating
      if (b.stars !== a.stars) {
        return b.stars - a.stars;
      }
      // If same rating, sort by date (newest first)
      const dateA = a.publishedAtDate ? new Date(a.publishedAtDate).getTime() : 0;
      const dateB = b.publishedAtDate ? new Date(b.publishedAtDate).getTime() : 0;
      return dateB - dateA;
    } else {
      // Sort by date (newest first)
      const dateA = a.publishedAtDate ? new Date(a.publishedAtDate).getTime() : 0;
      const dateB = b.publishedAtDate ? new Date(b.publishedAtDate).getTime() : 0;
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      // If same date, sort by rating (highest first)
      return b.stars - a.stars;
    }
  });

  const displayedReviews = sortedReviews.slice(0, 3);
  const remainingCount = sortedReviews.length - 3;

  const formatDate = (dateString?: string, publishAt?: string) => {
    if (dateString) {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });
      } catch (e) {
        return publishAt || 'Recently';
      }
    }
    return publishAt || 'Recently';
  };

  const renderStars = (stars: number) => {
    return (
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className={`text-lg ${
              i < stars ? 'text-yellow-500' : 'text-gray-300'
            }`}
          >
            ★
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                Customer Reviews ({reviews.length})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 font-medium whitespace-nowrap">Sort by:</label>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 min-h-[44px]"
              >
                <option value="top-rated">Top Rated</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-6 pb-5 sm:pb-6">
          <div className="space-y-5 sm:space-y-6">
            {displayedReviews.map((review, index) => (
            <div
              key={review.reviewId || index}
              className="border-b border-gray-200 pb-5 sm:pb-6 last:border-b-0 last:pb-0"
            >
            {/* Review Header */}
            <div className="flex items-start gap-4 mb-3">
              {review.reviewerPhotoUrl ? (
                <div className="flex-shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gray-200">
                  <img
                    src={review.reviewerPhotoUrl}
                    alt={review.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      // Fallback to initial if image fails
                      const parent = e.currentTarget.parentElement;
                      if (parent && review.name) {
                        parent.innerHTML = `<span class="text-gray-500 text-lg font-semibold flex items-center justify-center w-full h-full">${review.name.charAt(0).toUpperCase()}</span>`;
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500 text-lg font-semibold">
                    {review.name ? review.name.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{review.name || 'Anonymous'}</h3>
                  {review.isLocalGuide && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      Local Guide
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600 mb-2">
                  {renderStars(review.stars)}
                  <span className="text-gray-500">
                    {formatDate(review.publishedAtDate, review.publishAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Review Detailed Ratings */}
            {review.reviewDetailedRating && Object.keys(review.reviewDetailedRating).length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-4 text-sm">
                  {Object.entries(review.reviewDetailedRating).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="font-medium text-gray-700">{key}:</span>
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <span
                            key={i}
                            className={`text-sm ${
                              i < Math.round(value) ? 'text-yellow-500' : 'text-gray-300'
                            }`}
                          >
                            ★
                          </span>
                        ))}
                        <span className="text-gray-600 ml-1">({value}/5)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Review Text */}
            <div className="mb-3">
              <p className="text-gray-700 whitespace-pre-line leading-relaxed">
                {review.text}
              </p>
            </div>

            {/* Review Images */}
            {review.reviewImageUrls && review.reviewImageUrls.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-2">
                  {review.reviewImageUrls.slice(0, 4).map((imageUrl, imgIndex) => (
                    <a
                      key={imgIndex}
                      href={imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group"
                    >
                      <img
                        src={imageUrl}
                        alt={`Review image ${imgIndex + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          // Hide broken images
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity" />
                    </a>
                  ))}
                </div>
                {review.reviewImageUrls.length > 4 && (
                  <p className="text-xs text-gray-500 mt-2">
                    +{review.reviewImageUrls.length - 4} more {review.reviewImageUrls.length - 4 === 1 ? 'image' : 'images'}
                  </p>
                )}
              </div>
            )}

            {/* Review Context */}
            {review.reviewContext && Object.keys(review.reviewContext).length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(review.reviewContext).map(([key, value]) => (
                  <span
                    key={key}
                    className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                  >
                    {key}: {value}
                  </span>
                ))}
              </div>
            )}

            {/* Owner Response */}
            {review.responseFromOwnerText && (
              <div className="mt-4 pl-4 border-l-4 border-blue-500 bg-blue-50 rounded-r p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-blue-900">Owner Response</span>
                  {review.responseFromOwnerDate && (
                    <span className="text-xs text-blue-700">
                      {formatDate(review.responseFromOwnerDate)}
                    </span>
                  )}
                </div>
                <p className="text-blue-800 whitespace-pre-line text-sm">
                  {review.responseFromOwnerText}
                </p>
              </div>
            )}

            {/* Review Metadata */}
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              {review.likesCount !== undefined && review.likesCount > 0 && (
                <span>👍 {review.likesCount} helpful</span>
              )}
              {review.reviewerNumberOfReviews !== undefined && (
                <span>{review.reviewerNumberOfReviews} reviews</span>
              )}
              {review.reviewUrl && (
                <a
                  href={review.reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  View on Google →
                </a>
              )}
            </div>
          </div>
            ))}
          </div>
          
          {/* Show More Button */}
          {remainingCount > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-200 flex justify-center">
              <button
                onClick={() => setShowModal(true)}
                className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-xl shadow-md hover:shadow-xl transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 min-h-[48px] text-base"
              >
              <span>Show All {reviews.length} Reviews</span>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        )}
        </div>
      </section>

      {/* Reviews Modal */}
      <ReviewsModal
        reviews={sortedReviews}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}
