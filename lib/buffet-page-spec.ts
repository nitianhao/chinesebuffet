/**
 * Buffet Detail Page Specification
 * 
 * TypeScript types and validation functions to ensure every buffet page
 * conforms to the canonical structure defined in BUFFET_DETAIL_PAGE_SPECIFICATION.md
 */

export type SectionType = 'mandatory' | 'optional' | 'seo-only' | 'user-only';

export interface SectionSpec {
  id: string | null; // null if no ID needed
  heading: 'h1' | 'h2' | 'h3' | 'h4' | null; // null if no heading
  headingText: string | null; // The actual heading text
  type: SectionType;
  order: number; // Display order (1-based)
  visibilityCondition?: (buffet: any) => boolean;
  omitIf?: (buffet: any) => boolean;
  mobileCollapsible?: boolean;
  mobilePriority?: 'high' | 'medium' | 'low';
  seoAlwaysInDOM?: boolean; // Content always in DOM for SEO
}

/**
 * Canonical section specifications in display order
 */
export const BUFFET_PAGE_SECTIONS: SectionSpec[] = [
  // Tier 1: Above the Fold (Mandatory)
  {
    id: null,
    heading: 'h1',
    headingText: null, // Dynamic: buffet.name
    type: 'mandatory',
    order: 1,
    omitIf: () => false, // Never omitted
  },
  {
    id: null,
    heading: null,
    headingText: null,
    type: 'user-only',
    order: 2,
    omitIf: () => false, // VerdictModule always generates content
  },
  {
    id: null,
    heading: 'h3',
    headingText: 'Best for / Not ideal for',
    type: 'user-only',
    order: 3,
    omitIf: () => false, // BestForSection always generates content
  },
  
  // Tier 2: Core Content (Mandatory)
  {
    id: 'overview',
    heading: 'h2',
    headingText: 'Overview',
    type: 'mandatory',
    order: 4,
    omitIf: () => false, // Never omitted
  },
  {
    id: null,
    heading: null,
    headingText: null,
    type: 'user-only',
    order: 5,
    visibilityCondition: (buffet) => !!buffet.summaryData, // BuffetSummaryPanel
  },
  
  // Tier 3: Media & Location (Optional)
  {
    id: 'photos',
    heading: 'h2',
    headingText: 'Photos',
    type: 'optional',
    order: 6,
    visibilityCondition: (buffet) => 
      (buffet.images && buffet.images.length > 0) || buffet.imageCount > 0,
  },
  {
    id: 'hours-location',
    heading: 'h2',
    headingText: 'Hours & Location',
    type: 'optional',
    order: 7,
    visibilityCondition: (buffet) => 
      !!(buffet.hours && (buffet.hours.hours || buffet.hours.popularTimesHistogram)),
  },
  {
    id: 'contact',
    heading: 'h2',
    headingText: 'Contact Information',
    type: 'optional',
    order: 8,
    visibilityCondition: (buffet) => 
      !!(buffet.contactInfo && (
        buffet.contactInfo.phone || 
        buffet.contactInfo.menuUrl || 
        buffet.contactInfo.orderBy
      )),
  },
  
  // Tier 4: Attributes & Reviews (Optional)
  {
    id: 'accessibility-amenities',
    heading: 'h2',
    headingText: 'Accessibility & Amenities',
    type: 'user-only',
    order: 9,
    visibilityCondition: (buffet) => !!(buffet.accessibility || buffet.amenities),
    mobileCollapsible: true,
    mobilePriority: 'low',
  },
  {
    id: 'reviews',
    heading: 'h2',
    headingText: 'Reviews',
    type: 'optional',
    order: 10,
    visibilityCondition: (buffet) => 
      !!(buffet.reviewsCount || 
         buffet.reviewsDistribution || 
         buffet.reviewsTags || 
         (buffet.reviews && buffet.reviews.length > 0)),
    seoAlwaysInDOM: true,
  },
  {
    id: 'faqs',
    heading: 'h2',
    headingText: 'FAQs',
    type: 'seo-only',
    order: 11,
    visibilityCondition: (buffet) => 
      !!(buffet.questionsAndAnswers && 
         Array.isArray(buffet.questionsAndAnswers) && 
         buffet.questionsAndAnswers.length > 0),
    mobileCollapsible: true,
    mobilePriority: 'low',
    seoAlwaysInDOM: true,
  },
  
  // Tier 5: Nearby Context (Optional, SEO-Heavy)
  {
    id: null,
    heading: 'h2',
    headingText: 'Nearby Highlights',
    type: 'user-only',
    order: 12,
    visibilityCondition: (buffet) => 
      !!(buffet.transportationAutomotive || 
         buffet.retailShopping || 
         buffet.recreationEntertainment),
  },
  {
    id: 'nearby-places',
    heading: 'h2',
    headingText: 'Nearby Places',
    type: 'seo-only',
    order: 13,
    visibilityCondition: (buffet) => !!(
      buffet.financialServices ||
      buffet.foodDining ||
      buffet.communicationsTechnology ||
      buffet.educationLearning ||
      buffet.governmentPublicServices ||
      buffet.healthcareMedicalServices ||
      buffet.homeImprovementGarden ||
      buffet.industrialManufacturing ||
      buffet.petCareVeterinary ||
      buffet.professionalBusinessServices ||
      buffet.recreationEntertainment ||
      buffet.religiousSpiritual ||
      buffet.personalCareBeauty ||
      buffet.retailShopping ||
      buffet.sportsFitness ||
      buffet.transportationAutomotive ||
      buffet.travelTourismServices ||
      buffet.utilitiesInfrastructure ||
      buffet.accomodationLodging ||
      buffet.artsCulture
    ),
    seoAlwaysInDOM: true,
  },
  {
    id: null,
    heading: 'h2',
    headingText: 'Neighborhood Context',
    type: 'seo-only',
    order: 14,
    visibilityCondition: (buffet) => !!buffet.neighborhoodContext,
    mobileCollapsible: true,
    mobilePriority: 'low',
  },
  
  // Tier 6: Related Content (Optional)
  {
    id: 'related-buffets',
    heading: 'h2',
    headingText: 'Compare with similar Chinese buffets nearby',
    type: 'user-only',
    order: 15,
    visibilityCondition: (buffet) => {
      // This is checked dynamically based on nearbyBuffetsForComparison
      // In practice, this is computed server-side
      return false; // Will be overridden by actual data check
    },
  },
  {
    id: 'related-links',
    heading: 'h2',
    headingText: 'Related Links',
    type: 'user-only',
    order: 16,
    visibilityCondition: (buffet) => 
      !!(buffet.webResults && buffet.webResults.length > 0),
    mobileCollapsible: true,
    mobilePriority: 'low',
  },
];

/**
 * Validate that a buffet page conforms to the specification
 */
export function validateBuffetPageStructure(buffet: any): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check H1 exists (buffet name)
  if (!buffet.name || typeof buffet.name !== 'string' || buffet.name.trim().length === 0) {
    errors.push('Missing required H1: Buffet name is required');
  }

  // Check mandatory sections
  const mandatorySections = BUFFET_PAGE_SECTIONS.filter(s => s.type === 'mandatory');
  for (const section of mandatorySections) {
    if (section.omitIf && section.omitIf(buffet)) {
      errors.push(`Mandatory section "${section.headingText || section.id}" was omitted`);
    }
  }

  // Check heading hierarchy
  const h1Count = BUFFET_PAGE_SECTIONS.filter(s => s.heading === 'h1').length;
  if (h1Count !== 1) {
    errors.push(`Invalid heading hierarchy: Expected exactly 1 H1, found ${h1Count}`);
  }

  // Check for duplicate IDs
  const ids = BUFFET_PAGE_SECTIONS
    .filter(s => s.id !== null)
    .map(s => s.id!);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate section IDs found: ${duplicateIds.join(', ')}`);
  }

  // Check section order
  const orders = BUFFET_PAGE_SECTIONS.map(s => s.order);
  const sortedOrders = [...orders].sort((a, b) => a - b);
  if (JSON.stringify(orders) !== JSON.stringify(sortedOrders)) {
    warnings.push('Section order may not be sequential');
  }

  // Check visibility conditions for optional sections
  const optionalSections = BUFFET_PAGE_SECTIONS.filter(s => s.type === 'optional');
  for (const section of optionalSections) {
    if (section.visibilityCondition) {
      const shouldShow = section.visibilityCondition(buffet);
      // This is just a warning, not an error, as sections may be conditionally rendered
      if (!shouldShow && section.id) {
        // Section correctly omitted
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get visible sections for a buffet
 */
export function getVisibleSections(buffet: any): SectionSpec[] {
  return BUFFET_PAGE_SECTIONS.filter(section => {
    // Mandatory sections are always visible
    if (section.type === 'mandatory') {
      return true;
    }
    
    // Check visibility condition
    if (section.visibilityCondition) {
      return section.visibilityCondition(buffet);
    }
    
    // Check omit condition
    if (section.omitIf && section.omitIf(buffet)) {
      return false;
    }
    
    // Default to visible if no conditions
    return true;
  });
}

/**
 * Get sections that should be in TOC
 */
export function getTOCSections(buffet: any): SectionSpec[] {
  return getVisibleSections(buffet).filter(section => {
    // Only include sections with IDs (for anchor links)
    return section.id !== null && section.heading === 'h2';
  });
}
