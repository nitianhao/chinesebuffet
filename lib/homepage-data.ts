/**
 * Homepage data: lightweight, server-only, cached.
 * Uses rollups (states, cities) + one small DB query for top buffets.
 * No client components required.
 */

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getStatesRollup, getCitiesRollup } from '@/lib/rollups';
import { getTopRatedBuffetsForHomepage } from '@/lib/data-instantdb';

// ============================================================================
// Types (final shape)
// ============================================================================

export interface PopularCity {
  city: string;
  stateAbbr: string;
  slug: string;
  count: number;
}

export interface PopularState {
  stateAbbr: string;
  count: number;
}

export interface TopRatedBuffet {
  name: string;
  slug: string;
  city: string;
  stateAbbr: string;
  rating: number;
  reviewCount: number;
  thumbPhotoReference?: string;
}

export interface HomePageData {
  totalBuffets: number;
  totalCities: number;
  totalStates: number;
  popularCities: PopularCity[];
  popularStates: PopularState[];
  topRatedBuffets: TopRatedBuffet[];
}

// ============================================================================
// Internal fetch (2 rollup reads + 1 DB query)
// ============================================================================

const HOMEPAGE_REVALIDATE_SEC = 12 * 60 * 60; // 12 hours

async function getHomePageDataInternal(): Promise<HomePageData> {
  const [statesResult, citiesResult, topBuffets] = await Promise.all([
    getStatesRollup(),
    getCitiesRollup(),
    getTopRatedBuffetsForHomepage(12),
  ]);

  const states = statesResult.states ?? [];
  const cities = citiesResult.cities ?? [];

  const totalBuffets = states.reduce((sum, s) => sum + s.buffetCount, 0);
  const totalCities = cities.length;
  const totalStates = states.length;

  const popularCities: PopularCity[] = [...cities]
    .sort((a, b) => b.buffetCount - a.buffetCount)
    .slice(0, 30)
    .map((c) => ({
      city: c.city,
      stateAbbr: c.stateAbbr,
      slug: c.slug,
      count: c.buffetCount,
    }));

  const popularStates: PopularState[] = [...states]
    .sort((a, b) => b.buffetCount - a.buffetCount)
    .slice(0, 20)
    .map((s) => ({
      stateAbbr: s.stateAbbr,
      count: s.buffetCount,
    }));

  return {
    totalBuffets,
    totalCities,
    totalStates,
    popularCities,
    popularStates,
    topRatedBuffets: topBuffets,
  };
}

// ============================================================================
// Cached public API (Server Component only)
// ============================================================================

/**
 * Homepage data with 12h revalidation. Use in Server Components only.
 * Query count: 2 rollup reads + 1 small buffet query.
 */
export const getHomePageData = unstable_cache(
  getHomePageDataInternal,
  ['homepage'],
  { revalidate: HOMEPAGE_REVALIDATE_SEC }
);
