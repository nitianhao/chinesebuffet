'use client';

import dynamic from 'next/dynamic';
import DeferredClient from './DeferredClient';

// Dynamically import ReviewsSection to reduce initial bundle
const ReviewsSection = dynamic(() => import('./ReviewsSection'), {
  ssr: false,
  loading: () => <ReviewsPlaceholder />,
});

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

interface DeferredReviewsProps {
  reviews?: Review[];
  reviewsCount?: number;
  reviewsDistribution?: {
    oneStar?: number;
    twoStar?: number;
    threeStar?: number;
    fourStar?: number;
    fiveStar?: number;
    [key: string]: any;
  };
  reviewsTags?: Array<{
    title: string;
    count?: number;
  }>;
}

/**
 * Server-rendered placeholder showing review summary stats.
 * This is immediately visible and crawlable.
 */
function ReviewsPlaceholder({ reviewsCount, reviewsDistribution }: Partial<DeferredReviewsProps>) {
  const total = reviewsCount || 0;
  const fiveStarCount = reviewsDistribution?.fiveStar || reviewsDistribution?.['5'] || 0;
  const fourStarCount = reviewsDistribution?.fourStar || reviewsDistribution?.['4'] || 0;
  const positivePercent = total > 0 
    ? Math.round(((fiveStarCount + fourStarCount) / total) * 100) 
    : 0;

  return (
    <section id="reviews" className="mb-6 scroll-mt-24">
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex items-center justify-center">
          <div className="bg-white px-4 flex items-center gap-3">
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <h2 className="text-2xl font-bold text-gray-900">
              Reviews {total > 0 ? `(${total.toLocaleString()})` : ''}
            </h2>
          </div>
        </div>
      </div>
      
      {/* Summary card - always visible for SEO */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-[var(--surface2)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--accent1)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <p className="text-gray-700 leading-relaxed">
              {total > 0 ? (
                <>
                  <strong>{total.toLocaleString()}</strong> customer reviews
                  {positivePercent > 0 && (
                    <span> • <strong>{positivePercent}%</strong> positive ratings</span>
                  )}
                </>
              ) : (
                'Customer reviews available'
              )}
            </p>
            <p className="text-sm text-gray-500 mt-1">Loading full reviews...</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * DeferredReviews Component
 * 
 * Defers the full reviews section to avoid blocking LCP.
 * Shows a server-rendered summary immediately, then loads full reviews
 * when the browser is idle or user scrolls near the section.
 */
export default function DeferredReviews({
  reviews,
  reviewsCount,
  reviewsDistribution,
  reviewsTags,
}: DeferredReviewsProps) {
  // Only render if there's review data
  const hasReviewData = reviewsCount || reviewsDistribution || reviewsTags || (reviews && reviews.length > 0);
  
  if (!hasReviewData) return null;

  return (
    <DeferredClient
      priority="viewport"
      rootMargin={800}
      minDelay={100}
      placeholder={
        <ReviewsPlaceholder 
          reviewsCount={reviewsCount} 
          reviewsDistribution={reviewsDistribution} 
        />
      }
    >
      <ReviewsSection
        reviews={reviews}
        reviewsCount={reviewsCount}
        reviewsDistribution={reviewsDistribution}
        reviewsTags={reviewsTags}
      />
    </DeferredClient>
  );
}
