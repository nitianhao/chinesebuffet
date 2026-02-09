/**
 * Near-Duplicate Detection System
 * 
 * Detects near-duplicate pages based on:
 * 1. Similar headings (H1, H2, etc.)
 * 2. Similar intro text
 * 3. Same buffet set
 * 
 * Auto-applies canonical or noindex when duplication risk is high.
 */

export type DuplicateRiskLevel = 'low' | 'medium' | 'high' | 'exact';

export type DuplicateAction = 'canonical' | 'noindex' | 'none';

export interface PageSignature {
  pageType: string;
  pagePath: string;
  headings: string[];
  introText: string;
  buffetIds: string[];
  buffetCount: number;
}

export interface DuplicateMatch {
  pagePath: string;
  pageType: string;
  similarityScore: number;
  riskLevel: DuplicateRiskLevel;
  matchingSignals: {
    headingSimilarity: number;
    introSimilarity: number;
    buffetOverlap: number;
  };
}

export interface DuplicateDetectionResult {
  hasDuplicates: boolean;
  riskLevel: DuplicateRiskLevel;
  action: DuplicateAction;
  matches: DuplicateMatch[];
  primaryPage?: string; // Canonical page if action is 'canonical'
  reason: string;
}

/**
 * Normalize text for comparison (lowercase, remove extra whitespace)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate text similarity using Jaccard similarity (word-based)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  const normalized1 = normalizeText(text1);
  const normalized2 = normalizeText(text2);
  
  if (normalized1 === normalized2) return 1.0;
  
  const words1 = new Set(normalized1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(normalized2.split(/\s+/).filter(w => w.length > 2));
  
  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate heading similarity
 */
function calculateHeadingSimilarity(headings1: string[], headings2: string[]): number {
  if (headings1.length === 0 && headings2.length === 0) return 1.0;
  if (headings1.length === 0 || headings2.length === 0) return 0.0;
  
  // Compare H1 (most important)
  const h1Similarity = headings1[0] && headings2[0]
    ? calculateTextSimilarity(headings1[0], headings2[0])
    : 0;
  
  // Compare all headings
  const allHeadings1 = headings1.map(normalizeText);
  const allHeadings2 = headings2.map(normalizeText);
  
  const matchingHeadings = allHeadings1.filter(h1 => 
    allHeadings2.some(h2 => calculateTextSimilarity(h1, h2) > 0.8)
  );
  
  const avgSimilarity = matchingHeadings.length > 0
    ? matchingHeadings.reduce((sum, h1) => {
        const bestMatch = allHeadings2.reduce((max, h2) => 
          Math.max(max, calculateTextSimilarity(h1, h2)), 0
        );
        return sum + bestMatch;
      }, 0) / matchingHeadings.length
    : 0;
  
  // Weight H1 more heavily
  return (h1Similarity * 0.5) + (avgSimilarity * 0.5);
}

/**
 * Calculate buffet set overlap
 */
function calculateBuffetOverlap(buffetIds1: string[], buffetIds2: string[]): number {
  if (buffetIds1.length === 0 && buffetIds2.length === 0) return 1.0;
  if (buffetIds1.length === 0 || buffetIds2.length === 0) return 0.0;
  
  const set1 = new Set(buffetIds1);
  const set2 = new Set(buffetIds2);
  
  const intersection = new Set([...set1].filter(id => set2.has(id)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate overall similarity score
 */
function calculateSimilarityScore(
  headingSimilarity: number,
  introSimilarity: number,
  buffetOverlap: number
): number {
  // Weighted average: headings 30%, intro 30%, buffets 40%
  return (
    headingSimilarity * 0.3 +
    introSimilarity * 0.3 +
    buffetOverlap * 0.4
  );
}

/**
 * Determine duplicate risk level
 */
function determineRiskLevel(
  similarityScore: number,
  headingSimilarity: number,
  introSimilarity: number,
  buffetOverlap: number
): DuplicateRiskLevel {
  // Exact duplicate: all signals are very high
  if (similarityScore >= 0.95 && headingSimilarity >= 0.9 && buffetOverlap >= 0.9) {
    return 'exact';
  }
  
  // High risk: high similarity across multiple signals
  if (similarityScore >= 0.8 || (headingSimilarity >= 0.8 && buffetOverlap >= 0.7)) {
    return 'high';
  }
  
  // Medium risk: moderate similarity
  if (similarityScore >= 0.6 || headingSimilarity >= 0.7 || buffetOverlap >= 0.6) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Determine action based on risk level and page types
 */
function determineAction(
  riskLevel: DuplicateRiskLevel,
  currentPageType: string,
  matchPageType: string,
  currentPagePath: string,
  matchPagePath: string
): DuplicateAction {
  if (riskLevel === 'low') {
    return 'none';
  }
  
  // For exact duplicates, use canonical
  if (riskLevel === 'exact') {
    // Prefer more specific pages (city > state, buffet > city)
    const specificityOrder: Record<string, number> = {
      'buffet': 4,
      'city': 3,
      'neighborhood': 2,
      'state': 1,
      'poi': 1,
    };
    
    const currentSpecificity = specificityOrder[currentPageType] || 0;
    const matchSpecificity = specificityOrder[matchPageType] || 0;
    
    if (currentSpecificity > matchSpecificity) {
      return 'canonical'; // Current page is more specific, set as canonical
    } else if (matchSpecificity > currentSpecificity) {
      return 'canonical'; // Match is more specific, we'll set canonical to match
    }
    
    // Same specificity - prefer shorter path or alphabetical
    return currentPagePath < matchPagePath ? 'canonical' : 'canonical';
  }
  
  // For high risk, use noindex if pages are same type
  if (riskLevel === 'high') {
    if (currentPageType === matchPageType) {
      // Same type with high similarity - likely duplicate
      return 'noindex';
    }
    // Different types with high similarity - use canonical
    return 'canonical';
  }
  
  // Medium risk - use canonical to consolidate
  return 'canonical';
}

/**
 * Detect near-duplicates for a page
 */
export function detectNearDuplicates(
  currentSignature: PageSignature,
  otherSignatures: PageSignature[]
): DuplicateDetectionResult {
  const matches: DuplicateMatch[] = [];
  
  for (const other of otherSignatures) {
    // Skip self
    if (other.pagePath === currentSignature.pagePath) continue;
    
    const headingSimilarity = calculateHeadingSimilarity(
      currentSignature.headings,
      other.headings
    );
    
    const introSimilarity = calculateTextSimilarity(
      currentSignature.introText,
      other.introText
    );
    
    const buffetOverlap = calculateBuffetOverlap(
      currentSignature.buffetIds,
      other.buffetIds
    );
    
    const similarityScore = calculateSimilarityScore(
      headingSimilarity,
      introSimilarity,
      buffetOverlap
    );
    
    const riskLevel = determineRiskLevel(
      similarityScore,
      headingSimilarity,
      introSimilarity,
      buffetOverlap
    );
    
    // Only include matches with at least medium risk
    if (riskLevel !== 'low') {
      matches.push({
        pagePath: other.pagePath,
        pageType: other.pageType,
        similarityScore,
        riskLevel,
        matchingSignals: {
          headingSimilarity,
          introSimilarity,
          buffetOverlap,
        },
      });
    }
  }
  
  // Sort by risk level and similarity
  matches.sort((a, b) => {
    const riskOrder: Record<DuplicateRiskLevel, number> = {
      exact: 4,
      high: 3,
      medium: 2,
      low: 1,
    };
    
    if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
      return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
    }
    
    return b.similarityScore - a.similarityScore;
  });
  
  // Determine overall risk and action
  const highestRisk = matches.length > 0 ? matches[0].riskLevel : 'low';
  const hasDuplicates = matches.length > 0;
  
  let action: DuplicateAction = 'none';
  let primaryPage: string | undefined;
  let reason = 'No duplicates detected';
  
  if (hasDuplicates) {
    const topMatch = matches[0];
    action = determineAction(
      highestRisk,
      currentSignature.pageType,
      topMatch.pageType,
      currentSignature.pagePath,
      topMatch.pagePath
    );
    
    if (action === 'canonical') {
      // Determine which page should be canonical
      const specificityOrder: Record<string, number> = {
        'buffet': 4,
        'city': 3,
        'neighborhood': 2,
        'state': 1,
        'poi': 1,
      };
      
      const currentSpecificity = specificityOrder[currentSignature.pageType] || 0;
      const matchSpecificity = specificityOrder[topMatch.pageType] || 0;
      
      if (currentSpecificity >= matchSpecificity) {
        primaryPage = currentSignature.pagePath;
        reason = `High similarity with ${topMatch.pagePath} (${topMatch.riskLevel} risk). Setting as canonical.`;
      } else {
        primaryPage = topMatch.pagePath;
        reason = `High similarity with ${topMatch.pagePath} (${topMatch.riskLevel} risk). Should use canonical: ${topMatch.pagePath}`;
      }
    } else if (action === 'noindex') {
      reason = `High similarity with ${topMatch.pagePath} (${topMatch.riskLevel} risk). Applying noindex.`;
    }
  }
  
  return {
    hasDuplicates,
    riskLevel: highestRisk,
    action,
    matches,
    primaryPage,
    reason,
  };
}

/**
 * Create page signature from page data
 */
export function createPageSignature(
  pageType: string,
  pagePath: string,
  headings: string[],
  introText: string,
  buffetIds: string[]
): PageSignature {
  return {
    pageType,
    pagePath,
    headings: headings.map(normalizeText),
    introText: normalizeText(introText),
    buffetIds: buffetIds.filter(Boolean),
    buffetCount: buffetIds.length,
  };
}

/**
 * Log duplicate detection results
 */
export function logDuplicateDetection(
  signature: PageSignature,
  result: DuplicateDetectionResult
): void {
  if (!result.hasDuplicates) return;
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    pageType: signature.pageType,
    pagePath: signature.pagePath,
    riskLevel: result.riskLevel,
    action: result.action,
    reason: result.reason,
    matches: result.matches.map(m => ({
      pagePath: m.pagePath,
      pageType: m.pageType,
      similarityScore: m.similarityScore,
      riskLevel: m.riskLevel,
      signals: m.matchingSignals,
    })),
  };
  
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[Duplicate Detection] ${signature.pagePath}:`, logEntry);
  } else {
    console.warn(`[Duplicate] ${result.action.toUpperCase()} - ${signature.pagePath}`, {
      riskLevel: result.riskLevel,
      matches: result.matches.length,
      reason: result.reason,
    });
  }
}
