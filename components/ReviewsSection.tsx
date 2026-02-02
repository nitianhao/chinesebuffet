'use client';

import { useState, useMemo } from 'react';
import { extractThemes } from '@/lib/reviewThemes';
import SafeImage from './SafeImage';

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

interface ReviewsSectionProps {
  reviews?: Review[];
  reviewsCount?: number;
  rating?: number; // buffet average rating
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

const TRUNCATE_LENGTH = 200;

/**
 * Sort reviews: most helpful first (likesCount), then by reviewerNumberOfReviews, then by date.
 * No fake sentiment - uses explicit user signals (likes = helpfulness).
 */
function sortByHelpfulness(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => {
    const aLikes = a.likesCount ?? 0;
    const bLikes = b.likesCount ?? 0;
    if (bLikes !== aLikes) return bLikes - aLikes;

    const aReviews = a.reviewerNumberOfReviews ?? 0;
    const bReviews = b.reviewerNumberOfReviews ?? 0;
    if (bReviews !== aReviews) return bReviews - aReviews;

    const aDate = a.publishAt ? new Date(a.publishAt).getTime() : 0;
    const bDate = b.publishAt ? new Date(b.publishAt).getTime() : 0;
    return bDate - aDate;
  });
}

/**
 * Get distribution counts from reviewsDistribution or derive from reviews
 */
function getDistributionCounts(
  dist: ReviewsSectionProps['reviewsDistribution'],
  reviews: Review[]
): { counts: Record<number, number>; total: number } {
  const starNames: Record<number, string> = {
    5: 'fiveStar',
    4: 'fourStar',
    3: 'threeStar',
    2: 'twoStar',
    1: 'oneStar',
  };
  const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let total = 0;

  if (dist && Object.keys(dist).length > 0) {
    for (let s = 5; s >= 1; s--) {
      const key = starNames[s];
      const count =
        dist?.[key as keyof typeof dist] ??
        dist?.[s] ??
        dist?.[String(s)] ??
        0;
      counts[s] = Number(count) || 0;
      total += counts[s];
    }
  } else if (reviews?.length > 0) {
    for (const r of reviews) {
      const s = r.rating ?? r.stars ?? 0;
      if (s >= 1 && s <= 5) {
        counts[Math.round(s) as 1 | 2 | 3 | 4 | 5]++;
        total++;
      }
    }
  }
  return { counts, total };
}

/**
 * Expandable review text with "Read more" / "Show less"
 */
function ReviewText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > TRUNCATE_LENGTH;
  const displayText = truncated && !expanded
    ? text.slice(0, TRUNCATE_LENGTH).trim() + '…'
    : text;

  return (
    <p className={className}>
      {displayText}
      {truncated && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="ml-1.5 text-[var(--accent1)] font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-1 rounded"
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </p>
  );
}

/**
 * Get visual variant for review card based on star rating (explicit user data, not sentiment).
 */
function getReviewVariant(rating: number): 'positive' | 'critical' | 'neutral' {
  if (rating >= 4) return 'positive';
  if (rating <= 2) return 'critical';
  return 'neutral';
}

export default function ReviewsSection({
  reviews = [],
  reviewsCount,
  rating: buffetRating,
  reviewsDistribution,
  reviewsTags,
}: ReviewsSectionProps) {
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const reviewsPerPage = 10;

  // Sort by helpfulness (likes first)
  const sortedReviews = useMemo(
    () => sortByHelpfulness(reviews),
    [reviews]
  );

  // Themes from existing text only (keyword matching, no sentiment)
  const themes = useMemo(() => {
    if (!reviews?.length) return [];
    return extractThemes(reviews, 200, 2).slice(0, 4);
  }, [reviews]);

  // Average rating: buffet rating or computed from reviews
  const averageRating = useMemo(() => {
    if (buffetRating && buffetRating > 0) return buffetRating;
    const withRating = reviews.filter(
      (r) => (r.rating ?? r.stars ?? 0) > 0
    );
    if (withRating.length === 0) return null;
    const sum = withRating.reduce(
      (acc, r) => acc + (r.rating ?? r.stars ?? 0),
      0
    );
    return Math.round((sum / withRating.length) * 10) / 10;
  }, [buffetRating, reviews]);

  const { counts, total } = getDistributionCounts(reviewsDistribution, reviews);

  const totalPages = Math.ceil(sortedReviews.length / reviewsPerPage);
  const paginatedReviews = sortedReviews.slice(
    (currentPage - 1) * reviewsPerPage,
    currentPage * reviewsPerPage
  );

  const getProxiedImageUrl = (url: string | undefined): string => {
    if (!url) return '';
    if (url.startsWith('/api/') || url.startsWith('/')) return url;
    if (url.includes('/geougc-cs/')) {
      return `/api/photo?url=${encodeURIComponent(url)}`;
    }
    try {
      const urlObj = new URL(url);
      if (
        urlObj.hostname &&
        !urlObj.hostname.includes('localhost') &&
        !urlObj.hostname.includes('127.0.0.1')
      ) {
        return `/api/photo?url=${encodeURIComponent(url)}`;
      }
    } catch {
      /* ignore */
    }
    return url;
  };

  const renderReview = (review: Review, index: number) => {
    const stars = review.rating ?? review.stars ?? 0;
    const variant = getReviewVariant(stars);
    const text = review.textTranslated ?? review.text ?? '';

    const variantStyles = {
      positive:
        'border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-950/20',
      critical:
        'border-l-4 border-l-rose-500 bg-rose-50/30 dark:bg-rose-950/20',
      neutral: 'border-l-4 border-l-gray-300 bg-gray-50/30 dark:bg-gray-900/20',
    };

    return (
      <article
        key={review.reviewId ?? index}
        className={`rounded-lg border border-gray-200 p-4 sm:p-5 shadow-sm ${variantStyles[variant]}`}
        itemScope
        itemType="https://schema.org/Review"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {review.reviewerPhotoUrl ? (
              <SafeImage
                src={getProxiedImageUrl(review.reviewerPhotoUrl)}
                alt={review.name ?? 'Reviewer'}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                width={40}
                height={40}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-500 text-sm font-semibold">
                  {(review.name ?? review.author ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">
                {review.name ?? review.author ?? 'Anonymous'}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-gray-500">
                {review.reviewerNumberOfReviews != null && (
                  <span>{review.reviewerNumberOfReviews} reviews</span>
                )}
                {review.isLocalGuide && (
                  <span className="text-amber-700 font-medium">Local Guide</span>
                )}
                {review.likesCount != null && review.likesCount > 0 && (
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                      />
                    </svg>
                    {review.likesCount} helpful
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={`w-5 h-5 ${
                  i < stars ? 'text-yellow-400 fill-current' : 'text-gray-300'
                }`}
                viewBox="0 0 20 20"
                aria-hidden
              >
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
            ))}
            {stars > 0 && (
              <span className="text-gray-700 font-medium ml-0.5">{stars}</span>
            )}
          </div>
        </div>

        {text && (
          <div className="mb-3">
            <ReviewText text={text} className="text-gray-700 text-sm leading-relaxed" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
          {review.relativeTime && <span>{review.relativeTime}</span>}
          {review.publishAt && (
            <span>{new Date(review.publishAt).toLocaleDateString()}</span>
          )}
          {review.visitedIn && <span>Visited {review.visitedIn}</span>}
        </div>

        {review.responseFromOwnerText && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-sm font-semibold text-gray-700 mb-1">
              Owner Response
            </div>
            <p className="text-gray-600 text-sm">{review.responseFromOwnerText}</p>
            {review.responseFromOwnerDate && (
              <div className="text-xs text-gray-500 mt-1">
                {new Date(review.responseFromOwnerDate).toLocaleDateString()}
              </div>
            )}
          </div>
        )}

        {review.reviewImageUrls &&
          Array.isArray(review.reviewImageUrls) &&
          review.reviewImageUrls.length > 0 && (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {review.reviewImageUrls.map((imgUrl: string, imgIndex: number) => (
                <a
                  key={imgIndex}
                  href={imgUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-100 flex-shrink-0 hover:border-[var(--accent1)]/40 hover:shadow-md transition-all"
                >
                  <img
                    src={getProxiedImageUrl(imgUrl)}
                    alt={`Review ${imgIndex + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </a>
              ))}
            </div>
          )}
      </article>
    );
  };

  const displayCount = reviewsCount ?? reviews.length;

  return (
    <section id="reviews" className="mb-6 scroll-mt-24" aria-labelledby="reviews-heading">
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex items-center justify-center">
          <div className="bg-white dark:bg-gray-900 px-4 flex items-center gap-3">
            <svg
              className="w-6 h-6 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
              />
            </svg>
            <h2 id="reviews-heading" className="text-xl sm:text-2xl font-bold text-gray-900">
              Reviews {displayCount ? `(${displayCount.toLocaleString()})` : ''}
            </h2>
          </div>
        </div>
      </div>

      {/* 1. Reviews Summary at top - mobile-first */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm mb-6">
        <h3 className="sr-only">Reviews summary</h3>

        {/* Average rating + distribution row */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6 mb-4">
          {averageRating != null && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {averageRating.toFixed(1)}
                </span>
                <svg
                  className="w-6 h-6 sm:w-7 sm:h-7 text-yellow-400 fill-current"
                  viewBox="0 0 20 20"
                  aria-hidden
                >
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
              </div>
              <span className="text-gray-600 text-sm">average</span>
            </div>
          )}

          {/* 5★–1★ distribution bars */}
          {total > 0 && (
            <div className="flex-1 min-w-0 w-full sm:max-w-xs">
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((s) => {
                  const count = counts[s] ?? 0;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div
                      key={s}
                      className="flex items-center gap-2 sm:gap-3"
                    >
                      <div className="flex items-center gap-1 w-10 sm:w-12 flex-shrink-0">
                        <span className="text-sm font-medium">{s}</span>
                        <svg
                          className="w-4 h-4 text-yellow-400 fill-current"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                        </svg>
                      </div>
                      <div className="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden min-w-0">
                        <div
                          className="h-full bg-yellow-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600 w-6 text-right flex-shrink-0">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Common themes - extracted from review text only (keyword matching) */}
        {themes.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Topics reviewers mention
            </h4>
            <div className="flex flex-wrap gap-2">
              {themes.map((t) => (
                <span
                  key={t.key}
                  className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full text-sm"
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Optional: reviewsTags from data */}
        {reviewsTags && reviewsTags.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              What people say
            </h4>
            <div className="flex flex-wrap gap-2">
              {reviewsTags.slice(0, 6).map((tag, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  {tag.title}
                  {tag.count != null && (
                    <span className="ml-1 text-gray-500">({tag.count})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Reviews list - most helpful first, with expand/collapse */}
      {sortedReviews.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Most helpful reviews
          </h3>

          <button
            type="button"
            onClick={() => setShowAllReviews((v) => !v)}
            className="w-full sm:w-auto mb-4 px-5 py-3 bg-[var(--accent1)] hover:bg-[var(--accent2)] text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {showAllReviews ? 'Hide' : 'Show'} all reviews ({sortedReviews.length})
            <svg
              className={`w-5 h-5 transition-transform ${showAllReviews ? 'rotate-180' : ''}`}
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

          {showAllReviews && (
            <div className="space-y-4">
              {paginatedReviews.map((r, i) =>
                renderReview(r, (currentPage - 1) * reviewsPerPage + i)
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-gray-700 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SEO: full reviews in DOM for crawlers (visually hidden when collapsed) */}
      {sortedReviews.length > 0 && (
        <div className="sr-only" aria-hidden={showAllReviews}>
          <h3>All reviews</h3>
          {sortedReviews.map((r, i) => (
            <div key={r.reviewId ?? `seo-${i}`}>
              {renderReview(r, i)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
