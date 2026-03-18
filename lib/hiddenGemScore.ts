/**
 * Hidden Gem Score computation.
 *
 * Identifies high-quality Chinese buffets that locals love but that haven't
 * gone mainstream yet. The score combines three independent sub-scores:
 *
 *   hiddenGemScore = (qualityScore × 0.4) + (undiscoveredScore × 0.4) + (offBeatenPathScore × 0.2)
 *
 * Buffets with a rating below 4.3 are ineligible and receive a score of 0.
 * The final score is rounded to one decimal place (0–100).
 */

import type { Buffet } from './data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HiddenGemResult {
  hiddenGemScore: number | null;
  hiddenGemTier: string | null;
}

/**
 * Classification tiers based on hiddenGemScore:
 *   75–100 → "True Hidden Gem 💎"
 *   50–74  → "Under the Radar"
 *   25–49  → "Getting Noticed"
 *   0–24   → null (not displayed)
 */
export type HiddenGemTier =
  | 'True Hidden Gem 💎'
  | 'Under the Radar'
  | 'Getting Noticed'
  | null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Quality sub-score (0–100).
 *
 * Normalises the buffet's star rating to a 0–100 scale.
 * A rating of 5.0 → 100; a rating of 4.3 → 86.
 *
 * @param rating - Google star rating (0–5).
 */
function computeQualityScore(rating: number): number {
  return (rating / 5) * 100;
}

/**
 * Undiscovered sub-score (0–100).
 *
 * Rewards buffets that have far fewer reviews than the most-reviewed buffet
 * in the same city. A place with very few reviews relative to the city's top
 * reviewer-count scores near 100; one that equals the city max scores 0.
 *
 * Formula: clamp(1 - (reviewCount / cityMaxReviewCount), 0, 1) × 100
 *
 * @param reviewCount        - This buffet's review count.
 * @param cityMaxReviewCount - Highest review count among all buffets in the city.
 */
function computeUndiscoveredScore(
  reviewCount: number,
  cityMaxReviewCount: number
): number {
  if (cityMaxReviewCount <= 0) return 100; // no data → assume fully undiscovered
  const ratio = clamp(1 - reviewCount / cityMaxReviewCount, 0, 1);
  return ratio * 100;
}

/**
 * Off-the-beaten-path sub-score (0–100).
 *
 * Rewards buffets that are NOT surrounded by other food establishments.
 * A place in an isolated area scores 100; one in a dense food hub scores 20.
 *
 * Thresholds:
 *   foodNearbyCount <= 3  → 100 (isolated)
 *   foodNearbyCount 4–8   → 60
 *   foodNearbyCount >= 9  → 20 (food hub / tourist corridor)
 *
 * @param foodNearbyCount - Number of "Food & Dining" POIs near the buffet.
 */
function computeOffBeatenPathScore(foodNearbyCount: number): number {
  if (foodNearbyCount <= 3) return 100;
  if (foodNearbyCount <= 8) return 60;
  return 20;
}

/**
 * Derive the tier label from a numeric score.
 *
 * @param score - hiddenGemScore (0–100).
 */
function scoreToTier(score: number): HiddenGemTier {
  if (score >= 75) return 'True Hidden Gem 💎';
  if (score >= 50) return 'Under the Radar';
  if (score >= 25) return 'Getting Noticed';
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the hidden gem score and tier for a single buffet.
 *
 * @param buffet         - The buffet to score.
 * @param cityBuffets    - All buffets in the same city (used to derive city-level stats).
 *
 * @returns `{ hiddenGemScore, hiddenGemTier }` — both null when the buffet
 *          has no rating or a rating below 4.3.
 */
export function computeHiddenGemScore(
  buffet: Buffet,
  cityBuffets: Buffet[]
): HiddenGemResult {
  // ── Eligibility check ────────────────────────────────────────────────────
  const rating = buffet.rating ?? null;
  if (rating === null || rating < 4.3) {
    return { hiddenGemScore: null, hiddenGemTier: null };
  }

  // ── 1. Quality Score (40% weight) ────────────────────────────────────────
  const qualityScore = computeQualityScore(rating);

  // ── 2. Undiscovered Score (40% weight) ───────────────────────────────────
  const reviewCount = buffet.reviewsCount ?? 0;
  const cityMaxReviewCount = cityBuffets.reduce<number>(
    (max, b) => Math.max(max, b.reviewsCount ?? 0),
    0
  );
  const undiscoveredScore = computeUndiscoveredScore(reviewCount, cityMaxReviewCount);

  // ── 3. Off-the-Beaten-Path Score (20% weight) ────────────────────────────
  // foodDining.poiCount represents nearby Food & Dining establishments.
  const foodNearbyCount: number =
    (buffet as any).foodDining?.poiCount ?? 0;
  const offBeatenPathScore = computeOffBeatenPathScore(foodNearbyCount);

  // ── Weighted sum ─────────────────────────────────────────────────────────
  const rawScore =
    qualityScore * 0.4 +
    undiscoveredScore * 0.4 +
    offBeatenPathScore * 0.2;

  const hiddenGemScore = Math.round(rawScore * 10) / 10; // 1 decimal place
  const hiddenGemTier = scoreToTier(hiddenGemScore);

  return { hiddenGemScore, hiddenGemTier };
}

/**
 * Batch-compute hidden gem scores for every buffet in the provided array.
 *
 * Buffets are grouped by city slug so that city-level statistics (max review
 * count) are calculated only once per city rather than once per buffet.
 *
 * @param allBuffets - Flat array of buffets from any number of cities.
 *
 * @returns A new array where each buffet is augmented with
 *          `hiddenGemScore` and `hiddenGemTier`. The original objects are
 *          not mutated.
 */
export function computeAllHiddenGemScores(allBuffets: Buffet[]): Buffet[] {
  // Group by city slug (fall back to address.city for buffets without citySlug)
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

  // Score each buffet using its city peers
  const result: Buffet[] = [];
  for (const [, cityBuffets] of byCityKey) {
    for (const buffet of cityBuffets) {
      const { hiddenGemScore, hiddenGemTier } = computeHiddenGemScore(buffet, cityBuffets);
      result.push({ ...buffet, hiddenGemScore, hiddenGemTier });
    }
  }

  return result;
}
