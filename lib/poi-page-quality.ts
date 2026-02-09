/**
 * POI Page Quality Assessment
 * 
 * Determines whether a POI-based landing page should be indexed based on:
 * 1. Buffet count threshold
 * 2. Content length threshold
 * 3. Intent clarity
 * 
 * Logs all excluded pages with reason codes for monitoring.
 */

export type POIExclusionReason = 
  | 'BUFFET_COUNT_LOW'      // Buffet count < threshold
  | 'CONTENT_LENGTH_LOW'    // Content length < threshold
  | 'INTENT_UNCLEAR'        // Intent is unclear
  | 'NO_BUFFETS';           // No buffets found

export interface POIPageQualityResult {
  indexable: boolean;
  reason: POIExclusionReason | null;
  reasonCode: string;
  buffetCount: number;
  contentLength: number;
  intentClear: boolean;
  details: {
    buffetCountThreshold: number;
    contentLengthThreshold: number;
    hasClearIntent: boolean;
  };
}

/**
 * Calculate content length for a POI page
 */
function calculateContentLength(
  title: string,
  description: string,
  metaDescription: string,
  additionalContent: string
): number {
  const allText = [
    title,
    description,
    metaDescription,
    additionalContent,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
  
  return allText.length;
}

/**
 * Determine if POI page intent is clear
 * 
 * Intent is clear if:
 * - Title is descriptive and specific
 * - Description explains the purpose clearly
 * - Meta description is informative
 */
function isIntentClear(
  title: string,
  description: string,
  metaDescription: string
): boolean {
  // Check if title is meaningful (not just generic)
  const titleWords = title.toLowerCase().split(/\s+/).length;
  const hasSpecificTitle = titleWords >= 4 && 
    (title.includes('Chinese Buffets') || title.includes('Buffets'));
  
  // Check if description is informative (at least 50 chars)
  const hasInformativeDescription = description.length >= 50;
  
  // Check if meta description is informative (at least 50 chars)
  const hasInformativeMeta = metaDescription.length >= 50;
  
  // Intent is clear if all three are true
  return hasSpecificTitle && hasInformativeDescription && hasInformativeMeta;
}

/**
 * Assess POI page quality and determine indexing eligibility
 */
export function assessPOIPageQuality(
  poiType: string,
  buffetCount: number,
  title: string,
  description: string,
  metaDescription: string,
  additionalContent: string = '',
  buffetCountThreshold: number = 5,
  contentLengthThreshold: number = 200
): POIPageQualityResult {
  const contentLength = calculateContentLength(
    title,
    description,
    metaDescription,
    additionalContent
  );
  
  const intentClear = isIntentClear(title, description, metaDescription);
  
  // Rule 1: If buffet count < threshold → noindex, follow
  if (buffetCount < buffetCountThreshold) {
    const reason: POIExclusionReason = buffetCount === 0 ? 'NO_BUFFETS' : 'BUFFET_COUNT_LOW';
    return {
      indexable: false,
      reason,
      reasonCode: `${reason}:${buffetCount}<${buffetCountThreshold}`,
      buffetCount,
      contentLength,
      intentClear,
      details: {
        buffetCountThreshold,
        contentLengthThreshold,
        hasClearIntent: intentClear,
      },
    };
  }
  
  // Rule 2: If content length < threshold → noindex
  if (contentLength < contentLengthThreshold) {
    return {
      indexable: false,
      reason: 'CONTENT_LENGTH_LOW',
      reasonCode: `CONTENT_LENGTH_LOW:${contentLength}<${contentLengthThreshold}`,
      buffetCount,
      contentLength,
      intentClear,
      details: {
        buffetCountThreshold,
        contentLengthThreshold,
        hasClearIntent: intentClear,
      },
    };
  }
  
  // Rule 3: If intent is unclear → noindex
  if (!intentClear) {
    return {
      indexable: false,
      reason: 'INTENT_UNCLEAR',
      reasonCode: 'INTENT_UNCLEAR:title_or_description_too_generic',
      buffetCount,
      contentLength,
      intentClear,
      details: {
        buffetCountThreshold,
        contentLengthThreshold,
        hasClearIntent: intentClear,
      },
    };
  }
  
  // All checks passed - page is indexable
  return {
    indexable: true,
    reason: null,
    reasonCode: 'INDEXABLE:all_checks_passed',
    buffetCount,
    contentLength,
    intentClear,
    details: {
      buffetCountThreshold,
      contentLengthThreshold,
      hasClearIntent: intentClear,
    },
  };
}

/**
 * Log excluded POI page with reason code
 */
export function logExcludedPOIPage(
  poiType: string,
  pagePath: string,
  result: POIPageQualityResult
): void {
  if (!result.indexable && result.reason) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      pageType: 'POI',
      poiType,
      pagePath,
      exclusionReason: result.reason,
      reasonCode: result.reasonCode,
      metrics: {
        buffetCount: result.buffetCount,
        contentLength: result.contentLength,
        intentClear: result.intentClear,
      },
      thresholds: result.details,
    };
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`[POI Page Exclusion] ${pagePath}:`, logEntry);
    }
    
    // In production, you might want to log to a monitoring service
    // For now, we'll use console.warn which can be captured by logging services
    console.warn(`[POI Exclusion] ${result.reasonCode} - ${pagePath}`, {
      poiType,
      buffetCount: result.buffetCount,
      contentLength: result.contentLength,
    });
  }
}

/**
 * Get exclusion reason description for human-readable logs
 */
export function getExclusionReasonDescription(reason: POIExclusionReason): string {
  const descriptions: Record<POIExclusionReason, string> = {
    BUFFET_COUNT_LOW: 'Buffet count below threshold',
    CONTENT_LENGTH_LOW: 'Content length below threshold',
    INTENT_UNCLEAR: 'Page intent is unclear',
    NO_BUFFETS: 'No buffets found for this POI type',
  };
  
  return descriptions[reason] || 'Unknown reason';
}
