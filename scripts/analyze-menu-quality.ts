/**
 * Analyze Menu Quality Script
 * 
 * Analyzes menu data quality for buffets to identify which need cleaning.
 * Scores menus based on:
 * - Valid item names (not garbled/OCR errors)
 * - Valid price formats ($X.XX pattern)
 * - Proper categorization
 * - No non-menu content (addresses, map data)
 * 
 * Usage:
 *   npx tsx scripts/analyze-menu-quality.ts
 *   npx tsx scripts/analyze-menu-quality.ts --limit 20
 *   npx tsx scripts/analyze-menu-quality.ts --verbose
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const DEFAULT_LIMIT = 20;

// Quality scoring thresholds
const QUALITY_THRESHOLDS = {
  GARBLED_TEXT_RATIO: 0.3, // If more than 30% of items look garbled, flag
  VALID_PRICE_RATIO: 0.5, // If less than 50% have valid prices, flag
  MIN_ITEMS_PER_MENU: 3, // Minimum items for a useful menu
  NON_MENU_CONTENT_KEYWORDS: [
    'keyboard shortcuts',
    'map data',
    'google',
    'terms of use',
    'privacy policy',
    'copyright',
    'all rights reserved',
    'open 7 days',
    'open? days',
    'delivery available',
    'call for',
    'www.',
    '.com',
    'phone:',
    'tel:',
    'fax:',
  ],
  GARBLED_PATTERNS: [
    /^[A-Z]{2,}\s+[A-Z]{2,}\s+[A-Z]{2,}/, // All caps words
    /[^\x00-\x7F]+/, // Non-ASCII characters (may indicate encoding issues)
    /\d{5,}/, // Long numbers (zip codes, phone numbers)
    /^[\d\s.,$-]+$/, // Only numbers and symbols
    /^.{1,2}$/, // Very short items (1-2 chars)
    /^\d+\.\s*$/, // Just a number with period
    /^[A-Z]\s+[A-Z]\s+[A-Z]/, // Spaced out single letters (OCR artifact)
  ],
};

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  priceNumber?: number | null;
  categoryName?: string;
}

interface Menu {
  id: string;
  placeId: string;
  sourceUrl?: string;
  contentType?: string;
  structuredData?: string;
  categories?: string;
  items?: string;
  status?: string;
  menuItems?: MenuItem[];
}

interface Buffet {
  id: string;
  name: string;
  placeId?: string;
  cityName?: string;
  state?: string;
}

interface QualityScore {
  buffetId: string;
  buffetName: string;
  menuId: string;
  placeId: string;
  totalItems: number;
  validItems: number;
  garbledItems: number;
  itemsWithPrice: number;
  itemsWithValidPrice: number;
  itemsWithBadPrice: number; // Prices like $850 instead of $8.50
  nonMenuContent: number;
  categoryCount: number;
  genericCategoryCount: number;
  overallScore: number; // 0-100
  issues: string[];
  sampleGarbledItems: string[];
  sampleBadPrices: string[];
  sampleNonMenuContent: string[];
  needsCleaning: boolean;
}

// Initialize admin client
function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  
  return init({
    appId,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });
}

/**
 * Check if text appears to be garbled (OCR errors, encoding issues)
 */
function isGarbledText(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  
  const trimmed = text.trim();
  
  // Check against garbled patterns
  for (const pattern of QUALITY_THRESHOLDS.GARBLED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }
  
  // Check for excessive consonant clusters (OCR artifact)
  const consonantCluster = /[bcdfghjklmnpqrstvwxz]{5,}/i;
  if (consonantCluster.test(trimmed)) {
    return true;
  }
  
  // Check for too many special characters
  const specialChars = trimmed.replace(/[a-zA-Z0-9\s.,'-]/g, '');
  if (specialChars.length > trimmed.length * 0.3) {
    return true;
  }
  
  return false;
}

/**
 * Check if text looks like non-menu content
 */
function isNonMenuContent(text: string): boolean {
  if (!text) return false;
  
  const lower = text.toLowerCase();
  
  for (const keyword of QUALITY_THRESHOLDS.NON_MENU_CONTENT_KEYWORDS) {
    if (lower.includes(keyword)) {
      return true;
    }
  }
  
  // Check for address patterns
  const addressPatterns = [
    /\d{5}(-\d{4})?/, // ZIP codes
    /\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)\b/i,
    /\b(suite|ste|apt|unit)\s*#?\d+/i,
    /\b\d+\s+[A-Z][a-z]+\s+(street|st|avenue|ave|road|rd)/i, // Street addresses
  ];
  
  for (const pattern of addressPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a price looks valid (reasonable range for food)
 */
function isPriceValid(price: string | null | undefined, priceNumber: number | null | undefined): { valid: boolean; reason?: string } {
  if (!price && priceNumber === null) {
    return { valid: false, reason: 'no price' };
  }
  
  // If we have priceNumber, check it
  if (priceNumber !== null && priceNumber !== undefined) {
    // Reasonable food prices: $0.50 - $100
    if (priceNumber < 0.5) {
      return { valid: false, reason: 'too low' };
    }
    if (priceNumber > 100) {
      // Likely missing decimal: $850 should be $8.50
      return { valid: false, reason: 'likely missing decimal' };
    }
    return { valid: true };
  }
  
  // Parse from string
  if (price) {
    // Extract numeric value
    const numericMatch = price.replace(/[^0-9.]/g, '');
    const numericValue = parseFloat(numericMatch);
    
    if (isNaN(numericValue)) {
      return { valid: false, reason: 'not a number' };
    }
    
    // Check for missing decimal (prices like $850, $1495)
    if (numericValue > 100 && !price.includes('.')) {
      return { valid: false, reason: 'likely missing decimal' };
    }
    
    if (numericValue < 0.5) {
      return { valid: false, reason: 'too low' };
    }
    
    if (numericValue > 100) {
      return { valid: false, reason: 'too high' };
    }
    
    return { valid: true };
  }
  
  return { valid: false, reason: 'no price' };
}

/**
 * Check if a category name is generic
 */
function isGenericCategory(categoryName: string): boolean {
  const genericNames = [
    'menu items',
    'items',
    'menu',
    'uncategorized',
    'other',
    'misc',
    'miscellaneous',
    'general',
    'all items',
  ];
  
  const lower = categoryName.toLowerCase().trim();
  return genericNames.includes(lower);
}

/**
 * Analyze quality of menu items
 */
function analyzeMenuQuality(buffet: Buffet, menu: Menu, menuItems: MenuItem[]): QualityScore {
  const score: QualityScore = {
    buffetId: buffet.id,
    buffetName: buffet.name,
    menuId: menu.id,
    placeId: menu.placeId,
    totalItems: menuItems.length,
    validItems: 0,
    garbledItems: 0,
    itemsWithPrice: 0,
    itemsWithValidPrice: 0,
    itemsWithBadPrice: 0,
    nonMenuContent: 0,
    categoryCount: 0,
    genericCategoryCount: 0,
    overallScore: 0,
    issues: [],
    sampleGarbledItems: [],
    sampleBadPrices: [],
    sampleNonMenuContent: [],
    needsCleaning: false,
  };
  
  // Track unique categories
  const categories = new Set<string>();
  const genericCategories = new Set<string>();
  
  for (const item of menuItems) {
    // Track categories
    if (item.categoryName) {
      categories.add(item.categoryName);
      if (isGenericCategory(item.categoryName)) {
        genericCategories.add(item.categoryName);
      }
    }
    
    // Check for garbled text
    if (isGarbledText(item.name)) {
      score.garbledItems++;
      if (score.sampleGarbledItems.length < 3) {
        score.sampleGarbledItems.push(item.name);
      }
      continue;
    }
    
    // Check for non-menu content
    if (isNonMenuContent(item.name) || (item.description && isNonMenuContent(item.description))) {
      score.nonMenuContent++;
      if (score.sampleNonMenuContent.length < 3) {
        score.sampleNonMenuContent.push(item.name);
      }
      continue;
    }
    
    // Item is valid
    score.validItems++;
    
    // Check price
    if (item.price || item.priceNumber !== null) {
      score.itemsWithPrice++;
      const priceCheck = isPriceValid(item.price, item.priceNumber);
      if (priceCheck.valid) {
        score.itemsWithValidPrice++;
      } else if (priceCheck.reason === 'likely missing decimal') {
        score.itemsWithBadPrice++;
        if (score.sampleBadPrices.length < 3) {
          score.sampleBadPrices.push(`${item.name}: ${item.price || item.priceNumber}`);
        }
      }
    }
  }
  
  score.categoryCount = categories.size;
  score.genericCategoryCount = genericCategories.size;
  
  // Calculate overall score (0-100)
  let overallScore = 100;
  
  // Deduct for garbled items
  const garbledRatio = score.totalItems > 0 ? score.garbledItems / score.totalItems : 0;
  if (garbledRatio > QUALITY_THRESHOLDS.GARBLED_TEXT_RATIO) {
    overallScore -= 30;
    score.issues.push(`High garbled text ratio: ${(garbledRatio * 100).toFixed(1)}%`);
  } else if (garbledRatio > 0.1) {
    overallScore -= 15;
    score.issues.push(`Some garbled text: ${(garbledRatio * 100).toFixed(1)}%`);
  }
  
  // Deduct for non-menu content
  const nonMenuRatio = score.totalItems > 0 ? score.nonMenuContent / score.totalItems : 0;
  if (nonMenuRatio > 0.2) {
    overallScore -= 20;
    score.issues.push(`Non-menu content: ${(nonMenuRatio * 100).toFixed(1)}%`);
  } else if (nonMenuRatio > 0.05) {
    overallScore -= 10;
    score.issues.push(`Some non-menu content: ${(nonMenuRatio * 100).toFixed(1)}%`);
  }
  
  // Deduct for bad prices
  if (score.itemsWithPrice > 0) {
    const validPriceRatio = score.itemsWithValidPrice / score.itemsWithPrice;
    if (validPriceRatio < QUALITY_THRESHOLDS.VALID_PRICE_RATIO) {
      overallScore -= 15;
      score.issues.push(`Low valid price ratio: ${(validPriceRatio * 100).toFixed(1)}%`);
    }
    
    if (score.itemsWithBadPrice > 0) {
      overallScore -= 10;
      score.issues.push(`${score.itemsWithBadPrice} prices need decimal fix`);
    }
  }
  
  // Deduct for generic categories
  if (score.categoryCount > 0 && score.genericCategoryCount === score.categoryCount) {
    overallScore -= 10;
    score.issues.push('All categories are generic');
  }
  
  // Bonus for having multiple proper categories
  if (score.categoryCount > 3 && score.genericCategoryCount < score.categoryCount / 2) {
    overallScore = Math.min(100, overallScore + 5);
  }
  
  // Deduct for too few items
  if (score.totalItems < QUALITY_THRESHOLDS.MIN_ITEMS_PER_MENU) {
    overallScore -= 20;
    score.issues.push(`Too few items: ${score.totalItems}`);
  }
  
  score.overallScore = Math.max(0, overallScore);
  
  // Determine if cleaning is needed
  score.needsCleaning = score.overallScore < 70 || 
    score.garbledItems > 0 || 
    score.nonMenuContent > 0 || 
    score.itemsWithBadPrice > 0;
  
  return score;
}

/**
 * Print quality report
 */
function printQualityReport(scores: QualityScore[], verbose: boolean): void {
  console.log('\n' + '='.repeat(80));
  console.log('MENU QUALITY ANALYSIS REPORT');
  console.log('='.repeat(80) + '\n');
  
  // Summary statistics
  const totalMenus = scores.length;
  const needsCleaning = scores.filter(s => s.needsCleaning).length;
  const goodQuality = scores.filter(s => s.overallScore >= 80).length;
  const avgScore = scores.reduce((sum, s) => sum + s.overallScore, 0) / totalMenus;
  
  console.log('SUMMARY');
  console.log('-'.repeat(40));
  console.log(`Total menus analyzed: ${totalMenus}`);
  console.log(`Good quality (80+): ${goodQuality} (${((goodQuality / totalMenus) * 100).toFixed(1)}%)`);
  console.log(`Need cleaning: ${needsCleaning} (${((needsCleaning / totalMenus) * 100).toFixed(1)}%)`);
  console.log(`Average score: ${avgScore.toFixed(1)}`);
  console.log('');
  
  // Sort by score (worst first)
  const sorted = [...scores].sort((a, b) => a.overallScore - b.overallScore);
  
  // Print individual menu scores
  console.log('INDIVIDUAL MENU SCORES');
  console.log('-'.repeat(40));
  
  for (const score of sorted) {
    const status = score.needsCleaning ? '❌ NEEDS CLEANING' : '✅ OK';
    console.log(`\n${score.buffetName}`);
    console.log(`  Score: ${score.overallScore}/100 ${status}`);
    console.log(`  Items: ${score.totalItems} total, ${score.validItems} valid, ${score.garbledItems} garbled, ${score.nonMenuContent} non-menu`);
    console.log(`  Prices: ${score.itemsWithPrice} with price, ${score.itemsWithValidPrice} valid, ${score.itemsWithBadPrice} bad`);
    console.log(`  Categories: ${score.categoryCount} total, ${score.genericCategoryCount} generic`);
    
    if (score.issues.length > 0) {
      console.log(`  Issues: ${score.issues.join('; ')}`);
    }
    
    if (verbose) {
      if (score.sampleGarbledItems.length > 0) {
        console.log(`  Sample garbled items:`);
        score.sampleGarbledItems.forEach(item => console.log(`    - "${item}"`));
      }
      if (score.sampleBadPrices.length > 0) {
        console.log(`  Sample bad prices:`);
        score.sampleBadPrices.forEach(item => console.log(`    - ${item}`));
      }
      if (score.sampleNonMenuContent.length > 0) {
        console.log(`  Sample non-menu content:`);
        score.sampleNonMenuContent.forEach(item => console.log(`    - "${item}"`));
      }
    }
  }
  
  // Print buffet IDs needing cleaning (for use in cleaning script)
  console.log('\n' + '='.repeat(80));
  console.log('BUFFET IDs NEEDING CLEANING');
  console.log('-'.repeat(40));
  const idsNeedingCleaning = sorted.filter(s => s.needsCleaning).map(s => s.buffetId);
  console.log(JSON.stringify(idsNeedingCleaning, null, 2));
  
  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getFlagValue = (flag: string, defaultValue: number) => {
    const index = argv.indexOf(flag);
    if (index >= 0 && argv[index + 1]) {
      const num = parseInt(argv[index + 1], 10);
      if (!isNaN(num)) return num;
    }
    return defaultValue;
  };

  const limit = getFlagValue('--limit', DEFAULT_LIMIT);
  const verbose = hasFlag('--verbose') || hasFlag('-v');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN.');
    process.exit(1);
  }

  console.log(`Analyzing menu quality for up to ${limit} buffets...\n`);

  const db = getAdminDb();

  // Query menus with their menuItems
  console.log('Fetching menus with menuItems...');
  const result = await db.query({
    menus: {
      $: { limit: limit * 2 }, // Fetch more to account for filtering
      menuItems: {},
    },
  });

  const menus = (result.menus || []) as Menu[];
  console.log(`Found ${menus.length} menus`);

  // Filter to menus with menuItems
  const menusWithItems = menus.filter(m => m.menuItems && m.menuItems.length > 0);
  console.log(`${menusWithItems.length} menus have menuItems linked`);

  if (menusWithItems.length === 0) {
    console.log('\nNo menus found with menuItems. The menuItems may not be linked yet.');
    console.log('Try running the import script first: npx tsx scripts/import-menu-items.ts');
    process.exit(0);
  }

  // Get buffet names for these menus - fetch all buffets to ensure we can match
  const placeIds = [...new Set(menusWithItems.map(m => m.placeId))];
  console.log(`Looking up ${placeIds.length} buffets by placeId...`);

  // Fetch buffets in batches to get all that might match
  const buffetsByPlaceId = new Map<string, Buffet>();
  let offset = 0;
  const BATCH_SIZE = 500;
  
  while (true) {
    const buffetResult = await db.query({
      buffets: {
        $: { limit: BATCH_SIZE, offset },
      },
    });
    
    const batch = (buffetResult.buffets || []) as Buffet[];
    if (batch.length === 0) break;
    
    for (const buffet of batch) {
      if (buffet.placeId && placeIds.includes(buffet.placeId)) {
        buffetsByPlaceId.set(buffet.placeId, buffet);
      }
    }
    
    // If we've found all the buffets we need, stop
    if (buffetsByPlaceId.size === placeIds.length) break;
    
    offset += BATCH_SIZE;
    
    // Safety limit
    if (offset > 5000) break;
  }
  
  console.log(`Found ${buffetsByPlaceId.size} matching buffets`);

  // Analyze each menu
  const scores: QualityScore[] = [];
  let analyzed = 0;

  for (const menu of menusWithItems) {
    if (analyzed >= limit) break;

    const buffet = buffetsByPlaceId.get(menu.placeId);
    if (!buffet) {
      console.log(`  Skipping menu ${menu.id} - no matching buffet found`);
      continue;
    }

    const menuItems = menu.menuItems || [];
    const score = analyzeMenuQuality(buffet, menu, menuItems);
    scores.push(score);
    analyzed++;

    if (analyzed % 10 === 0) {
      console.log(`  Analyzed ${analyzed}/${limit} menus...`);
    }
  }

  // Print report
  printQualityReport(scores, verbose);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
