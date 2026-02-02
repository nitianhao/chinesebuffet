/**
 * Heading Hierarchy Validator
 * 
 * Enforces strict heading rules on buffet pages:
 * - H1: Buffet name + city + state (exactly one)
 * - H2: Core sections only (Reviews, Nearby places, Practical info)
 * - H3: Subsections (POI categories, review themes)
 * - No skipped heading levels
 */

export interface HeadingNode {
  level: 1 | 2 | 3 | 4;
  text: string;
  id?: string;
  component?: string;
  line?: number;
}

export interface HeadingValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  headings: HeadingNode[];
}

/**
 * Allowed H2 sections (core sections only)
 */
const ALLOWED_H2_SECTIONS = new Set([
  'Overview',
  'Photos',
  'Hours & Location',
  'Opening Hours',
  'Contact Information',
  'Accessibility & Amenities',
  'Reviews',
  'FAQs',
  'Nearby Places',
  'Related Buffets',
  'Related Links',
]);

/**
 * Validate heading hierarchy
 */
export function validateHeadingHierarchy(headings: HeadingNode[]): HeadingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for exactly one H1
  const h1Count = headings.filter(h => h.level === 1).length;
  if (h1Count === 0) {
    errors.push('Missing required H1: Buffet name + city + state');
  } else if (h1Count > 1) {
    errors.push(`Multiple H1 tags found: ${h1Count}. Only one H1 is allowed.`);
  }

  // Check H1 content includes city and state
  const h1 = headings.find(h => h.level === 1);
  if (h1) {
    const h1Text = h1.text.toLowerCase();
    // This is a basic check - in practice, city/state should be extracted from address
    // For now, we'll just warn if it seems like only the name
    if (h1Text.split(',').length < 2 && !h1Text.includes(' in ')) {
      warnings.push('H1 may be missing city and state. Expected format: "Buffet Name in City, State"');
    }
  }

  // Check for skipped heading levels
  let previousLevel = 0;
  for (const heading of headings) {
    if (previousLevel > 0) {
      const levelDiff = heading.level - previousLevel;
      if (levelDiff > 1) {
        errors.push(
          `Skipped heading level: ${heading.text} (H${heading.level}) follows H${previousLevel}. ` +
          `Headings must be sequential (H${previousLevel} → H${previousLevel + 1} → H${heading.level}).`
        );
      }
    }
    previousLevel = heading.level;
  }

  // Check H2 sections are only core sections
  const h2Sections = headings.filter(h => h.level === 2);
  for (const h2 of h2Sections) {
    if (!ALLOWED_H2_SECTIONS.has(h2.text)) {
      warnings.push(
        `H2 "${h2.text}" may not be a core section. ` +
        `Allowed H2 sections: ${Array.from(ALLOWED_H2_SECTIONS).join(', ')}. ` +
        `Consider using H3 if this is a subsection.`
      );
    }
  }

  // Check that POI categories use H3 (not H2)
  const poiCategoryKeywords = [
    'Financial Services',
    'Food & Dining',
    'Government & Public Services',
    'Healthcare & Medical Services',
    'Garden & Home Improvement',
    'Industrial Manufacturing',
    'Miscellaneous Services',
    'Personal Care & Beauty',
    'Professional & Business Services',
    'Recreation & Entertainment',
    'Religious & Spiritual',
    'Retail & Shopping',
    'Sports & Fitness',
    'Transportation & Automotive',
    'Travel & Tourism Services',
    'Utilities & Infrastructure',
    'Accommodation & Lodging',
    'Arts & Culture',
    'Communications & Technology',
    'Education & Learning',
    'Pet Care & Veterinary',
    'Repair & Maintenance',
    'Community & Social Services',
  ];

  for (const h2 of h2Sections) {
    if (poiCategoryKeywords.includes(h2.text)) {
      errors.push(
        `POI category "${h2.text}" uses H2 but should use H3. ` +
        `POI categories are subsections under "Nearby Places" (H2).`
      );
    }
  }

  // Check that review themes use H3
  const reviewThemeKeywords = ['Food Quality', 'Price & Value', 'Cleanliness', 'Service Speed'];
  for (const h2 of h2Sections) {
    if (reviewThemeKeywords.includes(h2.text)) {
      errors.push(
        `Review theme "${h2.text}" uses H2 but should use H3. ` +
        `Review themes are subsections under "Reviews" (H2).`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    headings,
  };
}

/**
 * Extract headings from JSX/TSX code (basic regex-based)
 * This is a simple implementation - for production, consider using AST parsing
 */
export function extractHeadingsFromCode(code: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  
  // Match <h1>, <h2>, <h3>, <h4> tags
  const headingRegex = /<h([1-4])([^>]*)>(.*?)<\/h[1-4]>/gs;
  let match;
  
  while ((match = headingRegex.exec(code)) !== null) {
    const level = parseInt(match[1], 10) as 1 | 2 | 3 | 4;
    const attributes = match[2];
    const text = match[3].replace(/<[^>]+>/g, '').trim(); // Remove nested tags
    
    // Extract id if present
    const idMatch = attributes.match(/id=["']([^"']+)["']/);
    const id = idMatch ? idMatch[1] : undefined;
    
    headings.push({
      level,
      text,
      id,
      line: code.substring(0, match.index).split('\n').length,
    });
  }
  
  return headings;
}

/**
 * Runtime validation for heading structure
 * Call this during page render to validate heading hierarchy
 */
export function validatePageHeadings(
  h1Text: string,
  h2Sections: Array<{ text: string; id?: string }>,
  h3Sections: Array<{ text: string; id?: string }>,
  h4Sections: Array<{ text: string; id?: string }>
): HeadingValidationResult {
  const headings: HeadingNode[] = [];
  
  // Add H1
  if (h1Text) {
    headings.push({ level: 1, text: h1Text });
  }
  
  // Add H2s
  h2Sections.forEach(section => {
    headings.push({ level: 2, text: section.text, id: section.id });
  });
  
  // Add H3s
  h3Sections.forEach(section => {
    headings.push({ level: 3, text: section.text, id: section.id });
  });
  
  // Add H4s
  h4Sections.forEach(section => {
    headings.push({ level: 4, text: section.text, id: section.id });
  });
  
  return validateHeadingHierarchy(headings);
}
