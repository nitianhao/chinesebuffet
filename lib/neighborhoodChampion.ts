/**
 * Neighborhood Champion Ranking
 *
 * Ranks every buffet within its neighborhood (within the same city) and
 * identifies the top-rated one as the "neighborhood champion."
 *
 * Ranking tiebreaker order:
 *   1. rating DESC          (primary)
 *   2. reviewsCount DESC    (secondary)
 *   3. name ASC             (tertiary — deterministic final tiebreaker)
 *
 * Champion eligibility:
 *   - Must be rank 1 in its neighborhood
 *   - Neighborhood must have ≥ 2 buffets (sole occupants do NOT get champion status)
 *
 * Badge emoji thresholds:
 *   - 🏆  rank 1,  count ≥ 2
 *   - 🥈  rank 2,  count ≥ 3
 *   - 🥉  rank 3,  count ≥ 4
 *   - null for all other cases
 */

import type { Buffet } from './data';

// =============================================================================
// TYPES
// =============================================================================

/**
 * The computed neighborhood ranking result for a single buffet.
 * Both boolean fields are strict (non-nullable) because the function always
 * returns a definite value. The corresponding Buffet fields use boolean | null
 * only because a record may be uncomputed; spreading this result onto a Buffet
 * is always safe.
 */
export interface NeighborhoodChampionResult {
  /** true only when rank === 1 AND neighborhoodBuffetCount >= 2 */
  isNeighborhoodChampion: boolean;
  /** 1-based rank within the neighborhood. null when no neighborhood. */
  neighborhoodRank: number | null;
  /** Total buffets sharing this neighborhood in the city. null when no neighborhood. */
  neighborhoodBuffetCount: number | null;
  /**
   * Rating gap between #1 and #2, rounded to 1 decimal. 0.0 when tied on rating.
   * null when not champion or no neighborhood.
   */
  ratingGap: number | null;
  /** "#1 of N in {neighborhood} 🏆". null when not champion. */
  neighborhoodBadgeText: string | null;
  /**
   * Standalone medal emoji. null when rank does not meet count threshold.
   * 🏆 (rank 1, count≥2) | 🥈 (rank 2, count≥3) | 🥉 (rank 3, count≥4)
   */
  neighborhoodBadgeEmoji: string | null;
  /**
   * Human-readable rank string. Always non-null when a neighborhood exists.
   * "Only buffet in {hood}" | "#{rank} of {count} in {hood}"
   */
  neighborhoodRankText: string | null;
  /** true when this is the only buffet in its neighborhood in the city. */
  isOnlyInNeighborhood: boolean;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Sorts buffets within a neighborhood group and assigns sequential 1-based ranks.
 *
 * Sort order: rating DESC → reviewsCount DESC → name ASC
 *
 * Object references in the returned array point to the same Buffet instances
 * passed in — they are not cloned. Rank assignment is sequential; in the
 * degenerate case of identical rating + reviewsCount + name the order is
 * implementation-defined.
 *
 * @param buffets - All buffets belonging to a single neighborhood group.
 * @returns Array of { buffet, rank } pairs sorted by rank ascending.
 */
export function rankBuffetsInGroup(
  buffets: Buffet[]
): Array<{ buffet: Buffet; rank: number }> {
  const sorted = [...buffets].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
    return a.name.localeCompare(b.name);
  });
  return sorted.map((buffet, index) => ({ buffet, rank: index + 1 }));
}

/**
 * Computes neighborhood champion fields for a single buffet.
 *
 * @param buffet - The buffet to evaluate. MUST also be present in cityBuffets.
 * @param cityBuffets - ALL buffets in the same city, including the subject buffet.
 *   The function filters this array to the subject's neighborhood internally.
 *   If the subject buffet is absent from this array it is treated as a missing-
 *   subject error and the all-null/false result is returned.
 * @returns A NeighborhoodChampionResult with all 8 computed fields.
 */
export function computeNeighborhoodChampion(
  buffet: Buffet,
  cityBuffets: Buffet[]
): NeighborhoodChampionResult {
  throw new Error('not implemented');
}

/**
 * Runs computeNeighborhoodChampion for every buffet in the input array,
 * grouping by city first so each buffet is ranked only against city peers.
 *
 * City grouping key: buffet.citySlug if present (non-null, non-empty).
 * Fallback: `${buffet.address.city},${buffet.address.stateAbbr}`.
 * If both are absent/empty, the buffet is placed in the "unknown" group.
 *
 * @param allBuffets - Every buffet across all cities.
 * @returns A new array of the same length with champion fields merged onto
 *   each buffet via object spread.
 */
export function computeAllNeighborhoodChampions(allBuffets: Buffet[]): Buffet[] {
  throw new Error('not implemented');
}
