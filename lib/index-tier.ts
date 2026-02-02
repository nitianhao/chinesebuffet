/**
 * Index Tier System
 * 
 * Each page must declare:
 * - Page type
 * - Index tier
 * - Indexing rules (index / noindex / follow)
 * 
 * Build will fail if tier is undefined.
 */

export type PageType = 
  | 'home'
  | 'state'
  | 'city'
  | 'buffet'
  | 'poi'
  | 'neighborhood'
  | 'error';

export type IndexTier = 
  | 'tier-1'  // Highest priority - always index
  | 'tier-2'  // High priority - index if quality criteria met
  | 'tier-3'  // Medium priority - conditional indexing
  | 'tier-4'  // Low priority - noindex by default
  | 'noindex'; // Never index

export type RobotsDirective = 'index' | 'noindex';
export type FollowDirective = 'follow' | 'nofollow';

export interface IndexTierConfig {
  pageType: PageType;
  tier: IndexTier;
  robots: RobotsDirective;
  follow: FollowDirective;
}

/**
 * Default index tier configurations for each page type
 */
export const DEFAULT_INDEX_TIERS: Record<PageType, IndexTier> = {
  home: 'tier-1',
  state: 'tier-1',
  city: 'tier-1',
  buffet: 'tier-2',
  poi: 'tier-2',
  neighborhood: 'tier-3',
  error: 'noindex',
};

/**
 * Get robots directive based on tier
 */
export function getRobotsDirective(tier: IndexTier, customIndexable?: boolean): RobotsDirective {
  if (tier === 'noindex') {
    return 'noindex';
  }
  
  if (customIndexable !== undefined) {
    return customIndexable ? 'index' : 'noindex';
  }
  
  // Default behavior by tier
  switch (tier) {
    case 'tier-1':
      return 'index';
    case 'tier-2':
      return 'index'; // Can be overridden by customIndexable
    case 'tier-3':
      return 'noindex'; // Can be overridden by customIndexable
    case 'tier-4':
      return 'noindex';
    case 'noindex':
      return 'noindex';
    default:
      return 'noindex';
  }
}

/**
 * Get follow directive based on tier
 */
export function getFollowDirective(tier: IndexTier): FollowDirective {
  // Always follow links unless explicitly noindex tier
  if (tier === 'noindex') {
    return 'nofollow';
  }
  return 'follow';
}

/**
 * Validate that index tier is defined
 * Throws error if tier is undefined, causing build to fail
 */
export function validateIndexTier(
  pageType: PageType,
  tier: IndexTier | undefined,
  pagePath?: string
): IndexTier {
  if (tier === undefined) {
    const errorMessage = `[Index Tier Validation Failed] Page type "${pageType}" must declare an index tier. ${
      pagePath ? `Page path: ${pagePath}` : ''
    }`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  return tier;
}

/**
 * Create index tier configuration for a page
 */
export function createIndexTierConfig(
  pageType: PageType,
  tier: IndexTier | undefined,
  customIndexable?: boolean,
  pagePath?: string
): IndexTierConfig {
  const validatedTier = validateIndexTier(pageType, tier, pagePath);
  
  return {
    pageType,
    tier: validatedTier,
    robots: getRobotsDirective(validatedTier, customIndexable),
    follow: getFollowDirective(validatedTier),
  };
}

/**
 * Convert index tier config to Next.js Metadata robots format
 */
export function toMetadataRobots(config: IndexTierConfig): {
  index: boolean;
  follow: boolean;
  googleBot?: {
    index: boolean;
    follow: boolean;
  };
} {
  return {
    index: config.robots === 'index',
    follow: config.follow === 'follow',
    googleBot: {
      index: config.robots === 'index',
      follow: config.follow === 'follow',
    },
  };
}
