// Script to find DoorDash store URLs for restaurants
// Approaches:
// 1. Check existing data (orderBy field, website field)
// 2. Search DoorDash website using Puppeteer
// 3. Use Apify web scraper to search DoorDash

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Load restaurants
function loadRestaurants(limit = null) {
  const dataPath = path.join(__dirname, '../data/buffets-by-id.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  return Object.values(data)
    .filter(buffet => buffet.placeId)
    .slice(0, limit || Infinity);
}

/**
 * Approach 1: Check if DoorDash URL already exists in orderBy or website field
 */
function checkExistingDoorDashUrl(restaurant) {
  // Check website field
  if (restaurant.website && restaurant.website.includes('doordash.com')) {
    return restaurant.website;
  }
  
  // Check orderBy field (if it's populated)
  if (restaurant.orderBy && Array.isArray(restaurant.orderBy)) {
    const doordashLink = restaurant.orderBy.find(
      link => link.orderUrl && link.orderUrl.includes('doordash.com')
    );
    if (doordashLink) return doordashLink.orderUrl;
  }
  
  // If orderBy is a JSON string, parse it
  if (typeof restaurant.orderBy === 'string') {
    try {
      const orderBy = JSON.parse(restaurant.orderBy);
      if (Array.isArray(orderBy)) {
        const doordashLink = orderBy.find(
          link => link.orderUrl && link.orderUrl.includes('doordash.com')
        );
        if (doordashLink) return doordashLink.orderUrl;
      }
    } catch (e) {
      // Not valid JSON
    }
  }
  
  return null;
}

/**
 * Approach 2: Search DoorDash using Puppeteer (local browser automation)
 */
async function searchDoorDashWithPuppeteer(restaurant) {
  let browser = null;
  try {
    console.log(`  Searching DoorDash website for "${restaurant.name}"...`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Build search query: restaurant name + city + state
    const searchQuery = `${restaurant.name} ${restaurant.address.city} ${restaurant.address.stateAbbr}`;
    const searchUrl = `https://www.doordash.com/search/store/${encodeURIComponent(searchQuery)}/`;
    
    console.log(`  Opening: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for search results to load (DoorDash is JavaScript-heavy)
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Try multiple selectors - DoorDash might use different structures
    const storeLinks = await page.evaluate(() => {
      const links = [];
      
      // Try various selectors
      const selectors = [
        'a[href*="/store/"]',
        'a[href*="/restaurant/"]',
        '[data-testid*="store"] a',
        '[data-testid*="restaurant"] a',
        '.sc-.* a[href*="/store/"]',
      ];
      
      for (const selector of selectors) {
        try {
          const found = document.querySelectorAll(selector);
          found.forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.doordash.com${href}`;
              const text = link.textContent.trim() || link.innerText.trim();
              if (fullUrl.includes('/store/') && !fullUrl.includes('/search/')) {
                links.push({ url: fullUrl, text });
              }
            }
          });
        } catch (e) {
          // Continue with next selector
        }
      }
      
      // Remove duplicates
      const unique = [];
      const seen = new Set();
      for (const link of links) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          unique.push(link);
        }
      }
      
      return unique;
    });
    
    // Debug: Log page title and URL to see what we got
    const pageTitle = await page.title();
    const pageUrl = page.url();
    console.log(`  Page loaded: ${pageTitle.substring(0, 50)}... | URL: ${pageUrl}`);
    
    await browser.close();
    
    if (storeLinks.length > 0) {
      // Try to match by name similarity
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const restaurantName = normalize(restaurant.name);
      
      for (const link of storeLinks) {
        const linkName = normalize(link.text || link.url);
        if (restaurantName.includes(linkName) || linkName.includes(restaurantName)) {
          console.log(`  ✓ Found match: ${link.url}`);
          return link.url;
        }
      }
      
      // Return first result if no match found
      console.log(`  ⚠ No exact match, returning first result: ${storeLinks[0].url}`);
      return storeLinks[0].url;
    }
    
    console.log(`  ✗ No store links found`);
    return null;
  } catch (error) {
    console.error(`  ✗ Error searching DoorDash: ${error.message}`);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignore close errors
      }
    }
    return null;
  }
}


/**
 * Main function to find DoorDash URLs
 */
async function findDoorDashUrls(limit = 10) {
  const restaurants = loadRestaurants(limit);
  console.log(`\n🔍 Finding DoorDash URLs for ${restaurants.length} restaurants\n`);
  
  const results = [];
  let foundCount = 0;
  let notFoundCount = 0;
  
  for (let i = 0; i < restaurants.length; i++) {
    const restaurant = restaurants[i];
    console.log(`\n[${i + 1}/${restaurants.length}] ${restaurant.name}`);
    console.log(`  Location: ${restaurant.address.city}, ${restaurant.address.state}`);
    
    let doordashUrl = null;
    
    // Approach 1: Check existing data
    doordashUrl = checkExistingDoorDashUrl(restaurant);
    if (doordashUrl) {
      console.log(`  ✓ Found in existing data: ${doordashUrl}`);
      foundCount++;
      results.push({
        placeId: restaurant.placeId,
        name: restaurant.name,
        doordashUrl,
        source: 'existing_data'
      });
      continue;
    }
    
    // Approach 2: Search using Puppeteer (local browser automation)
    doordashUrl = await searchDoorDashWithPuppeteer(restaurant);
    if (doordashUrl) {
      console.log(`  ✓ Found via web scraping: ${doordashUrl}`);
      foundCount++;
      results.push({
        placeId: restaurant.placeId,
        name: restaurant.name,
        doordashUrl,
        source: 'web_scraping'
      });
    } else {
      console.log(`  ✗ Not found on DoorDash`);
      notFoundCount++;
      results.push({
        placeId: restaurant.placeId,
        name: restaurant.name,
        doordashUrl: null,
        source: 'not_found'
      });
    }
    
    // Small delay between requests
    if (i < restaurants.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Save results
  const outputPath = path.join(__dirname, '../data/doordash-urls.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  
  console.log(`\n\n✅ Complete!`);
  console.log(`  Found: ${foundCount}`);
  console.log(`  Not found: ${notFoundCount}`);
  console.log(`\nResults saved to: ${outputPath}`);
  
  return results;
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  let limit = 10;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
    }
  }
  
  findDoorDashUrls(limit).catch(console.error);
}

module.exports = { findDoorDashUrls, checkExistingDoorDashUrl };

