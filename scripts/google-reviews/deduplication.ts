// In-batch deduplication of scraped reviews.
//
// Uniqueness order (matches the storage-layer rule we'll enforce in step 3):
//   1. source + sourceReviewId
//   2. source + restaurantId + fingerprint
//
// Google renders some reviews twice in the DOM (e.g. a highlighted copy plus the
// feed copy), so the same sourceReviewId can appear more than once in one scrape.
// First occurrence wins.

import { ScrapedGoogleReview } from "./types";

export type DedupeResult = {
  unique: ScrapedGoogleReview[];
  duplicatesRemoved: number;
};

/** Stable key for a single review. Requires fingerprint when no sourceReviewId. */
export function dedupeKey(review: ScrapedGoogleReview): string {
  if (review.sourceReviewId) return `${review.source}:id:${review.sourceReviewId}`;
  return `${review.source}:${review.restaurantId}:fp:${review.fingerprint ?? ""}`;
}

export function dedupeReviews(reviews: ScrapedGoogleReview[]): DedupeResult {
  const seen = new Set<string>();
  const unique: ScrapedGoogleReview[] = [];
  for (const review of reviews) {
    const key = dedupeKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(review);
  }
  return { unique, duplicatesRemoved: reviews.length - unique.length };
}
