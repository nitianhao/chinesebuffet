/**
 * Sitemap Utilities
 * 
 * Utilities for generating sitemaps with proper indexability checks
 * and lastmod timestamps.
 */

import { MetadataRoute } from 'next';
import { IndexTierConfig, createIndexTierConfig, PageType, IndexTier } from './index-tier';

export interface SitemapEntry {
  url: string;
  /** null when the source data carries no real date — callers omit <lastmod>. */
  lastModified: Date | null;
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
  pageType: PageType;
  isIndexable: boolean;
}

/**
 * Check if a page should be included in sitemap based on index tier config
 */
export function isPageIndexable(
  pageType: PageType,
  tier: IndexTier,
  customIndexable?: boolean
): boolean {
  const config = createIndexTierConfig(pageType, tier, customIndexable);
  return config.robots === 'index';
}

/**
 * Get most recent review publish date from reviews array
 */
function getMostRecentReviewDate(reviews: any[]): Date | null {
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return null;
  }
  
  let mostRecent: Date | null = null;
  
  for (const review of reviews) {
    // Try publishAt first (ISO string)
    if (review.publishAt) {
      const date = new Date(review.publishAt);
      if (!isNaN(date.getTime())) {
        if (!mostRecent || date > mostRecent) {
          mostRecent = date;
        }
      }
    }
    
    // Try publishedAtDate as fallback
    if (review.publishedAtDate) {
      const date = new Date(review.publishedAtDate);
      if (!isNaN(date.getTime())) {
        if (!mostRecent || date > mostRecent) {
          mostRecent = date;
        }
      }
    }
  }
  
  return mostRecent;
}

/**
 * Check if rating has changed (meaningful content change)
 * We check if rating exists and is non-zero, which indicates it's been updated
 */
function hasRatingChange(data: any): boolean {
  // If rating exists and is meaningful (> 0), consider it a content change
  // This is a heuristic - ideally we'd track rating history, but for now
  // we assume if rating exists, it's been updated at some point
  return data?.rating !== undefined && data.rating > 0;
}

/**
 * Check if POIs have changed
 * Since POI records don't have timestamps, we check if buffet has been updated
 * and has POI-related data, which suggests POIs were added/updated
 */
function hasPOIChange(data: any): boolean {
  // Check if buffet has POI-related fields that suggest POIs exist
  // This is a heuristic - we assume if buffet was updated and has POI data,
  // POIs might have changed
  const hasPOIData = 
    data?.poiRecords?.length > 0 ||
    data?.overpassPOIs ||
    data?.accommodationLodging ||
    data?.financialServices ||
    data?.repairMaintenance ||
    data?.petCareVeterinary ||
    data?.sportsFitness ||
    data?.travelTourism ||
    data?.governmentPublicServices;
  
  return hasPOIData && data?.updatedAt;
}

/**
 * Get last modified date from data object based on meaningful content changes
 * 
 * Only updates lastmod for:
 * - Review changes (most recent review publishAt)
 * - Rating changes (when rating exists and is meaningful)
 * - POI changes (when POI data exists and buffet was updated)
 * 
 * Does NOT update for cosmetic changes (description, images, etc.)
 *
 * Returns null when the data carries no usable date. Callers must omit <lastmod>
 * in that case rather than substituting the current time: a lastmod that changes
 * on every rebuild is one Google learns to distrust and ignore, which costs us
 * the recrawl signal on the pages that genuinely did change.
 */
export function getLastModified(data: any): Date | null {
  const meaningfulDates: Date[] = [];
  
  // 1. Check for most recent review
  if (data?.reviews && Array.isArray(data.reviews)) {
    const mostRecentReview = getMostRecentReviewDate(data.reviews);
    if (mostRecentReview) {
      meaningfulDates.push(mostRecentReview);
    }
  }
  
  // Also check reviewRecords if available (from linked relationship)
  if (data?.reviewRecords && Array.isArray(data.reviewRecords)) {
    const mostRecentReview = getMostRecentReviewDate(data.reviewRecords);
    if (mostRecentReview) {
      meaningfulDates.push(mostRecentReview);
    }
  }
  
  // 2. Check for rating changes
  if (hasRatingChange(data)) {
    // Use updatedAt if available, as rating changes would update this
    if (data?.updatedAt) {
      const date = new Date(data.updatedAt);
      if (!isNaN(date.getTime())) {
        meaningfulDates.push(date);
      }
    }
  }
  
  // 3. Check for POI changes
  if (hasPOIChange(data)) {
    // Use updatedAt if POI data exists, suggesting POIs were updated
    if (data?.updatedAt) {
      const date = new Date(data.updatedAt);
      if (!isNaN(date.getTime())) {
        meaningfulDates.push(date);
      }
    }
  }
  
  // If we have meaningful dates, use the most recent one
  if (meaningfulDates.length > 0) {
    const mostRecent = meaningfulDates.reduce((latest, current) => 
      current > latest ? current : latest
    );
    return mostRecent;
  }
  
  // Fallback: Only use updatedAt/lastModified if no meaningful changes found
  // This prevents cosmetic changes from updating lastmod.
  //
  // No recency gate here. Discarding a real date for being "stale" was backwards:
  // a page that genuinely has not changed in months should report that old date,
  // which is exactly the signal telling Google it need not recrawl.
  // scrapedAt is last: it is the bulk-import timestamp, identical across every
  // buffet in an import batch, so it is the weakest of these signals. It is also
  // the only one the bulk sitemap query actually carries — reviews are not
  // fetched on that path — so without it every buffet URL ships bare.
  for (const candidate of [data?.updatedAt, data?.lastModified, data?.scrapedAt]) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // No usable date. Omit lastmod rather than inventing one — see the note above.
  return null;
}

/**
 * Create sitemap entry
 */
export function createSitemapEntry(
  url: string,
  pageType: PageType,
  tier: IndexTier,
  lastModified: Date | null,
  changeFrequency: SitemapEntry['changeFrequency'],
  priority: number,
  customIndexable?: boolean
): SitemapEntry | null {
  // Only include indexable pages
  if (!isPageIndexable(pageType, tier, customIndexable)) {
    return null;
  }
  
  return {
    url,
    lastModified,
    changeFrequency,
    priority,
    pageType,
    isIndexable: true,
  };
}

/**
 * Render a route's lastModified as an XML <lastmod> value, or null to omit the
 * tag entirely. Shared by every sitemap route so the "no date" case is handled
 * identically: we never substitute the current time for a date we do not have.
 */
export function toLastmod(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Convert sitemap entry to Next.js format
 */
export function toSitemapRoute(entry: SitemapEntry): MetadataRoute.Sitemap[0] {
  return {
    url: entry.url,
    // undefined (not null) so the field is simply absent for the XML generators.
    lastModified: entry.lastModified ?? undefined,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  };
}

/**
 * Filter and convert entries to sitemap routes
 */
export function filterIndexableEntries(entries: SitemapEntry[]): MetadataRoute.Sitemap {
  return entries
    .filter(entry => entry.isIndexable)
    .map(toSitemapRoute);
}
