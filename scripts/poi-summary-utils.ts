/**
 * Shared utilities for generating varied, human-readable POI summaries
 * 
 * Goals:
 * - Shorter sentences
 * - Varied sentence openers
 * - Reduced filler phrases
 * - Maintain SEO value
 */

export interface ProcessExtras {
  poiCount: number;
  nearestDistanceText: string;
  farthestDistanceText: string;
  rangeText: string;
  closestSummaryDistanceText: string;
  bucketCounts: Record<string, number>;
  bucketTypePhrases: Record<string, string>;
  closestBucketKey: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
}

/**
 * Simple hash function for deterministic variation
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Get varied sentence opener for single POI
 */
function getSinglePOIOpener(buffetId: string, categoryName: string, distance: string): string {
  const hash = simpleHash(buffetId);
  const variant = hash % 4;
  
  switch (variant) {
    case 0:
      return `A ${categoryName} is ${distance} away.`;
    case 1:
      return `One ${categoryName} is located ${distance} from the buffet.`;
    case 2:
      return `The nearest ${categoryName} is ${distance} away.`;
    case 3:
      return `${categoryName} available ${distance} from the buffet.`;
    default:
      return `A ${categoryName} is ${distance} away.`;
  }
}

/**
 * Get varied sentence opener for multiple POIs
 */
function getMultiplePOIOpener(
  buffetId: string,
  poiCount: number,
  categoryName: string,
  rangeText: string,
  closestDistance: string
): string {
  const hash = simpleHash(buffetId);
  const variant = hash % 5;
  
  // Remove parentheses from rangeText for cleaner sentences
  const cleanRange = rangeText.replace(/[()]/g, '');
  
  switch (variant) {
    case 0:
      return `${poiCount} ${categoryName} ${cleanRange}, closest is ${closestDistance}.`;
    case 1:
      return `Find ${poiCount} ${categoryName} ${cleanRange}. Nearest is ${closestDistance}.`;
    case 2:
      return `${poiCount} ${categoryName} nearby ${cleanRange}. Closest at ${closestDistance}.`;
    case 3:
      return `Located ${cleanRange}: ${poiCount} ${categoryName}. Nearest is ${closestDistance}.`;
    case 4:
      return `${poiCount} ${categoryName} ${cleanRange}. The closest is ${closestDistance} away.`;
    default:
      return `${poiCount} ${categoryName} ${cleanRange}, closest is ${closestDistance}.`;
  }
}

/**
 * Get varied contact/hours sentence
 */
function getContactSentence(buffetId: string, hasHours: boolean, hasWebsite: boolean, hasPhone: boolean): string {
  if (hasHours) {
    const hash = simpleHash(buffetId);
    const variant = hash % 3;
    switch (variant) {
      case 0:
        return 'Hours vary by location.';
      case 1:
        return 'Operating hours may differ.';
      case 2:
        return 'Check hours before visiting.';
      default:
        return 'Hours vary by location.';
    }
  }
  
  if (hasWebsite && hasPhone) {
    const hash = simpleHash(buffetId);
    const variant = hash % 3;
    switch (variant) {
      case 0:
        return 'Contact info available.';
      case 1:
        return 'Phone and website listed.';
      case 2:
        return 'Website and phone provided.';
      default:
        return 'Contact info available.';
    }
  }
  
  if (hasWebsite) {
    const hash = simpleHash(buffetId);
    const variant = hash % 2;
    switch (variant) {
      case 0:
        return 'Website available.';
      case 1:
        return 'Visit website for details.';
      default:
        return 'Website available.';
    }
  }
  
  if (hasPhone) {
    const hash = simpleHash(buffetId);
    const variant = hash % 2;
    switch (variant) {
      case 0:
        return 'Phone number listed.';
      case 1:
        return 'Call for details.';
      default:
        return 'Phone number listed.';
    }
  }
  
  return '';
}

/**
 * Get varied bucket types sentence
 */
function getBucketTypesSentence(
  bucketKeys: string[],
  bucketTypePhrases: Record<string, string>,
  bucketCounts: Record<string, number>,
  poiCount: number,
  buffetId: string
): string {
  if (bucketKeys.length !== 2) return '';
  
  const typeA = bucketTypePhrases[bucketKeys[0]] || '';
  const typeB = bucketTypePhrases[bucketKeys[1]] || '';
  const countA = bucketCounts[bucketKeys[0]] || 0;
  const countB = bucketCounts[bucketKeys[1]] || 0;
  
  const hash = simpleHash(buffetId);
  const variant = hash % 4;
  
  if (poiCount >= 3) {
    const countPhraseA = countA === 1 ? typeA : `${countA} ${typeA}`;
    const countPhraseB = countB === 1 ? typeB : `${countB} ${typeB}`;
    
    switch (variant) {
      case 0:
        return `Includes ${countPhraseA} and ${countPhraseB}.`;
      case 1:
        return `Features ${countPhraseA} and ${countPhraseB}.`;
      case 2:
        return `Offers ${countPhraseA} and ${countPhraseB}.`;
      case 3:
        return `${countPhraseA} and ${countPhraseB} available.`;
      default:
        return `Includes ${countPhraseA} and ${countPhraseB}.`;
    }
  } else {
    switch (variant) {
      case 0:
        return `Includes ${typeA} and ${typeB}.`;
      case 1:
        return `Features ${typeA} and ${typeB}.`;
      case 2:
        return `Offers ${typeA} and ${typeB}.`;
      case 3:
        return `${typeA} and ${typeB} available.`;
      default:
        return `Includes ${typeA} and ${typeB}.`;
    }
  }
}

/**
 * Build varied summary for POI sections
 * 
 * @param extras - Processed POI data
 * @param categoryName - Category name (singular, e.g., "retail store", "transportation service")
 * @param categoryNamePlural - Category name (plural, e.g., "retail stores", "transportation services")
 * @param buffetId - Buffet ID for deterministic variation
 * @returns Summary string (1-2 sentences)
 */
export function buildVariedSummary(
  extras: ProcessExtras,
  categoryName: string,
  categoryNamePlural: string,
  buffetId: string
): string {
  const {
    poiCount,
    rangeText,
    closestSummaryDistanceText,
    bucketCounts,
    bucketTypePhrases,
    hasWebsite,
    hasPhone,
    hasHours
  } = extras;
  
  // Single POI
  if (poiCount === 1) {
    const sentence1 = getSinglePOIOpener(buffetId, categoryName, closestSummaryDistanceText);
    const sentence2 = getContactSentence(buffetId, hasHours, hasWebsite, hasPhone);
    return sentence2 ? `${sentence1} ${sentence2}` : sentence1;
  }
  
  // Multiple POIs
  const sentence1 = getMultiplePOIOpener(
    buffetId,
    poiCount,
    categoryNamePlural,
    rangeText,
    closestSummaryDistanceText
  );
  
  // Sentence 2: Choose AT MOST ONE option
  let sentence2 = '';
  const bucketKeys = Object.keys(bucketCounts);
  
  // Option 1: Bucket types sentence (only when exactly 2 buckets)
  if (bucketKeys.length === 2) {
    sentence2 = getBucketTypesSentence(bucketKeys, bucketTypePhrases, bucketCounts, poiCount, buffetId);
  }
  
  return sentence2 ? `${sentence1} ${sentence2}` : sentence1;
}
