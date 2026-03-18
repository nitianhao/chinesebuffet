/**
 * Trusted Rating (Bayesian-weighted consensus score).
 *
 * A raw 5.0 rating with 10 reviews is statistically less reliable than a 4.8
 * with 2,000 reviews. This module solves that by blending each buffet's own
 * rating with the city-wide average, weighted by how many reviews the buffet
 * has relative to the city median.
 *
 * ## Formula
 *
 *   trustedRating = ( (v / (v + m)) * R ) + ( (m / (v + m)) * C )
 *
 * Where:
 *   R = this buffet's raw rating
 *   v = this buffet's review count
 *   C = city average rating  (calculated once per city)
 *   m = city median review count, floored at 50  (calculated once per city)
 *
 * When v is small, (m / (v+m)) dominates and pulls the score toward C.
 * When v is large, (v / (v+m)) dominates and the score converges to R.
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrustedRatingResult {
  /** The mathematically weighted rating, e.g. 4.73. */
  trustedRating: number;
  /** trustedRating formatted to 1 decimal place, e.g. "4.7". */
  trustedRatingDisplay: string;
  /** Human-readable confidence label. */
  confidenceTier: string;
  /** Visual indicator emoji for the confidence tier. */
  confidenceTierEmoji: string;
  /** The city average rating (C) used in the formula. */
  cityAverageRating: number;
  /** The city median review count (m) used in the formula (≥ 50). */
  cityMedianReviews: number;
}

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the median of an array of numbers.
 *
 * Returns 0 for an empty array. For an even-length array the median is the
 * mean of the two middle values (standard definition).
 *
 * @param numbers - Array of numeric values.
 */
export function getMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

/**
 * Compute the trusted rating and confidence tier for a single buffet.
 *
 * Uses the Bayesian weighting formula:
 *   trustedRating = ( (v / (v + m)) * R ) + ( (m / (v + m)) * C )
 *
 * @param buffet              - The buffet to score.
 * @param cityMeanRating      - Pre-calculated city average rating (C).
 * @param cityMedianReviews   - Pre-calculated city median review count (m, ≥ 50).
 *
 * @returns A {@link TrustedRatingResult} with the weighted rating and tier.
 */
export function computeTrustedRating(
  buffet: Buffet,
  cityMeanRating: number,
  cityMedianReviews: number
): TrustedRatingResult {
  const C = cityMeanRating;
  const m = cityMedianReviews; // already floored at 50 by the batch function
  const R = buffet.rating ?? C;
  const v = buffet.reviewsCount ?? 0;

  // ── Bayesian weighted average ─────────────────────────────────────────────
  let trustedRating: number;
  if (v === 0) {
    // No reviews at all — fall back to city average with full uncertainty.
    trustedRating = C;
  } else {
    trustedRating = (v / (v + m)) * R + (m / (v + m)) * C;
  }

  // Round to 2 decimal places for the numeric value; display at 1 decimal.
  trustedRating = Math.round(trustedRating * 100) / 100;
  const trustedRatingDisplay = trustedRating.toFixed(1);

  // ── Confidence tier ───────────────────────────────────────────────────────
  let confidenceTier: string;
  let confidenceTierEmoji: string;

  if (v >= m * 5) {
    confidenceTier = 'Rock Solid / Community Favorite';
    confidenceTierEmoji = '🏆';
  } else if (v >= m * 2) {
    confidenceTier = 'Highly Trusted';
    confidenceTierEmoji = '✅';
  } else if (v >= m) {
    confidenceTier = 'Trusted';
    confidenceTierEmoji = '👍';
  } else if (v >= m * 0.5) {
    confidenceTier = 'Needs More Reviews';
    confidenceTierEmoji = '⚖️';
  } else {
    confidenceTier = 'Newly Discovered (Low Confidence)';
    confidenceTierEmoji = '🆕';
  }

  return {
    trustedRating,
    trustedRatingDisplay,
    confidenceTier,
    confidenceTierEmoji,
    cityAverageRating: C,
    cityMedianReviews: m,
  };
}

// ---------------------------------------------------------------------------
// Batch computation
// ---------------------------------------------------------------------------

/**
 * Batch-compute trusted ratings for every buffet in the provided array.
 *
 * **Algorithm (per city):**
 * 1. Group all buffets by city slug (falls back to `address.city`).
 * 2. Calculate C = mean rating of all buffets in that city.
 * 3. Calculate m = median review count of all buffets in that city (floored at 50).
 * 4. For each buffet, call {@link computeTrustedRating} with those city baselines.
 *
 * Original objects are not mutated; a new array is returned.
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 *
 * @returns A new array where each buffet is augmented with all
 *          {@link TrustedRatingResult} fields spread onto the object.
 */
export function computeAllTrustedRatings(allBuffets: Buffet[]): Buffet[] {
  // ── Group by city ─────────────────────────────────────────────────────────
  const byCityKey = new Map<string, Buffet[]>();
  for (const buffet of allBuffets) {
    const key = buffet.citySlug ?? buffet.address?.city ?? '__unknown__';
    const group = byCityKey.get(key);
    if (group) {
      group.push(buffet);
    } else {
      byCityKey.set(key, [buffet]);
    }
  }

  // ── Score each city's buffets ─────────────────────────────────────────────
  const result: Buffet[] = [];

  for (const [, cityBuffets] of byCityKey) {
    // C: city average rating
    const totalRating = cityBuffets.reduce((sum, b) => sum + (b.rating ?? 0), 0);
    const cityMeanRating = cityBuffets.length > 0 ? totalRating / cityBuffets.length : 0;

    // m: city median review count, floored at 50
    const reviewCounts = cityBuffets.map((b) => b.reviewsCount ?? 0);
    const rawMedian = getMedian(reviewCounts);
    const cityMedianReviews = Math.max(50, rawMedian);

    for (const buffet of cityBuffets) {
      const trustedRatingResult = computeTrustedRating(
        buffet,
        cityMeanRating,
        cityMedianReviews
      );
      result.push({ ...buffet, ...trustedRatingResult });
    }
  }

  return result;
}
