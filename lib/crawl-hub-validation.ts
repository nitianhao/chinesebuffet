/**
 * Crawl Hub Validation System
 * 
 * City and state pages serve as crawl hubs and must:
 * 1. Be linked from main navigation or sitemap index
 * 2. Link to ALL buffet pages in their scope (paginated if needed)
 * 3. Receive fresh internal links when new buffets are added
 * 
 * This module provides validation and enforcement of these rules.
 */

export interface CrawlHubValidation {
  isLinkedFromHomepage: boolean;
  isInSitemap: boolean;
  linksToAllBuffets: boolean;
  totalBuffets: number;
  linkedBuffets: number;
  missingBuffets: string[];
  errors: string[];
  warnings: string[];
}

/**
 * Validate that a city page serves as a proper crawl hub
 */
export function validateCityHub(
  citySlug: string,
  totalBuffets: number,
  linkedBuffetSlugs: string[],
  allBuffetSlugs: string[],
  isInSitemap: boolean = true, // Assume sitemap includes all city pages
  isLinkedFromHomepage: boolean = false // Need to check homepage
): CrawlHubValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check 1: Linked from homepage or sitemap
  if (!isLinkedFromHomepage && !isInSitemap) {
    errors.push(
      `City page ${citySlug} must be linked from homepage or included in sitemap`
    );
  }
  
  // Check 2: Links to ALL buffets
  const missingBuffets = allBuffetSlugs.filter(
    slug => !linkedBuffetSlugs.includes(slug)
  );
  
  if (missingBuffets.length > 0) {
    errors.push(
      `City page ${citySlug} is missing links to ${missingBuffets.length} buffets: ` +
      `${missingBuffets.slice(0, 5).join(', ')}${missingBuffets.length > 5 ? '...' : ''}`
    );
  }
  
  const linksToAllBuffets = missingBuffets.length === 0;
  
  // Check 3: Buffet count matches
  if (totalBuffets !== allBuffetSlugs.length) {
    warnings.push(
      `City page ${citySlug} shows ${totalBuffets} buffets but should have ${allBuffetSlugs.length}`
    );
  }
  
  return {
    isLinkedFromHomepage,
    isInSitemap,
    linksToAllBuffets,
    totalBuffets,
    linkedBuffets: linkedBuffetSlugs.length,
    missingBuffets,
    errors,
    warnings,
  };
}

/**
 * Validate that a state page serves as a proper crawl hub
 */
export function validateStateHub(
  stateAbbr: string,
  totalBuffets: number,
  linkedBuffetSlugs: string[],
  allBuffetSlugs: string[],
  isInSitemap: boolean = true, // Assume sitemap includes all state pages
  isLinkedFromHomepage: boolean = true // StatesSection links to all states
): CrawlHubValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check 1: Linked from homepage or sitemap
  if (!isLinkedFromHomepage && !isInSitemap) {
    errors.push(
      `State page ${stateAbbr} must be linked from homepage or included in sitemap`
    );
  }
  
  // Check 2: Links to ALL buffets (or links to cities that link to buffets)
  // For state pages, we check that they link to all cities, and cities link to buffets
  // This is a simplified check - in practice, state pages link to cities, cities link to buffets
  const missingBuffets = allBuffetSlugs.filter(
    slug => !linkedBuffetSlugs.includes(slug)
  );
  
  // State pages may not directly link to all buffets if they link via cities
  // This is acceptable as long as cities link to all their buffets
  if (missingBuffets.length > 0) {
    warnings.push(
      `State page ${stateAbbr} does not directly link to ${missingBuffets.length} buffets. ` +
      `This is acceptable if cities link to all their buffets.`
    );
  }
  
  const linksToAllBuffets = missingBuffets.length === 0;
  
  // Check 3: Buffet count matches
  if (totalBuffets !== allBuffetSlugs.length) {
    warnings.push(
      `State page ${stateAbbr} shows ${totalBuffets} buffets but should have ${allBuffetSlugs.length}`
    );
  }
  
  return {
    isLinkedFromHomepage,
    isInSitemap,
    linksToAllBuffets,
    totalBuffets,
    linkedBuffets: linkedBuffetSlugs.length,
    missingBuffets,
    errors,
    warnings,
  };
}

/**
 * Enforce crawl hub rules - throws error if validation fails
 */
export function enforceCrawlHubRules(validation: CrawlHubValidation, hubType: 'city' | 'state', identifier: string): void {
  if (validation.errors.length > 0) {
    const errorMessage = `[Crawl Hub Rules Violation] ${hubType} ${identifier}: ${validation.errors.join('; ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`[Crawl Hub Warnings] ${hubType} ${identifier}: ${validation.warnings.join('; ')}`);
  }
}

/**
 * Check if pagination is needed based on buffet count
 */
export function needsPagination(buffetCount: number, itemsPerPage: number = 50): boolean {
  return buffetCount > itemsPerPage;
}

/**
 * Calculate pagination info
 */
export function getPaginationInfo(
  totalItems: number,
  currentPage: number = 1,
  itemsPerPage: number = 50
): {
  totalPages: number;
  currentPage: number;
  itemsPerPage: number;
  startIndex: number;
  endIndex: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
} {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
  
  return {
    totalPages,
    currentPage,
    itemsPerPage,
    startIndex,
    endIndex,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1,
  };
}
