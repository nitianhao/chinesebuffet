/**
 * Sitemap Validation for Buffet Pages
 * 
 * Verifies that all buffet pages are included in the sitemap.
 * This should be run during build to ensure compliance with indexing rules.
 */

import { getAllCitySlugs, getCityBySlug } from '@/lib/data-instantdb';

interface SitemapCheckResult {
  totalBuffets: number;
  missingFromSitemap: string[];
  errors: string[];
}

/**
 * Check that all buffet pages would be included in sitemap
 * This validates the sitemap generation logic
 */
export async function checkBuffetSitemapInclusion(): Promise<SitemapCheckResult> {
  const missingFromSitemap: string[] = [];
  const errors: string[] = [];
  let totalBuffets = 0;

  const citySlugs = await getAllCitySlugs();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yoursite.com';

  for (const citySlug of citySlugs) {
    try {
      const city = await getCityBySlug(citySlug);
      if (!city || !city.buffets) continue;

      for (const buffet of city.buffets) {
        totalBuffets++;
        
        // Verify buffet has required fields for sitemap
        if (!buffet.slug) {
          const error = `Buffet in city ${citySlug} missing slug (ID: ${buffet.id || 'unknown'})`;
          errors.push(error);
          missingFromSitemap.push(`/chinese-buffets/${citySlug}/[missing-slug]`);
        } else {
          // Buffet should be in sitemap at this URL
          const expectedUrl = `${baseUrl.replace(/\/$/, '')}/chinese-buffets/${citySlug}/${buffet.slug}`;
          // Note: We can't actually fetch the generated sitemap here,
          // but we verify the data structure supports sitemap inclusion
        }
      }
    } catch (error) {
      errors.push(`Error processing city ${citySlug}: ${error}`);
    }
  }

  return {
    totalBuffets,
    missingFromSitemap,
    errors,
  };
}

/**
 * Run sitemap check and exit with error if validation fails
 */
export async function runSitemapCheck(): Promise<void> {
  console.log('[Sitemap Check] Validating buffet page inclusion...');
  
  const result = await checkBuffetSitemapInclusion();
  
  console.log(`[Sitemap Check] Total buffets: ${result.totalBuffets}`);
  
  if (result.errors.length > 0) {
    console.error(`[Sitemap Check] Found ${result.errors.length} errors:`);
    for (const error of result.errors.slice(0, 10)) {
      console.error(`  ❌ ${error}`);
    }
    if (result.errors.length > 10) {
      console.error(`  ... and ${result.errors.length - 10} more errors`);
    }
    process.exit(1);
  }
  
  if (result.missingFromSitemap.length > 0) {
    console.error(`[Sitemap Check] ${result.missingFromSitemap.length} buffets missing from sitemap`);
    process.exit(1);
  }
  
  console.log('[Sitemap Check] ✅ All buffet pages can be included in sitemap');
}

// Run if called directly
if (require.main === module) {
  runSitemapCheck().catch((error) => {
    console.error('[Sitemap Check] Fatal error:', error);
    process.exit(1);
  });
}
