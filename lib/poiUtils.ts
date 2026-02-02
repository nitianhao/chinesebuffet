/**
 * POI Utilities
 * 
 * Provides utilities for:
 * - Default-open heuristic (which POI groups should be expanded by default)
 * - Ultra-thin group detection (groups to hide/de-emphasize)
 * - Summary text generation from group items
 */

// ============================================================================
// PRIORITY TIERS FOR DEFAULT-OPEN HEURISTIC
// ============================================================================

/**
 * Priority tiers for POI section slugs.
 * HIGH: Always consider for default-open (parking, lodging, attractions)
 * MEDIUM: Consider if data-based boosters apply
 * LOW: Default-collapsed unless data-based boosters strongly favor opening
 */
export const POI_SECTION_PRIORITIES: Record<string, 'high' | 'medium' | 'low'> = {
  // High-intent sections (default-open candidates)
  'transportationAutomotive': 'high',  // Parking, transit, rideshare
  'accomodationLodging': 'high',       // Hotels, lodging
  'recreationEntertainment': 'high',    // Attractions, entertainment
  'retailShopping': 'medium',           // Shopping, groceries
  'artsCulture': 'medium',             // Museums, cultural sites
  
  // Medium-intent sections
  'foodDining': 'medium',               // Other restaurants
  'healthcareMedicalServices': 'medium', // Medical services
  
  // Low-intent sections (default-collapsed)
  'financialServices': 'low',
  'communicationsTechnology': 'low',
  'educationLearning': 'low',
  'governmentPublicServices': 'low',
  'homeImprovementGarden': 'low',
  'industrialManufacturing': 'low',
  'petCareVeterinary': 'low',
  'professionalBusinessServices': 'low',
  'religiousSpiritual': 'low',
  'personalCareBeauty': 'low',
  'sportsFitness': 'low',
  'utilitiesInfrastructure': 'low',
  'miscellaneousServices': 'low',
};

/**
 * Group slugs within sections that should be prioritized for default-open.
 * These are high-signal groups even within lower-priority sections.
 */
export const HIGH_PRIORITY_GROUP_SLUGS = new Set([
  'parking',
  'parking_lot',
  'parking_space',
  'public_transport',
  'bus_station',
  'train_station',
  'taxi',
  'rideshare',
  'hotel',
  'lodging',
  'attraction',
  'museum',
  'grocery',
  'supermarket',
  'shopping_mall',
  'restroom',
  'toilets',
  'public_facilities',
]);

/**
 * Group slugs that are considered "noise" and should be de-emphasized.
 */
export const NOISE_GROUP_SLUGS = new Set([
  'utility',
  'infrastructure',
  'telecommunications',
  'internet_service',
  'generic_service',
]);

// ============================================================================
// DISTANCE FORMATTING
// ============================================================================

/**
 * Format distance from feet to human-readable text.
 * - Use feet if < 1056 ft (0.2 mi): "~870 ft"
 * - Else convert to miles with 1 decimal: "~0.5 mi", "~1.2 mi"
 */
export function formatDistance(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0 || !Number.isFinite(distanceFt)) {
    return 'unknown distance';
  }
  
  if (distanceFt < 1056) {
    // Round to nearest 10
    const rounded = Math.round(distanceFt / 10) * 10;
    return `~${rounded} ft`;
  }
  
  const miles = distanceFt / 5280;
  // Round to 1 decimal place
  const roundedMiles = Math.round(miles * 10) / 10;
  return `~${roundedMiles} mi`;
}

/**
 * Format distance in feet only (for range calculations).
 */
function formatDistanceFeet(distanceFt: number): string {
  const rounded = Math.round(distanceFt / 10) * 10;
  return `~${rounded} ft`;
}

/**
 * Format distance in miles only (for range calculations).
 */
function formatDistanceMiles(distanceFt: number): string {
  const miles = distanceFt / 5280;
  const roundedMiles = Math.round(miles * 10) / 10;
  return `~${roundedMiles} mi`;
}

// ============================================================================
// GROUP METADATA EXTRACTION
// ============================================================================

export interface POIGroupMetadata {
  poiCount: number;
  nearestDistanceFt: number;
  farthestDistanceFt: number;
  nearestDistanceText: string;
  farthestDistanceText: string;
  closestItemName: string | null;
}

/**
 * Extract metadata from a POI group's items.
 */
export function extractGroupMetadata(group: {
  label: string;
  items?: Array<{
    name?: string;
    distanceText?: string;
    distanceFt?: number;
  }>;
}): POIGroupMetadata {
  const items = group.items || [];
  
  if (items.length === 0) {
    return {
      poiCount: 0,
      nearestDistanceFt: Infinity,
      farthestDistanceFt: Infinity,
      nearestDistanceText: '',
      farthestDistanceText: '',
      closestItemName: null,
    };
  }
  
  // Sort by distance (ascending)
  const sorted = [...items].sort((a, b) => {
    const aDist = a.distanceFt ?? Infinity;
    const bDist = b.distanceFt ?? Infinity;
    return aDist - bDist;
  });
  
  const nearest = sorted[0];
  const farthest = sorted[sorted.length - 1];
  
  return {
    poiCount: items.length,
    nearestDistanceFt: nearest.distanceFt ?? Infinity,
    farthestDistanceFt: farthest.distanceFt ?? Infinity,
    nearestDistanceText: nearest.distanceText || formatDistance(nearest.distanceFt),
    farthestDistanceText: farthest.distanceText || formatDistance(farthest.distanceFt),
    closestItemName: nearest.name || null,
  };
}

// ============================================================================
// SUMMARY TEXT GENERATION
// ============================================================================

/**
 * Generate a one-line summary for a POI group.
 * Example: "3 services are listed (~1050 ft to ~2800 ft), with the closest at ~1050 ft."
 */
export function generateGroupSummary(metadata: POIGroupMetadata): string {
  const { poiCount, nearestDistanceFt, farthestDistanceFt, nearestDistanceText, closestItemName } = metadata;
  
  if (poiCount === 0) {
    return 'No places listed.';
  }
  
  if (poiCount === 1) {
    const itemText = closestItemName ? ` (${closestItemName})` : '';
    return `1 place is listed${itemText} at ${nearestDistanceText}.`;
  }
  
  // Multiple items
  let rangeText = '';
  if (farthestDistanceFt < 5280) {
    // Both in feet
    const nearestFeet = formatDistanceFeet(nearestDistanceFt);
    const farthestFeet = formatDistanceFeet(farthestDistanceFt);
    rangeText = `(${nearestFeet} to ${farthestFeet})`;
  } else {
    // Both in miles
    const nearestMiles = formatDistanceMiles(nearestDistanceFt);
    const farthestMiles = formatDistanceMiles(farthestDistanceFt);
    rangeText = `(${nearestMiles} to ${farthestMiles})`;
  }
  
  // Vary phrasing to avoid repetition
  const variations = [
    () => {
      const closestText = closestItemName ? `; closest is ${closestItemName}` : '';
      return `${poiCount} places ${rangeText}${closestText} (nearest: ${nearestDistanceText}).`;
    },
    () => {
      const closestText = closestItemName ? `, including ${closestItemName}` : '';
      return `${poiCount} places ${rangeText}${closestText}. Nearest is ${nearestDistanceText}.`;
    },
    () => {
      const closestText = closestItemName ? ` (closest: ${closestItemName})` : '';
      return `${poiCount} places ${rangeText}${closestText}. Nearest at ${nearestDistanceText}.`;
    },
  ];
  
  // Use deterministic selection based on count to vary phrasing
  const variationIndex = poiCount % variations.length;
  return variations[variationIndex]();
}

// ============================================================================
// DEFAULT-OPEN HEURISTIC
// ============================================================================

/**
 * Determine if a POI group should be expanded by default.
 * 
 * @param sectionSlug - The POI section slug (e.g., 'transportationAutomotive')
 * @param groupLabel - The group label (e.g., 'Parking')
 * @param metadata - Group metadata (count, distances, etc.)
 * @returns true if the group should be expanded by default
 */
export function shouldDefaultOpen(
  sectionSlug: string,
  groupLabel: string,
  metadata: POIGroupMetadata
): boolean {
  const { poiCount, nearestDistanceFt } = metadata;
  
  // Check section priority
  const sectionPriority = POI_SECTION_PRIORITIES[sectionSlug] || 'low';
  
  // Check if group label/slug matches high-priority patterns
  const groupLabelLower = groupLabel.toLowerCase();
  const isHighPriorityGroup = Array.from(HIGH_PRIORITY_GROUP_SLUGS).some(slug => 
    groupLabelLower.includes(slug.replace(/_/g, ' '))
  );
  
  // High-priority sections or groups: default-open
  if (sectionPriority === 'high' || isHighPriorityGroup) {
    return true;
  }
  
  // Data-based boosters for medium/low priority:
  // - High count (>= 6) AND close (<= 2000 ft)
  if (poiCount >= 6 && nearestDistanceFt <= 2000) {
    return true;
  }
  
  // Medium priority with good signal: >= 4 items and <= 3000 ft
  if (sectionPriority === 'medium' && poiCount >= 4 && nearestDistanceFt <= 3000) {
    return true;
  }
  
  // Default: collapsed
  return false;
}

// ============================================================================
// ULTRA-THIN GROUP DETECTION
// ============================================================================

/**
 * Thresholds for ultra-thin group detection.
 * Adjust these constants to change what counts as "ultra-thin".
 */
export const ULTRA_THIN_THRESHOLDS = {
  // Single item far away
  SINGLE_ITEM_FAR_FT: 4000,  // ~0.75 mi
  
  // Low count + far away + low priority
  LOW_COUNT_FAR_FT: 6000,     // ~1.1 mi
  LOW_COUNT_MAX_ITEMS: 2,
};

/**
 * Determine if a POI group is "ultra-thin" and should be de-emphasized.
 * 
 * @param sectionSlug - The POI section slug
 * @param groupLabel - The group label
 * @param metadata - Group metadata
 * @returns true if the group is ultra-thin
 */
export function isUltraThin(
  sectionSlug: string,
  groupLabel: string,
  metadata: POIGroupMetadata
): boolean {
  const { poiCount, nearestDistanceFt } = metadata;
  const sectionPriority = POI_SECTION_PRIORITIES[sectionSlug] || 'low';
  const groupLabelLower = groupLabel.toLowerCase();
  
  // Never hide high-priority sections or groups
  if (sectionPriority === 'high') {
    return false;
  }
  
  const isHighPriorityGroup = Array.from(HIGH_PRIORITY_GROUP_SLUGS).some(slug => 
    groupLabelLower.includes(slug.replace(/_/g, ' '))
  );
  if (isHighPriorityGroup) {
    return false;
  }
  
  // Rule 1: Single item far away
  if (poiCount === 1 && nearestDistanceFt > ULTRA_THIN_THRESHOLDS.SINGLE_ITEM_FAR_FT) {
    return true;
  }
  
  // Rule 2: Low count + far away + low priority
  if (
    poiCount <= ULTRA_THIN_THRESHOLDS.LOW_COUNT_MAX_ITEMS &&
    nearestDistanceFt > ULTRA_THIN_THRESHOLDS.LOW_COUNT_FAR_FT &&
    sectionPriority === 'low'
  ) {
    return true;
  }
  
  // Rule 3: Noise groups with low count
  const isNoiseGroup = Array.from(NOISE_GROUP_SLUGS).some(slug => 
    groupLabelLower.includes(slug.replace(/_/g, ' '))
  );
  if (isNoiseGroup && poiCount <= 2) {
    return true;
  }
  
  return false;
}

// ============================================================================
// OVERALL POI SUMMARY (for "X places nearby (food, shopping, ...)")
// ============================================================================

/** Short human-friendly names for POI categories in summary line */
export const POI_SHORT_NAMES: Record<string, string> = {
  accommodationLodging: 'hotels',
  accomodationLodging: 'hotels', // typo variant
  agriculturalFarming: 'farming',
  artsCulture: 'arts & culture',
  communicationsTechnology: 'tech',
  educationLearning: 'education',
  financialServices: 'finance',
  foodDining: 'food',
  governmentPublicServices: 'government',
  healthcareMedicalServices: 'healthcare',
  homeImprovementGarden: 'home & garden',
  industrialManufacturing: 'industrial',
  miscellaneousServices: 'services',
  personalCareBeauty: 'personal care',
  petCareVeterinary: 'pet care',
  professionalBusinessServices: 'professional',
  recreationEntertainment: 'recreation',
  religiousSpiritual: 'religious',
  repairMaintenance: 'repair',
  retailShopping: 'shopping',
  socialCommunityServices: 'community',
  sportsFitness: 'sports & fitness',
  transportationAutomotive: 'transport',
  travelTourismServices: 'travel',
  utilitiesInfrastructure: 'utilities',
};

export interface POISectionSummary {
  sectionKey: string;
  sectionLabel: string;
  shortName: string;
  totalPlaces: number;
  groups: Array<{ label: string; items: Array<{ name?: string; distanceText?: string; distanceFt?: number }> }>;
}

/**
 * Build overall summary: "12 places nearby (food, shopping, hotels, transport)"
 */
export function buildOverallSummary(sections: POISectionSummary[]): string {
  const total = sections.reduce((sum, s) => sum + s.totalPlaces, 0);
  if (total === 0) return '';
  const categories = sections.map(s => s.shortName).filter(Boolean);
  if (categories.length === 0) return `${total} places nearby`;
  const catList = categories.slice(0, 5).join(', ');
  return `${total} places nearby (${catList})`;
}

/**
 * Check if POI props have any highlights to display.
 * Used by POIBundle (server) to conditionally render the section.
 */
export function hasNearbyHighlightsContent(props: Record<string, { highlights?: Array<{ items?: unknown[] }> }>): boolean {
  return Object.values(props).some(
    (section) => section?.highlights?.some((g) => g.items && g.items.length > 0)
  );
}

/**
 * Build 1-line summary for a section: "5 places, nearest ~800 ft"
 */
export function buildSectionSummary(section: POISectionSummary): string {
  const total = section.totalPlaces;
  if (total === 0) return 'No places listed';
  let nearestFt = Infinity;
  for (const g of section.groups) {
    for (const item of g.items || []) {
      const d = item.distanceFt ?? Infinity;
      if (d < nearestFt) nearestFt = d;
    }
  }
  const nearestText = nearestFt === Infinity ? '' : formatDistance(nearestFt);
  if (total === 1) return `1 place${nearestText ? ` at ${nearestText}` : ''}`;
  return `${total} places${nearestText ? `, nearest ${nearestText}` : ''}`;
}
