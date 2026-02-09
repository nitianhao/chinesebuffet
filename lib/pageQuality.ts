/**
 * Page Quality Scoring for SEO
 * 
 * Determines whether a buffet detail page should be indexed (index,follow)
 * or excluded from search engines (noindex,follow) based on content quality.
 * 
 * This helps protect crawl budget by preventing thin/low-value pages from
 * being indexed while still allowing search engines to follow links.
 * 
 * THRESHOLDS (tunable based on your data):
 * - Strong signals (always index):
 *   - reviewCount >= 3
 *   - FAQs >= 5
 * - Good structured data: structuredScore >= 6
 * - Good POIs: totalPoiCount >= 8 OR (hasHighPriorityGroup AND totalPoiCount >= 5)
 * - NOINDEX triggers:
 *   - Missing core entity info (name OR address/city/state)
 *   - reviewCount == 0 AND no structured attributes AND no POIs AND no FAQs
 *   - Only weak content (no reviews, no FAQs, and either no structured data + <5 POIs OR <3 structured + no POIs)
 * 
 * To tune thresholds, adjust the numeric values in the computeBuffetPageQuality function.
 */

export interface PageQualityResult {
  indexable: boolean;
  reasons: string[];
  score: number;
}

/**
 * Counts the number of true/available fields in structured data objects
 */
function countStructuredFields(data: any): number {
  if (!data || typeof data !== 'object') return 0;
  
  let count = 0;
  if (Array.isArray(data)) {
    // Count non-empty array items
    return data.filter(item => item !== null && item !== undefined && item !== '').length;
  }
  
  // Count truthy values in object
  for (const key in data) {
    const value = data[key];
    if (value === true || (typeof value === 'string' && value.trim() !== '') || 
        (typeof value === 'number' && value > 0) ||
        (Array.isArray(value) && value.length > 0) ||
        (typeof value === 'object' && value !== null && Object.keys(value).length > 0)) {
      count++;
    }
  }
  return count;
}

/**
 * Calculates structured data score across multiple categories
 */
function calculateStructuredScore(buffet: any): number {
  let score = 0;
  
  // Accessibility fields
  if (buffet.accessibility) {
    score += countStructuredFields(buffet.accessibility);
  }
  
  // Amenities fields
  if (buffet.amenities && typeof buffet.amenities === 'object') {
    // Count across all amenity categories
    Object.values(buffet.amenities).forEach((category: any) => {
      score += countStructuredFields(category);
    });
  }
  
  // Hours data
  if (buffet.hours?.hours && Array.isArray(buffet.hours.hours) && buffet.hours.hours.length > 0) {
    score += 1;
  }
  
  return score;
}

/**
 * Counts total POI items across all POI sections
 */
function countTotalPOIs(buffet: any): number {
  const poiSections = [
    buffet.financialServices,
    buffet.foodDining,
    buffet.communicationsTechnology,
    buffet.educationLearning,
    buffet.governmentPublicServices,
    buffet.healthcareMedicalServices,
    buffet.homeImprovementGarden,
    buffet.industrialManufacturing,
    buffet.petCareVeterinary,
    buffet.professionalBusinessServices,
    buffet.recreationEntertainment,
    buffet.religiousSpiritual,
    buffet.personalCareBeauty,
    buffet.retailShopping,
    buffet.communitySocialServices,
    buffet.sportsFitness,
    buffet.transportationAutomotive,
    buffet.travelTourismServices,
    buffet.utilitiesInfrastructure,
    buffet.accomodationLodging,
  ];
  
  let totalItems = 0;
  let hasHighPriorityGroup = false;
  
  // High-priority POI groups (parking, transport, lodging, attractions)
  const highPriorityGroups = ['transportationAutomotive', 'accomodationLodging', 'recreationEntertainment'];
  
  poiSections.forEach((section: any) => {
    if (!section) return;
    
    // Check if it's a structured POI section with highlights
    if (section.highlights && Array.isArray(section.highlights)) {
      section.highlights.forEach((group: any) => {
        if (group.items && Array.isArray(group.items)) {
          totalItems += group.items.length;
        }
      });
    }
    
    // Check for high-priority groups
    const sectionKey = Object.keys(buffet).find(key => buffet[key] === section);
    if (sectionKey && highPriorityGroups.includes(sectionKey)) {
      hasHighPriorityGroup = true;
    }
  });
  
  return { totalItems, hasHighPriorityGroup };
}

/**
 * Computes page quality score for a buffet detail page
 * 
 * @param buffet - Buffet data object
 * @returns PageQualityResult with indexable flag, reasons, and score
 */
export function computeBuffetPageQuality(buffet: any): PageQualityResult {
  const reasons: string[] = [];
  let score = 0;
  
  // Core entity checks - must have name and address info
  const hasName = !!(buffet.name && buffet.name.trim());
  const hasAddress = !!(buffet.address && (
    (typeof buffet.address === 'string' && buffet.address.trim()) ||
    (buffet.address.city && buffet.address.city.trim()) ||
    (buffet.address.state && buffet.address.state.trim())
  ));
  
  if (!hasName || !hasAddress) {
    return {
      indexable: false,
      reasons: ['Missing core entity info (name or address/city/state)'],
      score: 0,
    };
  }
  
  score += 10; // Base score for having core info
  reasons.push('Has core entity info');
  
  // Review count check
  const reviewCount = buffet.reviewsCount || (buffet.reviews && buffet.reviews.length) || 0;
  if (reviewCount >= 3) {
    score += 30;
    reasons.push(`Has ${reviewCount} reviews (strong signal)`);
    // Strong signal - always index if reviews >= 3
    return {
      indexable: true,
      reasons,
      score,
    };
  } else if (reviewCount > 0) {
    score += 10;
    reasons.push(`Has ${reviewCount} review(s)`);
  } else {
    reasons.push('No reviews');
  }
  
  // FAQs check
  const faqCount = buffet.questionsAndAnswers 
    ? (Array.isArray(buffet.questionsAndAnswers) ? buffet.questionsAndAnswers.length : 0)
    : 0;
  
  if (faqCount >= 5) {
    score += 30;
    reasons.push(`Has ${faqCount} FAQs (strong signal)`);
    // Strong signal - always index if FAQs >= 5
    return {
      indexable: true,
      reasons,
      score,
    };
  } else if (faqCount > 0) {
    score += 10;
    reasons.push(`Has ${faqCount} FAQ(s)`);
  } else {
    reasons.push('No FAQs');
  }
  
  // Structured attributes check
  const structuredScore = calculateStructuredScore(buffet);
  if (structuredScore >= 6) {
    score += 20;
    reasons.push(`Has ${structuredScore} structured attributes`);
    
    // If we have good structured data AND some reviews/POIs, index
    if (reviewCount > 0) {
      return {
        indexable: true,
        reasons: [...reasons, 'Strong structured data + reviews'],
        score,
      };
    }
  } else if (structuredScore > 0) {
    score += 5;
    reasons.push(`Has ${structuredScore} structured attributes`);
  } else {
    reasons.push('No structured attributes');
  }
  
  // POIs check
  const { totalItems: totalPoiCount, hasHighPriorityGroup } = countTotalPOIs(buffet);
  
  if (totalPoiCount >= 8 || (hasHighPriorityGroup && totalPoiCount >= 5)) {
    score += 15;
    reasons.push(`Has ${totalPoiCount} POIs`);
    
    // If we have good POIs AND some reviews, index
    if (reviewCount > 0) {
      return {
        indexable: true,
        reasons: [...reasons, 'Strong POIs + reviews'],
        score,
      };
    }
  } else if (totalPoiCount > 0) {
    score += 5;
    reasons.push(`Has ${totalPoiCount} POI(s)`);
  } else {
    reasons.push('No POIs');
  }
  
  // Additional content signals
  if (buffet.description || buffet.description2) {
    score += 5;
    reasons.push('Has description');
  }
  
  if (buffet.imageCount > 0 || (buffet.images && buffet.images.length > 0)) {
    score += 5;
    reasons.push('Has images');
  }
  
  if (buffet.hours?.hours && Array.isArray(buffet.hours.hours) && buffet.hours.hours.length > 0) {
    score += 5;
    reasons.push('Has hours');
  }
  
  // Decision logic:
  // NOINDEX if:
  // 1. reviewCount == 0 AND no structured attributes AND no POIs AND no FAQs
  // 2. Has only 1 weak section (e.g., POIs but no reviews, no FAQs, no structured data AND POIs are ultra-thin)
  
  const hasNoContent = reviewCount === 0 && structuredScore === 0 && totalPoiCount === 0 && faqCount === 0;
  const hasOnlyWeakContent = reviewCount === 0 && faqCount === 0 && 
    ((structuredScore === 0 && totalPoiCount < 5) || (structuredScore < 3 && totalPoiCount === 0));
  
  if (hasNoContent) {
    return {
      indexable: false,
      reasons: [...reasons, 'No content signals (reviews, FAQs, structured data, or POIs)'],
      score,
    };
  }
  
  if (hasOnlyWeakContent) {
    return {
      indexable: false,
      reasons: [...reasons, 'Only weak content signals'],
      score,
    };
  }
  
  // Default: index if we have some content
  return {
    indexable: true,
    reasons,
    score,
  };
}
