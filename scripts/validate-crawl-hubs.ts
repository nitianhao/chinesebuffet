/**
 * Validation Script for Crawl Hubs (City and State Pages)
 * 
 * Validates that city and state pages serve as proper crawl hubs:
 * 1. Linked from main navigation or sitemap index
 * 2. Link to ALL buffet pages in their scope
 * 3. Receive fresh internal links when new buffets are added
 * 
 * Run this during build or as a pre-deployment check.
 */

import { getAllCitySlugs, getCityBySlug, getAllStateAbbrs, getStateByAbbr } from '@/lib/data-instantdb';
import { validateCityHub, validateStateHub, enforceCrawlHubRules } from '@/lib/crawl-hub-validation';

interface HubValidationResult {
  hubType: 'city' | 'state';
  identifier: string;
  totalBuffets: number;
  linkedBuffets: number;
  missingBuffets: number;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all city pages as crawl hubs
 */
export async function validateAllCityHubs(): Promise<HubValidationResult[]> {
  const results: HubValidationResult[] = [];
  const citySlugs = await getAllCitySlugs();
  
  for (const citySlug of citySlugs) {
    try {
      const city = await getCityBySlug(citySlug);
      if (!city || !city.buffets) continue;
      
      const allBuffetSlugs = city.buffets.map(b => b.slug).filter(Boolean);
      // City pages show all buffets, so all are linked
      const linkedBuffetSlugs = allBuffetSlugs;
      
      const validation = validateCityHub(
        citySlug,
        city.buffets.length,
        linkedBuffetSlugs,
        allBuffetSlugs,
        true, // City pages are in sitemap
        false // Not directly linked from homepage (linked via states)
      );
      
      results.push({
        hubType: 'city',
        identifier: citySlug,
        totalBuffets: city.buffets.length,
        linkedBuffets: linkedBuffetSlugs.length,
        missingBuffets: validation.missingBuffets.length,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error) {
      console.error(`Error validating city hub ${citySlug}:`, error);
    }
  }
  
  return results;
}

/**
 * Validate all state pages as crawl hubs
 */
export async function validateAllStateHubs(): Promise<HubValidationResult[]> {
  const results: HubValidationResult[] = [];
  const stateAbbrs = await getAllStateAbbrs();
  
  for (const stateAbbr of stateAbbrs) {
    try {
      const stateData = await getStateByAbbr(stateAbbr);
      if (!stateData || !stateData.buffets) continue;
      
      const allBuffetSlugs = stateData.buffets.map((b: any) => b.slug).filter(Boolean);
      // State pages show all buffets, so all are linked
      const linkedBuffetSlugs = allBuffetSlugs;
      
      const validation = validateStateHub(
        stateAbbr,
        stateData.buffetCount,
        linkedBuffetSlugs,
        allBuffetSlugs,
        true, // State pages are in sitemap
        true // StatesSection links to all states from homepage
      );
      
      results.push({
        hubType: 'state',
        identifier: stateAbbr,
        totalBuffets: stateData.buffetCount,
        linkedBuffets: linkedBuffetSlugs.length,
        missingBuffets: validation.missingBuffets.length,
        errors: validation.errors,
        warnings: validation.warnings,
      });
    } catch (error) {
      console.error(`Error validating state hub ${stateAbbr}:`, error);
    }
  }
  
  return results;
}

/**
 * Run validation and exit with error code if validation fails
 */
export async function runValidation(): Promise<void> {
  console.log('[Crawl Hub Validation] Starting validation...');
  
  const cityResults = await validateAllCityHubs();
  const stateResults = await validateAllStateHubs();
  
  const allResults = [...cityResults, ...stateResults];
  
  console.log(`[Crawl Hub Validation] Validated ${allResults.length} hubs (${cityResults.length} cities, ${stateResults.length} states)`);
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const result of allResults) {
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
  }
  
  console.log(`[Crawl Hub Validation] Errors: ${totalErrors}, Warnings: ${totalWarnings}`);
  
  if (totalErrors > 0) {
    console.error('\n[Crawl Hub Validation] VALIDATION FAILED\n');
    
    // Print first 10 errors
    let errorCount = 0;
    for (const result of allResults) {
      if (result.errors.length > 0 && errorCount < 10) {
        console.error(`\n[${result.hubType.toUpperCase()}] ${result.identifier}`);
        for (const error of result.errors) {
          console.error(`  ❌ ${error}`);
          errorCount++;
          if (errorCount >= 10) break;
        }
      }
      if (errorCount >= 10) break;
    }
    
    if (totalErrors > 10) {
      console.error(`\n... and ${totalErrors - 10} more errors`);
    }
    
    process.exit(1);
  }
  
  if (totalWarnings > 0) {
    console.warn('\n[Crawl Hub Validation] VALIDATION PASSED WITH WARNINGS\n');
    
    // Print first 5 warnings
    let warningCount = 0;
    for (const result of allResults) {
      if (result.warnings.length > 0 && warningCount < 5) {
        console.warn(`\n[${result.hubType.toUpperCase()}] ${result.identifier}`);
        for (const warning of result.warnings) {
          console.warn(`  ⚠️  ${warning}`);
          warningCount++;
          if (warningCount >= 5) break;
        }
      }
      if (warningCount >= 5) break;
    }
  } else {
    console.log('\n[Crawl Hub Validation] ✅ VALIDATION PASSED\n');
  }
  
  // Summary statistics
  console.log('\n[Crawl Hub Validation] Summary:');
  console.log(`  Cities: ${cityResults.length} hubs, ${cityResults.reduce((sum, r) => sum + r.totalBuffets, 0)} total buffets`);
  console.log(`  States: ${stateResults.length} hubs, ${stateResults.reduce((sum, r) => sum + r.totalBuffets, 0)} total buffets`);
}

// Run if called directly
if (require.main === module) {
  runValidation().catch((error) => {
    console.error('[Crawl Hub Validation] Fatal error:', error);
    process.exit(1);
  });
}
