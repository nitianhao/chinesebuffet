/**
 * Indian buffet rollup readers.
 *
 * Exports the same function names as lib/rollups.ts but queries the
 * `directoryRollups` table with `indian:`-prefixed type values.
 * Uses the same DB connection as the Chinese rollups to avoid
 * separate connection issues.
 */

import { STATE_ABBR_TO_NAME, POI_LABELS, getRollup } from '@/lib/rollups';

// Re-export types and constants
export {
  STATE_ABBR_TO_NAME,
  POI_LABELS,
};
export type {
  StateRollupRow,
  CityRollupRow,
  NeighborhoodRollupRow,
  CityNeighborhoodsRollup,
  StateCitiesRollup,
  CityBuffetsRollup,
  NeighborhoodBuffetsRollup,
  CityPoiSummary,
  CityBuffetRow,
  StateCityRow,
} from '@/lib/rollups';

// ---------------------------------------------------------------------------
// Public API — queries indian:-prefixed rollup types via the shared getRollup
// ---------------------------------------------------------------------------

export async function getStatesRollup(): Promise<{ states: any[] }> {
  const result = await getRollup('indian:states', null);
  const states = (result.data as any[]) || [];
  return { states };
}

export async function getCitiesRollup(): Promise<{ cities: any[] }> {
  const result = await getRollup('indian:cities', null);
  const cities = (result.data as any[]) || [];
  return { cities };
}

export async function getCityNeighborhoodsRollup(citySlug: string): Promise<{ data: any | null }> {
  const result = await getRollup('indian:cityNeighborhoods', citySlug);
  const data = result.data || null;
  return { data };
}

export async function getStateCitiesRollup(stateAbbr: string): Promise<{ data: any | null }> {
  const result = await getRollup('indian:stateCities', stateAbbr.toLowerCase());
  const data = result.data || null;
  return { data };
}

export async function getCityBuffetsRollup(citySlug: string): Promise<{ data: any | null }> {
  const result = await getRollup('indian:cityBuffets', citySlug);
  const data = result.data || null;
  return { data };
}

export async function getNeighborhoodBuffetsRollup(
  citySlug: string,
  neighborhoodSlug: string,
  options?: { limit?: number; offset?: number; topRatedLimit?: number },
): Promise<{
  data: any | null;
  topRatedBuffets?: any[];
}> {
  const rollupKey = `${citySlug}/${neighborhoodSlug}`;
  const result = await getRollup('indian:neighborhoodBuffets', rollupKey);
  const rollupData = result.data as any | null;
  if (!rollupData) {
    return { data: rollupData };
  }

  const topRatedLimit = Math.max(0, options?.topRatedLimit ?? 0);
  const topRatedBuffets = topRatedLimit
    ? [...rollupData.buffets]
        .filter((buffet: any) => buffet.rating != null)
        .sort((a: any, b: any) => {
          const ratingDiff = (b.rating || 0) - (a.rating || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return (b.reviewsCount || 0) - (a.reviewsCount || 0);
        })
        .slice(0, topRatedLimit)
    : undefined;

  if (!options || options.limit == null) {
    return { data: rollupData, topRatedBuffets };
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit);
  const pagedBuffets = rollupData.buffets.slice(offset, offset + limit);

  return {
    data: {
      ...rollupData,
      buffets: pagedBuffets,
    },
    topRatedBuffets,
  };
}
