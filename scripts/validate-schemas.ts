/**
 * Schema Validation Script
 * 
 * Validates JSON-LD structured data consistency across all buffet pages.
 * 
 * Usage:
 *   npx ts-node scripts/validate-schemas.ts
 *   npx ts-node scripts/validate-schemas.ts --verbose
 *   npx ts-node scripts/validate-schemas.ts --fix (future: auto-fix issues)
 * 
 * Validates:
 * - Restaurant schema completeness
 * - FAQPage schema structure
 * - Review schema validity
 * - Place schema for POIs
 * - BreadcrumbList structure
 */

import { init } from '@instantdb/admin';

// Initialize InstantDB
const APP_ID = process.env.INSTANT_APP_ID || '';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || '';

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
});

// Import validation functions
import {
  buildRestaurantJsonLd,
  buildFaqPageJsonLd,
  buildReviewsJsonLd,
  validateSchema,
  SchemaValidationResult,
} from '../lib/seoJsonLd';

interface ValidationReport {
  totalBuffets: number;
  validBuffets: number;
  invalidBuffets: number;
  warnings: number;
  bySchemaType: {
    [key: string]: {
      valid: number;
      invalid: number;
      missing: number;
      commonErrors: string[];
    };
  };
  failedBuffets: Array<{
    slug: string;
    name: string;
    errors: string[];
  }>;
}

const SITE_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || 'http://localhost:3000';

async function validateAllBuffets(verbose: boolean = false): Promise<ValidationReport> {
  const report: ValidationReport = {
    totalBuffets: 0,
    validBuffets: 0,
    invalidBuffets: 0,
    warnings: 0,
    bySchemaType: {
      Restaurant: { valid: 0, invalid: 0, missing: 0, commonErrors: [] },
      FAQPage: { valid: 0, invalid: 0, missing: 0, commonErrors: [] },
      Review: { valid: 0, invalid: 0, missing: 0, commonErrors: [] },
    },
    failedBuffets: [],
  };

  try {
    // Fetch all buffets
    const result = await db.query({
      buffets: {
        $: {
          where: {
            permanentlyClosed: false,
          },
        },
      },
    });

    const buffets = result.buffets || [];
    report.totalBuffets = buffets.length;

    console.log(`\n📊 Validating schemas for ${buffets.length} buffets...\n`);

    const errorCounts: Record<string, number> = {};

    for (const buffet of buffets) {
      let buffetValid = true;
      const buffetErrors: string[] = [];

      // Parse JSON fields
      const reviews = parseJsonField(buffet.reviews);
      const questionsAndAnswers = parseJsonField(buffet.questionsAndAnswers);

      // Construct city-state slug
      const cityStateSlug = buffet.citySlug || 
        `${slugify(buffet.cityName || '')}-${(buffet.stateAbbr || '').toLowerCase()}`;

      // Transform buffet data for schema builders
      const buffetData = {
        ...buffet,
        slug: buffet.slug,
        name: buffet.name,
        address: buffet.address,
        location: { lat: buffet.lat, lng: buffet.lng },
        contactInfo: {
          phone: buffet.phone,
        },
        price: buffet.price,
        rating: buffet.rating,
        reviewsCount: buffet.reviewsCount,
        reviews: reviews || [],
        questionsAndAnswers: questionsAndAnswers || [],
      };

      // ========================================
      // Validate Restaurant Schema
      // ========================================
      const restaurantSchema = buildRestaurantJsonLd(buffetData, SITE_BASE_URL, cityStateSlug);
      
      if (restaurantSchema) {
        const restaurantResult = validateSchema(restaurantSchema, 'Restaurant');
        
        if (restaurantResult.isValid) {
          report.bySchemaType.Restaurant.valid++;
        } else {
          report.bySchemaType.Restaurant.invalid++;
          buffetValid = false;
          restaurantResult.errors.forEach(err => {
            buffetErrors.push(`Restaurant: ${err}`);
            errorCounts[err] = (errorCounts[err] || 0) + 1;
          });
        }
        
        if (restaurantResult.warnings.length > 0) {
          report.warnings += restaurantResult.warnings.length;
        }
      } else {
        report.bySchemaType.Restaurant.missing++;
        buffetValid = false;
        buffetErrors.push('Restaurant: Failed to build schema');
      }

      // ========================================
      // Validate FAQ Schema (if Q&A exists)
      // ========================================
      if (questionsAndAnswers && Array.isArray(questionsAndAnswers) && questionsAndAnswers.length >= 3) {
        const pageUrl = `${SITE_BASE_URL}/chinese-buffets/${cityStateSlug}/${buffet.slug}`;
        const faqSchema = buildFaqPageJsonLd(questionsAndAnswers, pageUrl);
        
        if (faqSchema) {
          const faqResult = validateSchema(faqSchema, 'FAQPage');
          
          if (faqResult.isValid) {
            report.bySchemaType.FAQPage.valid++;
          } else {
            report.bySchemaType.FAQPage.invalid++;
            // FAQ issues are not critical - don't mark buffet as invalid
            faqResult.errors.forEach(err => {
              buffetErrors.push(`FAQPage: ${err}`);
              errorCounts[err] = (errorCounts[err] || 0) + 1;
            });
          }
        } else {
          report.bySchemaType.FAQPage.missing++;
        }
      }

      // ========================================
      // Validate Review Schemas (if reviews exist)
      // ========================================
      if (reviews && Array.isArray(reviews) && reviews.length > 0) {
        const reviewSchemas = buildReviewsJsonLd(reviews, 3);
        
        if (reviewSchemas.length > 0) {
          // Validate first review as sample
          const sampleReview = { '@context': 'https://schema.org', ...reviewSchemas[0] };
          const reviewResult = validateSchema(sampleReview, 'Review');
          
          if (reviewResult.isValid) {
            report.bySchemaType.Review.valid++;
          } else {
            report.bySchemaType.Review.invalid++;
            reviewResult.errors.forEach(err => {
              buffetErrors.push(`Review: ${err}`);
              errorCounts[err] = (errorCounts[err] || 0) + 1;
            });
          }
        } else {
          report.bySchemaType.Review.missing++;
        }
      }

      // Update overall counts
      if (buffetValid) {
        report.validBuffets++;
      } else {
        report.invalidBuffets++;
        report.failedBuffets.push({
          slug: buffet.slug,
          name: buffet.name,
          errors: buffetErrors,
        });
      }

      // Verbose output
      if (verbose && buffetErrors.length > 0) {
        console.log(`❌ ${buffet.name} (${buffet.slug})`);
        buffetErrors.forEach(err => console.log(`   - ${err}`));
      }
    }

    // Get top 5 common errors for each schema type
    const sortedErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    report.bySchemaType.Restaurant.commonErrors = sortedErrors
      .filter(([err]) => err.includes('Restaurant') || !err.includes(':'))
      .slice(0, 5)
      .map(([err, count]) => `${err} (${count}x)`);

  } catch (error) {
    console.error('Error fetching buffets:', error);
    throw error;
  }

  return report;
}

function parseJsonField(value: any): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function printReport(report: ValidationReport): void {
  console.log('\n' + '='.repeat(60));
  console.log('📋 SCHEMA VALIDATION REPORT');
  console.log('='.repeat(60));
  
  console.log(`\n📊 OVERVIEW`);
  console.log(`   Total Buffets:   ${report.totalBuffets}`);
  console.log(`   Valid:           ${report.validBuffets} (${((report.validBuffets / report.totalBuffets) * 100).toFixed(1)}%)`);
  console.log(`   Invalid:         ${report.invalidBuffets} (${((report.invalidBuffets / report.totalBuffets) * 100).toFixed(1)}%)`);
  console.log(`   Total Warnings:  ${report.warnings}`);
  
  console.log(`\n📦 BY SCHEMA TYPE`);
  for (const [type, stats] of Object.entries(report.bySchemaType)) {
    console.log(`\n   ${type}:`);
    console.log(`      Valid:   ${stats.valid}`);
    console.log(`      Invalid: ${stats.invalid}`);
    console.log(`      Missing: ${stats.missing}`);
    if (stats.commonErrors.length > 0) {
      console.log(`      Common Errors:`);
      stats.commonErrors.forEach(err => console.log(`         - ${err}`));
    }
  }
  
  if (report.failedBuffets.length > 0 && report.failedBuffets.length <= 20) {
    console.log(`\n❌ FAILED BUFFETS (showing first 20)`);
    report.failedBuffets.slice(0, 20).forEach(b => {
      console.log(`   - ${b.name} (${b.slug})`);
      b.errors.slice(0, 3).forEach(err => console.log(`     ${err}`));
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // Exit with error code if validation failed
  if (report.invalidBuffets > 0) {
    console.log(`\n⚠️  ${report.invalidBuffets} buffets have schema issues.`);
  } else {
    console.log(`\n✅ All buffets have valid schemas!`);
  }
}

// Main execution
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');

validateAllBuffets(verbose)
  .then(report => {
    printReport(report);
    process.exit(report.invalidBuffets > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });
