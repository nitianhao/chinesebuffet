/**
 * Staged Indexing Rollout
 * 
 * Controls which cities are indexed based on rollout phases:
 * - Phase 1: Top cities only
 * - Phase 2: Expand to mid-tier cities
 * - Phase 3: Long-tail locations
 * 
 * Controlled via config flags.
 */

export type IndexingPhase = 'phase-1' | 'phase-2' | 'phase-3' | 'all';

export interface CityTier {
  slug: string;
  city: string;
  state: string;
  rank?: number;
  population?: number;
  buffetCount: number;
  tier: 'top' | 'mid-tier' | 'long-tail';
}

export interface StagedIndexingConfig {
  currentPhase: IndexingPhase;
  phase1Threshold: {
    maxRank?: number; // Top N cities by rank
    minPopulation?: number; // Minimum population
    minBuffetCount?: number; // Minimum buffet count
  };
  phase2Threshold: {
    maxRank?: number;
    minPopulation?: number;
    minBuffetCount?: number;
  };
  phase3Threshold: {
    maxRank?: number;
    minPopulation?: number;
    minBuffetCount?: number;
  };
  enabled: boolean; // Master switch
}

/**
 * Default configuration for staged indexing
 */
export const DEFAULT_STAGED_INDEXING_CONFIG: StagedIndexingConfig = {
  currentPhase: process.env.INDEXING_PHASE as IndexingPhase || 'all',
  phase1Threshold: {
    maxRank: 50, // Top 50 cities by rank
    minPopulation: 200000, // Cities with 200k+ population
    minBuffetCount: 3, // At least 3 buffets
  },
  phase2Threshold: {
    maxRank: 200, // Top 200 cities
    minPopulation: 50000, // Cities with 50k+ population
    minBuffetCount: 2, // At least 2 buffets
  },
  phase3Threshold: {
    maxRank: undefined, // No rank limit
    minPopulation: 10000, // Cities with 10k+ population
    minBuffetCount: 1, // At least 1 buffet
  },
  enabled: process.env.STAGED_INDEXING_ENABLED === 'true',
};

/**
 * Get current staging configuration
 */
export function getStagedIndexingConfig(): StagedIndexingConfig {
  // In production, you might load from a config file or database
  // For now, use environment variables with defaults
  return {
    ...DEFAULT_STAGED_INDEXING_CONFIG,
    currentPhase: (process.env.INDEXING_PHASE as IndexingPhase) || DEFAULT_STAGED_INDEXING_CONFIG.currentPhase,
    enabled: process.env.STAGED_INDEXING_ENABLED === 'true' || DEFAULT_STAGED_INDEXING_CONFIG.enabled,
  };
}

/**
 * Determine city tier based on thresholds
 */
export function determineCityTier(
  city: {
    slug: string;
    city: string;
    state: string;
    rank?: number;
    population?: number;
    buffetCount: number;
  },
  config: StagedIndexingConfig = getStagedIndexingConfig()
): 'top' | 'mid-tier' | 'long-tail' {
  // Phase 1: Top cities
  const meetsPhase1 = 
    (!config.phase1Threshold.maxRank || (city.rank !== undefined && city.rank <= config.phase1Threshold.maxRank)) &&
    (!config.phase1Threshold.minPopulation || (city.population !== undefined && city.population >= config.phase1Threshold.minPopulation)) &&
    (!config.phase1Threshold.minBuffetCount || city.buffetCount >= config.phase1Threshold.minBuffetCount);
  
  if (meetsPhase1) {
    return 'top';
  }
  
  // Phase 2: Mid-tier cities
  const meetsPhase2 = 
    (!config.phase2Threshold.maxRank || (city.rank !== undefined && city.rank <= config.phase2Threshold.maxRank)) &&
    (!config.phase2Threshold.minPopulation || (city.population !== undefined && city.population >= config.phase2Threshold.minPopulation)) &&
    (!config.phase2Threshold.minBuffetCount || city.buffetCount >= config.phase2Threshold.minBuffetCount);
  
  if (meetsPhase2) {
    return 'mid-tier';
  }
  
  // Phase 3: Long-tail (everything else)
  return 'long-tail';
}

/**
 * Check if a city should be indexed based on current phase
 */
export function isCityIndexable(
  city: {
    slug: string;
    city: string;
    state: string;
    rank?: number;
    population?: number;
    buffetCount: number;
  },
  config: StagedIndexingConfig = getStagedIndexingConfig()
): boolean {
  // If staged indexing is disabled, index all cities
  if (!config.enabled) {
    return true;
  }
  
  // If phase is 'all', index all cities
  if (config.currentPhase === 'all') {
    return true;
  }
  
  const cityTier = determineCityTier(city, config);
  
  // Phase 1: Only top cities
  if (config.currentPhase === 'phase-1') {
    return cityTier === 'top';
  }
  
  // Phase 2: Top + mid-tier cities
  if (config.currentPhase === 'phase-2') {
    return cityTier === 'top' || cityTier === 'mid-tier';
  }
  
  // Phase 3: All cities
  if (config.currentPhase === 'phase-3') {
    return true;
  }
  
  // Default: don't index
  return false;
}

/**
 * Get phase for a city
 */
export function getCityPhase(
  city: {
    slug: string;
    city: string;
    state: string;
    rank?: number;
    population?: number;
    buffetCount: number;
  },
  config: StagedIndexingConfig = getStagedIndexingConfig()
): IndexingPhase | null {
  if (!config.enabled) {
    return 'all';
  }
  
  const cityTier = determineCityTier(city, config);
  
  if (cityTier === 'top') {
    return 'phase-1';
  } else if (cityTier === 'mid-tier') {
    return 'phase-2';
  } else {
    return 'phase-3';
  }
}

/**
 * Check if current phase allows indexing for a city tier
 */
export function isPhaseActiveForTier(
  tier: 'top' | 'mid-tier' | 'long-tail',
  config: StagedIndexingConfig = getStagedIndexingConfig()
): boolean {
  if (!config.enabled || config.currentPhase === 'all') {
    return true;
  }
  
  if (config.currentPhase === 'phase-1') {
    return tier === 'top';
  }
  
  if (config.currentPhase === 'phase-2') {
    return tier === 'top' || tier === 'mid-tier';
  }
  
  if (config.currentPhase === 'phase-3') {
    return true;
  }
  
  return false;
}

/**
 * Get list of cities by tier
 */
export async function getCitiesByTier(): Promise<{
  top: CityTier[];
  midTier: CityTier[];
  longTail: CityTier[];
}> {
  const { getAllCitySlugs, getCityBySlug } = await import('./data-instantdb');
  const config = getStagedIndexingConfig();
  
  const top: CityTier[] = [];
  const midTier: CityTier[] = [];
  const longTail: CityTier[] = [];
  
  const citySlugs = await getAllCitySlugs();
  
  for (const slug of citySlugs) {
    try {
      const city = await getCityBySlug(slug);
      if (!city) continue;
      
      const cityData = {
        slug: city.slug,
        city: city.city,
        state: city.state,
        rank: city.rank,
        population: city.population,
        buffetCount: city.buffets?.length || 0,
      };
      
      const tier = determineCityTier(cityData, config);
      
      const cityTier: CityTier = {
        ...cityData,
        tier,
      };
      
      if (tier === 'top') {
        top.push(cityTier);
      } else if (tier === 'mid-tier') {
        midTier.push(cityTier);
      } else {
        longTail.push(cityTier);
      }
    } catch (error) {
      console.error(`Error processing city ${slug}:`, error);
    }
  }
  
  return { top, midTier, longTail };
}
