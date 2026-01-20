/**
 * Extract Menu URLs from Google Places using Apify
 * 
 * This script uses Apify actors to extract menu URLs from Google Places data.
 * 
 * Usage:
 *   node scripts/extract-google-places-menu-urls.js [options]
 * 
 * Options:
 *   --input <file>              - Input JSON file with place IDs or place data
 *   --output <file>              - Output JSON file for results
 *   --actor <actorId>            - Apify actor ID (default: compass/crawler-google-places)
 *   --test                       - Test mode (processes only first 5 places)
 *   --place-id <id>              - Test with a single place ID
 *   --max-places <number>        - Maximum places to process
 *   --no-wait                    - Don't wait for actor to finish
 *   --timeout <ms>               - Timeout in milliseconds (default: 3600000)
 * 
 * Examples:
 *   # Extract menu URLs from a JSON file with place IDs
 *   node scripts/extract-google-places-menu-urls.js \
 *     --input data/places.json \
 *     --output results/menu-urls.json
 * 
 *   # Test with a single place ID
 *   node scripts/extract-google-places-menu-urls.js \
 *     --test \
 *     --place-id "ChIJ27isjSkjhYARsl2iAuDOEeU"
 * 
 *   # Use alternative actor
 *   node scripts/extract-google-places-menu-urls.js \
 *     --input data/places.json \
 *     --actor fatihtahta/google-maps-scraper-enterprise
 */

const fs = require('fs');
const path = require('path');
const { runActor, getRunStatus, getDatasetItems } = require('../lib/apify-client');

// Parse command line arguments
const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;
let actorId = 'compass/crawler-google-places'; // Cheapest option
let testMode = false;
let placeId = null;
let maxPlaces = null;
let noWait = false;
let timeout = 3600000; // 1 hour default

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  
  if (arg === '--input' && nextArg) {
    inputFile = nextArg;
    i++;
  } else if (arg === '--output' && nextArg) {
    outputFile = nextArg;
    i++;
  } else if (arg === '--actor' && nextArg) {
    actorId = nextArg;
    i++;
  } else if (arg === '--test') {
    testMode = true;
  } else if (arg === '--place-id' && nextArg) {
    placeId = nextArg;
    testMode = true;
    i++;
  } else if (arg === '--max-places' && nextArg) {
    maxPlaces = parseInt(nextArg, 10);
    i++;
  } else if (arg === '--no-wait') {
    noWait = true;
  } else if (arg === '--timeout' && nextArg) {
    timeout = parseInt(nextArg, 10);
    i++;
  }
}

// Default output filename
if (!outputFile) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  outputFile = `google-places-menu-urls_${timestamp}.json`;
}

/**
 * Extract menu URL from place data
 * Tries multiple fields and patterns
 */
function extractMenuUrl(place) {
  // Method 1: Direct menu URL fields
  if (place.menuUrl) return place.menuUrl;
  if (place.menu_url) return place.menu_url;
  if (place.menu?.url) return place.menu.url;
  if (place.menu?.actionUrl) return place.menu.actionUrl;
  if (place.menu?.externalActionUrl) return place.menu.externalActionUrl;
  if (place.menu?.displayUrl) return place.menu.displayUrl;
  if (place.menu?.menuUrl) return place.menu.menuUrl;
  
  // Method 2: From menu object
  if (place.menu && typeof place.menu === 'string') {
    return place.menu;
  }
  
  // Method 3: From additionalInfo or other fields
  if (place.additionalInfo?.menuUrl) return place.additionalInfo.menuUrl;
  if (place.additionalInfo?.menu?.url) return place.additionalInfo.menu.url;
  
  // Method 4: Construct from website (fallback)
  if (place.website) {
    // Try common menu URL patterns
    const website = place.website.replace(/\/$/, ''); // Remove trailing slash
    const patterns = [
      `${website}/menu`,
      `${website}/menus`,
      `${website}/menu.html`,
      `${website}/#menu`,
      `${website}/food-menu`,
    ];
    // Return first pattern (you may want to verify these exist)
    return patterns[0];
  }
  
  return null;
}

/**
 * Prepare input for Apify actor based on actor type
 */
function prepareActorInput(places, actorId) {
  if (actorId === 'compass/crawler-google-places') {
    // For compass/crawler-google-places
    if (placeId) {
      // Single place ID test
      return {
        placeIds: [placeId],
        includeMenu: true,
      };
    }
    
    // Extract place IDs from input
    const placeIds = places
      .map(p => p.placeId || p.place_id || p.id)
      .filter(Boolean)
      .slice(0, maxPlaces || places.length);
    
    return {
      placeIds: placeIds,
      includeMenu: true,
    };
  } else if (actorId === 'fatihtahta/google-maps-scraper-enterprise') {
    // For fatihtahta/google-maps-scraper-enterprise
    if (placeId) {
      return {
        placeIds: [placeId],
      };
    }
    
    const placeIds = places
      .map(p => p.placeId || p.place_id || p.id)
      .filter(Boolean)
      .slice(0, maxPlaces || places.length);
    
    return {
      placeIds: placeIds,
    };
  } else if (actorId === 'apify/google-maps-scraper') {
    // For apify/google-maps-scraper (may need different input format)
    // This actor typically uses queries, not place IDs
    console.warn('⚠️  apify/google-maps-scraper may not support place IDs directly');
    console.warn('   Consider using compass/crawler-google-places instead');
    
    // Try to construct queries from place data
    const queries = places
      .slice(0, maxPlaces || places.length)
      .map(p => {
        const name = p.name || p.title || '';
        const location = p.address || `${p.city || ''}, ${p.state || ''}`;
        return `${name} ${location}`.trim();
      })
      .filter(Boolean);
    
    return {
      queries: queries,
      maxCrawledPlaces: queries.length,
    };
  }
  
  // Default: try placeIds
  const placeIds = places
    .map(p => p.placeId || p.place_id || p.id)
    .filter(Boolean)
    .slice(0, maxPlaces || places.length);
  
  return {
    placeIds: placeIds,
    includeMenu: true,
  };
}

/**
 * Process results and extract menu URLs
 */
function processResults(items, originalPlaces) {
  const results = [];
  const placeMap = new Map();
  
  // Create a map of place IDs to original place data
  originalPlaces.forEach(place => {
    const id = place.placeId || place.place_id || place.id;
    if (id) {
      placeMap.set(id, place);
    }
  });
  
  items.forEach(item => {
    const placeId = item.placeId || item.place_id || item.id;
    const originalPlace = placeMap.get(placeId) || {};
    
    const menuUrl = extractMenuUrl(item);
    
    results.push({
      placeId: placeId,
      name: item.title || item.name || originalPlace.name || originalPlace.title || 'Unknown',
      address: item.address || item.fullAddress || originalPlace.address || null,
      menuUrl: menuUrl,
      website: item.website || originalPlace.website || null,
      source: actorId,
      extractedAt: new Date().toISOString(),
      // Include original data for reference
      originalData: {
        hasMenuField: !!(item.menu || item.menuUrl || item.menu_url),
        menuObject: item.menu || null,
      },
    });
  });
  
  return results;
}

async function main() {
  try {
    console.log(`\n🍽️  Google Places Menu URL Extraction\n`);
    console.log(`🎭 Actor: ${actorId}`);
    
    let places = [];
    
    // Load input data
    if (placeId) {
      // Test mode with single place ID
      places = [{ placeId: placeId }];
      console.log(`🧪 Test Mode: Single place ID`);
      console.log(`   Place ID: ${placeId}`);
    } else if (inputFile) {
      const inputPath = path.resolve(inputFile);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }
      
      const inputData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      places = Array.isArray(inputData) ? inputData : [inputData];
      console.log(`📥 Loaded ${places.length} places from: ${inputPath}`);
    } else {
      throw new Error('Either --input file or --place-id is required');
    }
    
    // Apply test mode limit
    if (testMode && !placeId) {
      places = places.slice(0, 5);
      console.log(`🧪 Test Mode: Processing first 5 places`);
    }
    
    // Apply max places limit
    if (maxPlaces && places.length > maxPlaces) {
      places = places.slice(0, maxPlaces);
      console.log(`📊 Limited to ${maxPlaces} places`);
    }
    
    console.log(`📊 Processing ${places.length} places\n`);
    
    // Prepare actor input
    const actorInput = prepareActorInput(places, actorId);
    console.log(`📥 Actor Input:`, JSON.stringify(actorInput, null, 2));
    console.log();
    
    // Run actor
    const result = await runActor(actorId, actorInput, {
      waitForFinish: !noWait,
      timeout: timeout,
    });
    
    if (noWait && result.runId) {
      console.log(`\n✅ Actor run started (not waiting)`);
      console.log(`📋 Run ID: ${result.runId}`);
      console.log(`🔗 View run: https://console.apify.com/actors/runs/${result.runId}`);
      console.log(`\n💡 Check status later with:`);
      console.log(`   node scripts/check-apify-run.js ${result.runId}`);
      return;
    }
    
    // Process results
    console.log(`\n📊 Processing ${result.items.length} results...`);
    const menuUrlResults = processResults(result.items, places);
    
    // Count successful extractions
    const withMenuUrl = menuUrlResults.filter(r => r.menuUrl).length;
    const withoutMenuUrl = menuUrlResults.length - withMenuUrl;
    
    console.log(`✅ Extracted menu URLs: ${withMenuUrl}`);
    console.log(`❌ No menu URL found: ${withoutMenuUrl}`);
    
    // Save results
    const outputPath = path.resolve(outputFile);
    fs.writeFileSync(outputPath, JSON.stringify(menuUrlResults, null, 2));
    
    console.log(`\n💾 Results saved to: ${outputPath}`);
    
    // Show sample results
    if (menuUrlResults.length > 0) {
      console.log(`\n📋 Sample Results:`);
      menuUrlResults.slice(0, 3).forEach((result, idx) => {
        console.log(`\n   ${idx + 1}. ${result.name}`);
        console.log(`      Place ID: ${result.placeId}`);
        console.log(`      Menu URL: ${result.menuUrl || '❌ Not found'}`);
        if (result.website) {
          console.log(`      Website: ${result.website}`);
        }
      });
    }
    
    // Cost estimation
    console.log(`\n💰 Cost Estimation:`);
    console.log(`   Places processed: ${places.length}`);
    if (actorId === 'compass/crawler-google-places') {
      const cost = 0.007 + (places.length * 0.004);
      console.log(`   Estimated cost: $${cost.toFixed(3)}`);
      console.log(`   (Actor start: $0.007 + ${places.length} places × $0.004)`);
    } else if (actorId === 'fatihtahta/google-maps-scraper-enterprise') {
      const cost = (places.length / 1000) * 2.50;
      console.log(`   Estimated cost: $${cost.toFixed(2)}`);
      console.log(`   ($2.50 per 1,000 places)`);
    } else {
      console.log(`   Check actor pricing in Apify console`);
    }
    
    console.log(`\n✅ Done!`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();




