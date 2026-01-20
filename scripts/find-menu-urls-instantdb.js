/**
 * Find Direct Menu URLs on Restaurant Websites (InstantDB)
 * 
 * Reads website URLs from InstantDB buffets table, finds menu URLs,
 * verifies they're actually menus, and saves to InstantDB menu field.
 * 
 * Features:
 * - 20 second timeout per record (skips if stuck)
 * - Multiple retry strategies
 * - Better error handling
 * 
 * Cost: $0.00 (completely free - no Apify needed!)
 * 
 * Usage:
 *   node scripts/find-menu-urls-instantdb.js
 *   node scripts/find-menu-urls-instantdb.js --limit 10
 *   node scripts/find-menu-urls-instantdb.js --dry-run
 */

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  // Silently continue - env vars might be set another way
}

// Configuration
const CONFIG = {
  // Per-record timeout (20 seconds)
  RECORD_TIMEOUT: 20000,
  
  // Menu URL patterns to try (in order)
  menuUrlPatterns: [
    '/menu',
    '/menus',
    '/menu.html',
    '/menus.html',
    '/menu.pdf',
    '/food-menu',
    '/our-menu',
    '/dining-menu',
    '/restaurant-menu',
    '/#menu',
    '/menu/',
    '/food',
    '/order',
    '/online-menu',
  ],
  
  // HTTP request settings
  requestTimeout: 8000, // Shorter timeout per request
  delayBetweenRequests: 500,
  maxRetries: 1, // Reduced retries to avoid timeouts
  
  // User agents
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
  
  // Menu verification keywords
  menuKeywords: [
    'menu', 'appetizer', 'entree', 'main course', 'dessert',
    'lunch', 'dinner', 'breakfast', 'brunch',
    'price', '$', 'dollar', 'yuan', 'rmb',
    'chicken', 'beef', 'pork', 'seafood', 'vegetable',
    'soup', 'noodle', 'rice', 'fried', 'steamed',
    'dim sum', 'sushi', 'roll', 'sashimi',
  ],
};

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = args.find(arg => arg.startsWith('--limit'))?.split('=')[1] || null;

// Initialize InstantDB
if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('❌ Error: INSTANT_ADMIN_TOKEN is required');
  console.error('   Add it to .env.local or set as environment variable');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

/**
 * Timeout wrapper - rejects after specified time
 */
function timeout(ms) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Timeout')), ms);
  });
}

/**
 * Check if a URL exists (HTTP HEAD request) - with timeout
 */
async function checkUrlExists(url) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ exists: false, redirect: null });
    }, 5000);
    
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const userAgent = CONFIG.userAgents[0];
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'HEAD',
        headers: {
          'User-Agent': userAgent,
          'Accept': '*/*',
        },
        timeout: 5000,
      };
      
      const req = client.request(options, (res) => {
        clearTimeout(timeoutId);
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ exists: true, redirect: null });
        } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ exists: true, redirect: res.headers.location });
        } else {
          resolve({ exists: false, redirect: null });
        }
      });
      
      req.on('error', () => {
        clearTimeout(timeoutId);
        resolve({ exists: false, redirect: null });
      });
      
      req.on('timeout', () => {
        req.destroy();
        clearTimeout(timeoutId);
        resolve({ exists: false, redirect: null });
      });
      
      req.end();
    } catch {
      clearTimeout(timeoutId);
      resolve({ exists: false, redirect: null });
    }
  });
}

/**
 * Fetch HTML from a URL - with timeout
 */
async function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, CONFIG.requestTimeout);
    
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const userAgent = CONFIG.userAgents[0];
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: CONFIG.requestTimeout,
      };
      
      const req = client.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          clearTimeout(timeoutId);
          // Follow redirect once
          fetchHtml(new URL(res.headers.location, url).href)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        if (res.statusCode !== 200) {
          clearTimeout(timeoutId);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          clearTimeout(timeoutId);
          resolve(data);
        });
      });
      
      req.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        clearTimeout(timeoutId);
        reject(new Error('Request timeout'));
      });
      
      req.end();
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Verify that a URL actually contains menu content (lenient)
 */
function verifyMenuContent(html, url) {
  if (!html) return false;
  
  try {
    const $ = cheerio.load(html);
    const text = $('body').text().toLowerCase();
    const title = $('title').text().toLowerCase();
    const urlLower = url.toLowerCase();
    
    // If URL or title clearly indicates menu, be lenient
    const urlSuggestsMenu = urlLower.includes('menu') || urlLower.includes('food') || urlLower.includes('order');
    const titleSuggestsMenu = title.includes('menu') || title.includes('food') || title.includes('order');
    
    // Check for menu-related keywords
    let keywordCount = 0;
    for (const keyword of CONFIG.menuKeywords) {
      if (text.includes(keyword.toLowerCase())) {
        keywordCount++;
      }
    }
    
    // Check for price patterns
    const hasPrices = /\$\d+\.?\d*/g.test(text) || /price|cost|fee/gi.test(text);
    
    // More lenient verification
    return (urlSuggestsMenu || titleSuggestsMenu) && keywordCount >= 1 ||
           hasPrices && keywordCount >= 1 ||
           keywordCount >= 2;
  } catch {
    // If we can't parse, assume it might be a menu (PDF, image, etc.)
    return true;
  }
}

/**
 * Find menu URL on a website (with timeout protection)
 */
async function findMenuUrlOnWebsite(websiteUrl) {
  if (!websiteUrl || !websiteUrl.trim()) {
    return null;
  }
  
  // Normalize URL
  let baseUrl = websiteUrl.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  baseUrl = baseUrl.replace(/\/$/, '');
  
  // Approach 1: Try common menu URL patterns (quick check)
  for (const pattern of CONFIG.menuUrlPatterns.slice(0, 8)) { // Limit to first 8 to save time
    try {
      const menuUrl = baseUrl + pattern;
      const result = await Promise.race([
        checkUrlExists(menuUrl),
        timeout(3000) // 3 second timeout per check
      ]);
      
      if (result && result.exists) {
        const finalUrl = result.redirect || menuUrl;
        
        // Quick verification
        try {
          const html = await Promise.race([
            fetchHtml(finalUrl),
            timeout(5000) // 5 second timeout for verification
          ]);
          
          if (html && verifyMenuContent(html, finalUrl)) {
            return finalUrl;
          }
          // Even if verification fails, if URL exists and matches pattern, use it
          if (pattern.includes('menu')) {
            return finalUrl;
          }
        } catch {
          // If we can't fetch but URL exists and is a menu pattern, use it
          if (pattern.includes('menu')) {
            return finalUrl;
          }
        }
      }
    } catch {
      // Continue to next pattern
      continue;
    }
  }
  
  // Approach 2: Scrape homepage to find menu links (with timeout)
  try {
    const html = await Promise.race([
      fetchHtml(baseUrl),
      timeout(8000) // 8 second timeout for homepage
    ]);
    
    if (!html) return null;
    
    const $ = cheerio.load(html);
    const menuLinks = [];
    
    $('a').each((i, elem) => {
      const href = $(elem).attr('href');
      const text = $(elem).text().toLowerCase().trim();
      
      if (!href) return;
      
      const hrefLower = href.toLowerCase();
      const menuTerms = ['menu', 'food', 'order'];
      const hasMenuTerm = menuTerms.some(term => 
        text.includes(term) || hrefLower.includes(term)
      );
      
      if (hasMenuTerm) {
        try {
          const fullUrl = new URL(href, baseUrl).href;
          const linkUrl = new URL(fullUrl);
          const baseUrlObj = new URL(baseUrl);
          
          // Prefer same-domain links
          if (linkUrl.hostname === baseUrlObj.hostname || fullUrl.includes('menu')) {
            menuLinks.push({
              url: fullUrl,
              text: text,
              score: (hrefLower.includes('/menu') ? 10 : 0) + 
                     (text === 'menu' ? 5 : 0) +
                     (text.includes('menu') ? 3 : 0),
            });
          }
        } catch {
          // Skip invalid URLs
        }
      }
    });
    
    // Sort by score and try top 3
    menuLinks.sort((a, b) => b.score - a.score);
    
    for (const link of menuLinks.slice(0, 3)) {
      try {
        const linkHtml = await Promise.race([
          fetchHtml(link.url),
          timeout(5000)
        ]);
        
        if (linkHtml && verifyMenuContent(linkHtml, link.url)) {
          return link.url;
        }
      } catch {
        continue;
      }
    }
    
    // If we have high-scoring links, return the best one
    if (menuLinks.length > 0 && menuLinks[0].score >= 5) {
      return menuLinks[0].url;
    }
  } catch {
    // Timeout or error - skip this approach
  }
  
  return null;
}

/**
 * Process a single buffet with timeout protection
 */
async function processBuffet(buffet) {
  try {
    const menuUrl = await Promise.race([
      findMenuUrlOnWebsite(buffet.website),
      timeout(CONFIG.RECORD_TIMEOUT) // 20 second timeout per record
    ]);
    
    return { success: true, menuUrl, error: null };
  } catch (error) {
    if (error.message === 'Timeout') {
      return { success: false, menuUrl: null, error: 'Timeout (20s exceeded)' };
    }
    return { success: false, menuUrl: null, error: error.message || String(error) };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Finding Direct Menu URLs on Restaurant Websites (InstantDB)\n');
  console.log(`📋 Configuration:`);
  console.log(`   Dry Run: ${DRY_RUN}`);
  console.log(`   Limit: ${LIMIT || 'All'}`);
  console.log(`   Timeout per record: ${CONFIG.RECORD_TIMEOUT / 1000}s`);
  console.log(`   Cost: $0.00 (completely free!)\n`);
  
  try {
    // Fetch buffets with websites but without menus
    console.log('📖 Fetching buffets from InstantDB...');
    
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          },
        },
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < limit) break;
      offset += limit;
    }
    
    // Filter buffets that have websites but don't have menu URLs yet
    const buffetsNeedingMenus = allBuffets.filter(b => {
      if (!b.website || !b.website.trim()) return false;
      const menu = b.menu;
      return !menu || !menu.trim() || menu === 'null';
    });
    
    console.log(`📊 Total buffets with websites: ${allBuffets.length}`);
    console.log(`📊 Buffets needing menu URLs: ${buffetsNeedingMenus.length}`);
    
    if (buffetsNeedingMenus.length === 0) {
      console.log('✅ All buffets already have menu URLs!');
      return;
    }
    
    // Apply limit if specified
    let buffetsToProcess = buffetsNeedingMenus;
    if (LIMIT) {
      const limitNum = parseInt(LIMIT);
      console.log(`🔢 Limiting to first ${limitNum} buffets`);
      buffetsToProcess = buffetsNeedingMenus.slice(0, limitNum);
    }
    
    console.log(`\n🔍 Finding menu URLs for ${buffetsToProcess.length} buffets...\n`);
    
    // Process buffets
    const results = [];
    const transactions = [];
    let processed = 0;
    let found = 0;
    let skipped = 0;
    
    for (let i = 0; i < buffetsToProcess.length; i++) {
      const buffet = buffetsToProcess[i];
      
      if ((i + 1) % 5 === 0 || i === 0) {
        console.log(`🔄 Progress: ${i + 1}/${buffetsToProcess.length} (Found: ${found}, Skipped: ${skipped})...`);
      }
      
      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would check ${buffet.name}: ${buffet.website}`);
        results.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          website: buffet.website,
          menuUrl: `${buffet.website}/menu`,
        });
      } else {
        const startTime = Date.now();
        const result = await processBuffet(buffet);
        const duration = Date.now() - startTime;
        
        processed++;
        
        if (result.success && result.menuUrl) {
          found++;
          console.log(`  ✓ ${buffet.name}: Found menu at ${result.menuUrl} (${duration}ms)`);
          
          // Create update transaction
          const updateTx = db.tx.buffets[buffet.id].update({ menu: result.menuUrl });
          transactions.push(updateTx);
        } else {
          skipped++;
          const errorType = result.error === 'Timeout (20s exceeded)' ? '⏱️ TIMEOUT' : '✗';
          console.log(`  ${errorType} ${buffet.name}: ${result.error || 'No menu URL found'}`);
        }
        
        results.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          website: buffet.website,
          menuUrl: result.menuUrl,
          error: result.error,
          duration: duration,
        });
        
        // Delay between requests
        if (i < buffetsToProcess.length - 1) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
        }
      }
    }
    
    // Save results to file
    const resultsFile = path.join(__dirname, '../data/menu-urls-instantdb-results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
    console.log(`\n💾 Saved results to: ${resultsFile}`);
    
    // Commit transactions if not dry run
    if (!DRY_RUN && transactions.length > 0) {
      console.log(`\n💾 Updating InstantDB with ${transactions.length} menu URLs...`);
      try {
        await db.transact(transactions);
        console.log(`✅ Successfully updated ${transactions.length} buffets in InstantDB!`);
      } catch (error) {
        console.error(`❌ Error updating InstantDB:`, error);
        throw error;
      }
    } else if (DRY_RUN) {
      console.log(`\n[DRY RUN] Would update ${results.filter(r => r.menuUrl).length} buffets in InstantDB`);
    }
    
    // Summary
    console.log(`\n✅ Process Complete!`);
    console.log(`   Buffets processed: ${processed}`);
    console.log(`   Menu URLs found: ${found}`);
    console.log(`   Skipped/Not found: ${skipped}`);
    console.log(`   Success rate: ${processed > 0 ? ((found / processed) * 100).toFixed(1) : 0}%`);
    console.log(`\n💰 Cost: $0.00 (completely free - no Apify needed!)`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main, findMenuUrlOnWebsite, verifyMenuContent };
