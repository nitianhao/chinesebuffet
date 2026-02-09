'use client';

import { useState, useEffect } from 'react';
import SafeImage from './SafeImage';
import DeferredSection from './DeferredSection';

interface Review {
  reviewId?: string;
  name?: string;
  author?: string;
  reviewerPhotoUrl?: string;
  reviewerNumberOfReviews?: number;
  isLocalGuide?: boolean;
  stars?: number;
  rating?: number;
  text?: string;
  textTranslated?: string;
  publishAt?: string;
  relativeTime?: string;
  visitedIn?: string;
  likesCount?: number;
  responseFromOwnerText?: string;
  responseFromOwnerDate?: string;
  reviewImageUrls?: string[];
}

interface ReviewsListProps {
  reviews: Review[];
}

export default function ReviewsList({ reviews }: ReviewsListProps) {
  const [showModal, setShowModal] = useState(false);
  const INITIAL_DISPLAYED = 10; // Show first 10 reviews immediately
  const initialReviews = reviews.slice(0, INITIAL_DISPLAYED);
  const deferredReviews = reviews.slice(INITIAL_DISPLAYED);
  const hasMore = reviews.length > INITIAL_DISPLAYED;

  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showModal]);

  const getProxiedImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('/')) return url;
    return url;
  };

  const renderReview = (review: Review, index: number) => (
    <div key={review.reviewId || index} className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {review.reviewerPhotoUrl ? (
            <SafeImage
              src={getProxiedImageUrl(review.reviewerPhotoUrl)}
              alt={review.name || 'Reviewer'}
              className="w-10 h-10 rounded-full object-cover"
              width={40}
              height={40}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              <span className="text-gray-500 text-sm font-semibold">
                {(review.name || review.author || '?').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <div>
            <div className="font-semibold text-gray-900">{review.name || review.author || 'Anonymous'}</div>
            {review.reviewerNumberOfReviews && (
              <div className="text-sm text-gray-500">{review.reviewerNumberOfReviews} reviews</div>
            )}
            {review.isLocalGuide && (
              <div className="text-xs text-[var(--accent1)] font-medium">Local Guide</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={`w-5 h-5 ${i < (review.stars || review.rating || 0) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                viewBox="0 0 20 20"
              >
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
            ))}
          </div>
          {(review.rating || review.stars) && (
            <span className="text-gray-700 font-medium">
              {review.rating || review.stars}
            </span>
          )}
        </div>
      </div>
      {review.text && (
        <p className="text-gray-700 mb-3">{review.text}</p>
      )}
      {review.textTranslated && review.textTranslated !== review.text && (
        <p className="text-gray-500 text-sm italic mb-3">{review.textTranslated}</p>
      )}
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
        {review.publishAt && (
          <span>{new Date(review.publishAt).toLocaleDateString()}</span>
        )}
        {review.relativeTime && (
          <span>{review.relativeTime}</span>
        )}
        {review.visitedIn && (
          <span>Visited in {review.visitedIn}</span>
        )}
        {review.likesCount && review.likesCount > 0 && (
          <span className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
            </svg>
            {review.likesCount}
          </span>
        )}
      </div>
      {review.responseFromOwnerText && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-sm font-semibold text-gray-700 mb-1">Owner Response</div>
          <p className="text-gray-600 text-sm">{review.responseFromOwnerText}</p>
          {review.responseFromOwnerDate && (
            <div className="text-xs text-gray-500 mt-1">
              {new Date(review.responseFromOwnerDate).toLocaleDateString()}
            </div>
          )}
        </div>
      )}
      {review.reviewImageUrls && Array.isArray(review.reviewImageUrls) && review.reviewImageUrls.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto">
          {review.reviewImageUrls.map((imgUrl: string, imgIndex: number) => (
            <a
              key={imgIndex}
              href={imgUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 hover:border-[var(--accent1)] hover:shadow-md transition-all cursor-pointer group flex-shrink-0"
            >
              <img
                src={getProxiedImageUrl(imgUrl)}
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
      )}
    </div>
  );

  // Compute summary for deferred reviews section
  const deferredReviewsSummary = (() => {
    if (deferredReviews.length === 0) return null;
    
    // Calculate rating range safely
    const ratings = deferredReviews
      .map(r => r.rating || r.stars)
      .filter((r): r is number => typeof r === 'number' && r > 0);
    
    const ratingText = ratings.length > 0
      ? ` Rating range: ${Math.min(...ratings)} to ${Math.max(...ratings)} stars.`
      : '';
    
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <p className="text-gray-700 leading-relaxed">
          {deferredReviews.length} additional review{deferredReviews.length === 1 ? '' : 's'} available.{ratingText}
        </p>
      </div>
    );
  })();

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Recent Reviews</h3>
        <div className="space-y-4">
          {initialReviews.map((review, index) => (
            <div key={review.reviewId || index}>
              {renderReview(review, index)}
            </div>
          ))}
        </div>
        
        {/* Deferred reviews section */}
        {hasMore && (
          <DeferredSection
            id="reviews-deferred"
            summary={deferredReviewsSummary}
            threshold={800}
          >
            <div className="space-y-4 mt-4">
              {deferredReviews.map((review, index) => (
                <div key={review.reviewId || INITIAL_DISPLAYED + index}>
                  {renderReview(review, INITIAL_DISPLAYED + index)}
                </div>
              ))}
            </div>
          </DeferredSection>
        )}
        
        {/* Show All button (for modal) */}
        {hasMore && (
          <div className="pt-6 flex justify-center">
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-[var(--accent1)] hover:bg-[var(--accent2)] text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2"
            >
              <span>Show All {reviews.length} Reviews in Modal</span>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          
          {/* Modal Content */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">
                  All Reviews ({reviews.length})
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
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
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-6">
              <div className="space-y-4">
                {reviews.map((review, index) => (
                  <div key={review.reviewId || index}>
                    {renderReview(review, index)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
