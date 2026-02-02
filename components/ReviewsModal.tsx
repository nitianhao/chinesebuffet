'use client';

import { Review } from '@/lib/data';
import { useState, useEffect, useMemo } from 'react';

interface ReviewsModalProps {
  reviews: Review[];
  isOpen: boolean;
  onClose: () => void;
}

type SortOption = 'top-rated' | 'newest';

export default function ReviewsModal({ reviews, isOpen, onClose }: ReviewsModalProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('top-rated');

  const getProxiedImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('/')) return url;
    return url;
  };

  // Sort and filter reviews
  const filteredReviews = useMemo(() => {
    let result = [...reviews];

    // Sort reviews
    result.sort((a, b) => {
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

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((review) => {
        // Search in review text
        if (review.text?.toLowerCase().includes(query)) {
          return true;
        }
        // Search in reviewer name
        if (review.name?.toLowerCase().includes(query)) {
          return true;
        }
        // Search in review context
        if (review.reviewContext) {
          const contextValues = Object.values(review.reviewContext).join(' ').toLowerCase();
          if (contextValues.includes(query)) {
            return true;
          }
        }
        // Search in owner response
        if (review.responseFromOwnerText?.toLowerCase().includes(query)) {
          return true;
        }
        return false;
      });
    }

    return result;
  }, [reviews, searchQuery, sortOption]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setIsAnimating(true);
    } else {
      document.body.style.overflow = 'unset';
      setSearchQuery(''); // Clear search when modal closes
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 ${
        isAnimating ? 'opacity-100' : 'opacity-0'
      } transition-opacity duration-200`}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div
        className={`relative bg-white rounded-none sm:rounded-2xl shadow-2xl w-full h-full sm:h-auto sm:max-w-4xl sm:max-h-[90vh] flex flex-col ${
          isAnimating ? 'scale-100' : 'scale-95'
        } transition-transform duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 sticky top-0 bg-white rounded-t-none sm:rounded-t-2xl z-10">
          <div className="flex items-center justify-between p-4 sm:p-6 pb-3">
            <div className="flex-1 min-w-0 pr-4">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                All Reviews ({filteredReviews.length}{searchQuery && ` of ${reviews.length}`})
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">
                Customer reviews and ratings
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 p-2 hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          
          {/* Search Bar and Sort */}
          <div className="px-4 sm:px-6 pb-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-5 w-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search reviews..."
                  className="block w-full pl-10 pr-10 py-2.5 border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[#C1121F]/40 focus:border-[#C1121F]/40 text-sm sm:text-base transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    aria-label="Clear search"
                  >
                    <svg
                      className="h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 sm:w-auto">
                <label className="text-xs sm:text-sm text-gray-600 font-medium whitespace-nowrap">Sort by:</label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as SortOption)}
                  className="px-3 py-2.5 text-sm border border-[var(--border)] rounded-lg focus:ring-2 focus:ring-[#C1121F]/40 focus:border-[#C1121F]/40 bg-white text-[var(--text)] sm:min-w-[140px]"
                >
                  <option value="top-rated">Top Rated</option>
                  <option value="newest">Newest</option>
                </select>
              </div>
            </div>
            {searchQuery && (
              <p className="text-xs text-gray-500 mt-2">
                Found {filteredReviews.length} {filteredReviews.length === 1 ? 'review' : 'reviews'} matching "{searchQuery}"
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6">
          {filteredReviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <svg
                className="w-16 h-16 text-gray-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No reviews found
              </h3>
              <p className="text-gray-600 max-w-sm">
                No reviews match your search for "{searchQuery}". Try different keywords.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredReviews.map((review, index) => (
              <div
                key={review.reviewId || index}
                className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0"
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
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-gray-500 text-lg font-semibold flex items-center justify-center w-full h-full">${review.name.charAt(0).toUpperCase()}</span>`;
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-gray-500 text-lg font-semibold">
                        {review.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{review.name}</h3>
                      {review.isLocalGuide && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded">
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
                      {review.reviewImageUrls.map((imageUrl, imgIndex) => (
                        <a
                          key={imgIndex}
                          href={imageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative w-24 h-24 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--surface2)] hover:border-[#C1121F]/40 hover:shadow-md transition-all cursor-pointer group"
                        >
                          <img
                            src={getProxiedImageUrl(imageUrl)}
                            alt={`Review image ${imgIndex + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // Hide broken images immediately - no retry
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-opacity" />
                        </a>
                      ))}
                    </div>
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
                  <div className="mt-4 pl-4 border-l-4 border-[#C1121F] bg-[#C1121F]/5 rounded-r p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[var(--text)]">Owner Response</span>
                      {review.responseFromOwnerDate && (
                        <span className="text-xs text-[var(--muted)]">
                          {formatDate(review.responseFromOwnerDate)}
                        </span>
                      )}
                    </div>
                    <p className="text-[var(--text-secondary)] whitespace-pre-line text-sm">
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
                      className="text-[#C1121F] hover:text-[#7F0A12]"
                    >
                      View on Google →
                    </a>
                  )}
                </div>
              </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
