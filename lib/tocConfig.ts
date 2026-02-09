/**
 * Table of Contents Configuration
 * 
 * This file defines all possible sections for the buffet detail page TOC.
 * Each section has:
 * - id: Stable anchor ID (used in href="#id")
 * - label: Human-friendly display name
 * - isVisible: Optional function to check if section should be shown
 * 
 * This configuration conforms to the canonical specification defined in:
 * docs/BUFFET_DETAIL_PAGE_SPECIFICATION.md
 * 
 * To add/remove sections:
 * 1. Update the canonical specification first
 * 2. Add/remove items in the TOC_SECTIONS array below
 * 3. Ensure the corresponding section in the buffet detail page has the matching id attribute
 * 4. Update the isVisible function if the section is conditionally rendered
 */

export interface TOCSection {
  id: string;
  label: string;
  isVisible?: (buffet: any) => boolean;
}

// Client-safe interface (no functions)
export interface TOCSectionClient {
  id: string;
  label: string;
}

export const TOC_SECTIONS: TOCSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    // Overview is always visible (hero section)
  },
  {
    id: 'photos',
    label: 'Photos',
    isVisible: (buffet) => !!(buffet.images && buffet.images.length > 0) || buffet.imageCount > 0,
  },
  {
    id: 'hours-location',
    label: 'Hours & Location',
    isVisible: (buffet) => !!(buffet.hours && (buffet.hours.hours || buffet.hours.popularTimesHistogram)),
  },
  {
    id: 'contact',
    label: 'Contact Information',
    isVisible: (buffet) => !!(buffet.contactInfo && (buffet.contactInfo.phone || buffet.contactInfo.menuUrl || buffet.contactInfo.orderBy)),
  },
  {
    id: 'accessibility-amenities',
    label: 'Accessibility & Amenities',
    isVisible: (buffet) => !!(buffet.accessibility || buffet.amenities),
  },
  {
    id: 'reviews',
    label: 'Reviews',
    isVisible: (buffet) => !!(buffet.reviewsCount || buffet.reviewsDistribution || buffet.reviewsTags || (buffet.reviews && buffet.reviews.length > 0)),
  },
  {
    id: 'faqs',
    label: 'FAQs',
    isVisible: (buffet) => !!(buffet.questionsAndAnswers && Array.isArray(buffet.questionsAndAnswers) && buffet.questionsAndAnswers.length > 0),
  },
  {
    id: 'nearby-places',
    label: 'Nearby Places',
    isVisible: (buffet) => !!(
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
      buffet.religiousSpiritual
    ),
  },
  {
    id: 'related-buffets',
    label: 'Related Buffets',
    isVisible: (buffet) => !!(buffet.webResults && buffet.webResults.length > 0),
  },
];

/**
 * Filters TOC sections based on buffet data availability
 * Returns client-safe sections (no functions)
 */
export function getVisibleTOCSections(buffet: any): TOCSectionClient[] {
  return TOC_SECTIONS.filter((section) => {
    if (!section.isVisible) return true;
    return section.isVisible(buffet);
  }).map((section) => ({
    id: section.id,
    label: section.label,
  }));
}
