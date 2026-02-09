/**
 * Buffet Detail Page Indexing Rules Enforcement
 * 
 * All buffet detail pages must:
 * 1. index, follow (always, regardless of quality)
 * 2. Self-referencing canonical URL
 * 3. Included in primary XML sitemap
 * 4. Linked from city and state pages
 * 
 * This module provides validation and enforcement of these rules.
 */

import { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export interface BuffetIndexingValidation {
  hasIndexFollow: boolean;
  hasSelfReferencingCanonical: boolean;
  canonicalUrl?: string;
  expectedCanonical?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Validate buffet page metadata against indexing rules
 */
export function validateBuffetIndexing(
  metadata: Metadata,
  expectedPath: string,
  baseUrl: string = getSiteUrl()
): BuffetIndexingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Rule 1: Must have index, follow
  const hasIndexFollow = metadata.robots?.index === true && 
                         metadata.robots?.follow === true;
  
  if (!hasIndexFollow) {
    errors.push(
      `Buffet page must have index=true, follow=true. ` +
      `Current: index=${metadata.robots?.index}, follow=${metadata.robots?.follow}`
    );
  }
  
  // Rule 2: Self-referencing canonical
  const expectedCanonical = `${baseUrl.replace(/\/$/, '')}${expectedPath}`;
  const canonicalUrl = metadata.alternates?.canonical as string | undefined;
  const hasSelfReferencingCanonical = canonicalUrl === expectedCanonical;
  
  if (!hasSelfReferencingCanonical) {
    if (!canonicalUrl) {
      errors.push(`Buffet page must have a canonical URL. Expected: ${expectedCanonical}`);
    } else {
      errors.push(
        `Buffet page canonical must be self-referencing. ` +
        `Expected: ${expectedCanonical}, Got: ${canonicalUrl}`
      );
    }
  }
  
  return {
    hasIndexFollow,
    hasSelfReferencingCanonical,
    canonicalUrl,
    expectedCanonical,
    errors,
    warnings,
  };
}

/**
 * Enforce buffet page indexing rules - throws error if validation fails
 */
export function enforceBuffetIndexingRules(
  metadata: Metadata,
  expectedPath: string,
  baseUrl?: string
): void {
  const validation = validateBuffetIndexing(metadata, expectedPath, baseUrl);
  
  if (validation.errors.length > 0) {
    const errorMessage = `[Buffet Indexing Rules Violation] ${validation.errors.join('; ')}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
  
  if (validation.warnings.length > 0) {
    console.warn(`[Buffet Indexing Warnings] ${validation.warnings.join('; ')}`);
  }
}

/**
 * Create metadata for buffet page with enforced indexing rules
 */
export function createBuffetMetadata(
  title: string,
  description: string,
  path: string,
  baseUrl: string = getSiteUrl()
): Metadata {
  const canonicalUrl = `${baseUrl.replace(/\/$/, '')}${path}`;
  
  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
    },
    // Enforce: index, follow (always for buffet pages)
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
  };
  
  // Validate the metadata we just created
  enforceBuffetIndexingRules(metadata, path, baseUrl);
  
  return metadata;
}

/**
 * Verify buffet page is in sitemap
 * This should be called during build or in a validation script
 */
export async function verifyBuffetInSitemap(
  buffetPath: string,
  sitemapUrls: string[]
): Promise<{ inSitemap: boolean; sitemapUrl?: string }> {
  const baseUrl = getSiteUrl();
  const expectedUrl = `${baseUrl.replace(/\/$/, '')}${buffetPath}`;
  
  const inSitemap = sitemapUrls.includes(expectedUrl);
  
  return {
    inSitemap,
    sitemapUrl: inSitemap ? expectedUrl : undefined,
  };
}

/**
 * Verify buffet page is linked from city/state pages
 * This checks that BuffetCard components are used with proper hrefs
 */
export function verifyBuffetLinkedFromPages(
  buffetSlug: string,
  citySlug: string,
  cityPageContent: string,
  statePageContent?: string
): { linkedFromCity: boolean; linkedFromState: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const expectedCityLink = `/chinese-buffets/${citySlug}/${buffetSlug}`;
  const linkedFromCity = cityPageContent.includes(expectedCityLink);
  
  if (!linkedFromCity) {
    errors.push(
      `Buffet page ${buffetSlug} is not linked from city page ${citySlug}. ` +
      `Expected link: ${expectedCityLink}`
    );
  }
  
  let linkedFromState = true; // Optional, so default to true
  if (statePageContent) {
    linkedFromState = statePageContent.includes(expectedCityLink);
    if (!linkedFromState) {
      warnings.push(
        `Buffet page ${buffetSlug} is not linked from state page. ` +
        `Expected link: ${expectedCityLink}`
      );
    }
  }
  
  return {
    linkedFromCity,
    linkedFromState,
    errors,
    warnings,
  };
}
