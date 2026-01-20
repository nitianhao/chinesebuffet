/**
 * Enhanced test script to evaluate Apify actors for menu_url extraction
 * Tests multiple input formats and alternative approaches
 */

const fs = require('fs');
const path = require('path');
const apify = require('../lib/apify-client');

// Configuration
const JSON_FILE = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
const TEST_SAMPLE_SIZE = 2; // Test with 2 records per actor format

/**
 * Clean Yelp URL - remove query parameters
 */
function cleanYelpUrl(url) {
  if (!url) return null;
  const match = url.match(/https?:\/\/www\.yelp\.com\/biz\/[^?]+/);
  return match ? match[0] : url;
}

/**
 * Extract Yelp alias from URL
 */
function extractYelpAlias(url) {
  if (!url) return null;
  const match = url.match(/yelp\.com\/biz\/([^?\/]+)/);
  return match ? match[1] : null;
}

/**
 * Load JSON file and find records without menu_url
 */
function loadDataAndFindMissingMenuUrls() {
  console.log('📂 Loading JSON file...');
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  
  const recordsWithoutMenuUrl = [];
  
  for (const [key, record] of Object.entries(data)) {
    if (record.yelp && record.yelp.details) {
      if (!record.yelp.details.menu_url) {
        const rawUrl = record.yelp.url || record.yelp.details.url;
        const cleanUrl = cleanYelpUrl(rawUrl);
        const alias = extractYelpAlias(cleanUrl);
        
        recordsWithoutMenuUrl.push({
          buffetId: key,
          yelpUrl: cleanUrl,
          rawYelpUrl: rawUrl,
          yelpId: record.yelp.id || record.yelp.alias || alias,
          alias: alias,
          name: record.yelp.name || record.buffetName,
          city: record.city || record.yelp.city,
          state: record.state || record.yelp.state
        });
      }
    }
  }
  
  console.log(`✅ Found ${recordsWithoutMenuUrl.length} records without menu_url`);
  return recordsWithoutMenuUrl;
}

/**
 * Test an actor with multiple input formats
 */
async function testActorWithFormats(actorId, testRecords) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing Actor: ${actorId}`);
  console.log(`${'='.repeat(70)}`);
  
  const results = {
    actorId,
    formats: [],
    bestFormat: null
  };
  
  // Define multiple input format strategies
  const inputFormats = [];
  
  if (actorId === 'tri_angle/yelp-scraper') {
    // Format 1: directUrls (array of URLs)
    inputFormats.push({
      name: 'directUrls (array)',
      input: {
        directUrls: testRecords.map(r => r.yelpUrl)
      }
    });
    
    // Format 2: directUrls (array of objects)
    inputFormats.push({
      name: 'directUrls (objects)',
      input: {
        directUrls: testRecords.map(r => ({ url: r.yelpUrl }))
      }
    });
    
    // Format 3: startUrls
    inputFormats.push({
      name: 'startUrls',
      input: {
        startUrls: testRecords.map(r => ({ url: r.yelpUrl }))
      }
    });
    
    // Format 4: searchTerms with locations
    if (testRecords.length > 0 && testRecords[0].city && testRecords[0].state) {
      inputFormats.push({
        name: 'searchTerms + locations',
        input: {
          searchTerms: testRecords.map(r => r.name),
          locations: testRecords.map(r => `${r.city}, ${r.state}`),
          searchLimit: testRecords.length
        }
      });
    }
    
    // Format 5: Just URLs array
    inputFormats.push({
      name: 'urls (array)',
      input: {
        urls: testRecords.map(r => r.yelpUrl)
      }
    });
  } else if (actorId === 'web_wanderer/yelp-scraper') {
    // Format 1: urls array
    inputFormats.push({
      name: 'urls (array)',
      input: {
        urls: testRecords.map(r => r.yelpUrl)
      }
    });
    
    // Format 2: startUrls
    inputFormats.push({
      name: 'startUrls',
      input: {
        startUrls: testRecords.map(r => ({ url: r.yelpUrl }))
      }
    });
    
    // Format 3: businessUrls
    inputFormats.push({
      name: 'businessUrls',
      input: {
        businessUrls: testRecords.map(r => r.yelpUrl)
      }
    });
    
    // Format 4: yelpUrls
    inputFormats.push({
      name: 'yelpUrls',
      input: {
        yelpUrls: testRecords.map(r => r.yelpUrl)
      }
    });
    
    // Format 5: directUrls
    inputFormats.push({
      name: 'directUrls',
      input: {
        directUrls: testRecords.map(r => r.yelpUrl)
      }
    });
  }
  
  // Test each format
  for (let i = 0; i < inputFormats.length; i++) {
    const format = inputFormats[i];
    console.log(`\n${'-'.repeat(70)}`);
    console.log(`📋 Testing Format ${i + 1}/${inputFormats.length}: ${format.name}`);
    console.log(`${'-'.repeat(70)}`);
    console.log(`Input:`, JSON.stringify(format.input, null, 2));
    
    const formatResult = {
      formatName: format.name,
      input: format.input,
      success: false,
      itemsCount: 0,
      menuUrlFound: false,
      menuFields: [],
      errors: [],
      runId: null,
      duration: null,
      computeUnits: null,
      sampleItem: null
    };
    
    try {
      const startTime = Date.now();
      const result = await apify.runActor(actorId, format.input, {
        waitForFinish: true,
        timeout: 300000 // 5 minutes timeout
      });
      
      const endTime = Date.now();
      formatResult.duration = `${((endTime - startTime) / 1000).toFixed(2)}s`;
      formatResult.runId = result.runId;
      formatResult.itemsCount = result.items ? result.items.length : 0;
      
      if (result.stats) {
        formatResult.computeUnits = result.stats.computeUnits;
        if (result.stats.computeUnits) {
          const costPer1000CUs = 25;
          formatResult.estimatedCost = (result.stats.computeUnits / 1000) * costPer1000CUs;
        }
      }
      
      console.log(`✅ Run completed: ${formatResult.runId}`);
      console.log(`⏱️  Duration: ${formatResult.duration}`);
      console.log(`📊 Items returned: ${formatResult.itemsCount}`);
      
      if (result.items && result.items.length > 0) {
        formatResult.success = true;
        formatResult.sampleItem = result.items[0];
        
        // Analyze items for menu-related fields
        console.log(`\n📋 Analyzing ${result.items.length} items...`);
        
        const allMenuFields = new Set();
        let menuUrlCount = 0;
        
        for (const item of result.items) {
          // Find all fields that might contain menu info
          const menuFields = Object.keys(item).filter(k => 
            k.toLowerCase().includes('menu') || 
            k.toLowerCase().includes('menulink') ||
            k.toLowerCase().includes('menudisplay')
          );
          
          menuFields.forEach(field => allMenuFields.add(field));
          
          // Check for menu URL values
          const menuUrl = item.menuUrl || item.menu_url || item.menuLink || 
                        item.menu_display_url || item.menuDisplayUrl ||
                        (item.menu && (item.menu.url || item.menu.external_action_url || item.menu.action_url)) ||
                        (item.business_details && item.business_details.menu_url) ||
                        (item.details && item.details.menu_url);
          
          if (menuUrl) {
            menuUrlCount++;
            console.log(`  ✅ Found menu URL in item: ${item.name || item.businessName || 'Unknown'}`);
            console.log(`     Menu URL: ${menuUrl}`);
            if (!formatResult.menuUrlFound) {
              formatResult.menuUrlFound = true;
              formatResult.firstMenuUrl = menuUrl;
            }
          }
        }
        
        formatResult.menuFields = Array.from(allMenuFields);
        formatResult.menuUrlCount = menuUrlCount;
        
        if (allMenuFields.size > 0) {
          console.log(`\n📌 Menu-related fields found: ${Array.from(allMenuFields).join(', ')}`);
        }
        
        if (menuUrlCount > 0) {
          console.log(`\n✅ Found menu URLs in ${menuUrlCount} out of ${result.items.length} items`);
        } else {
          console.log(`\n⚠️  No menu URLs found, but ${result.items.length} items returned`);
          console.log(`   Sample item keys: ${Object.keys(result.items[0]).join(', ')}`);
        }
        
        // Show sample item structure
        if (result.items[0]) {
          console.log(`\n📄 Sample item structure (first 2000 chars):`);
          const sampleStr = JSON.stringify(result.items[0], null, 2);
          console.log(sampleStr.substring(0, 2000) + (sampleStr.length > 2000 ? '...' : ''));
        }
      } else {
        console.log(`⚠️  No items returned`);
        
        // Try to fetch dataset directly
        if (result.runId) {
          try {
            const client = apify.getClient();
            const run = await client.run(result.runId).get();
            if (run.defaultDatasetId) {
              console.log(`\n🔍 Trying to fetch dataset directly...`);
              const datasetItems = await apify.getDatasetItems(run.defaultDatasetId, { limit: 10 });
              console.log(`   Found ${datasetItems.length} items in dataset`);
              if (datasetItems.length > 0) {
                formatResult.itemsCount = datasetItems.length;
                formatResult.success = true;
                formatResult.sampleItem = datasetItems[0];
                console.log(`   Sample item keys: ${Object.keys(datasetItems[0]).join(', ')}`);
              }
            }
          } catch (err) {
            console.log(`   Could not fetch dataset: ${err.message}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      formatResult.errors.push(error.message);
    }
    
    results.formats.push(formatResult);
    
    // Wait between formats to avoid rate limiting
    if (i < inputFormats.length - 1) {
      console.log(`\n⏳ Waiting 3 seconds before next format...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Determine best format
  const successfulFormats = results.formats.filter(f => f.success && f.itemsCount > 0);
  const formatsWithMenu = results.formats.filter(f => f.menuUrlFound);
  
  if (formatsWithMenu.length > 0) {
    results.bestFormat = formatsWithMenu[0];
    console.log(`\n🏆 Best format: ${formatsWithMenu[0].formatName} (found menu URLs)`);
  } else if (successfulFormats.length > 0) {
    results.bestFormat = successfulFormats[0];
    console.log(`\n🏆 Best format: ${successfulFormats[0].formatName} (returned items, but no menu URLs)`);
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Enhanced Apify Menu URL Actor Testing\n');
  
  // Load data
  const recordsWithoutMenuUrl = loadDataAndFindMissingMenuUrls();
  
  if (recordsWithoutMenuUrl.length === 0) {
    console.log('✅ All records already have menu_url!');
    return;
  }
  
  // Get test sample
  const testSample = recordsWithoutMenuUrl.slice(0, TEST_SAMPLE_SIZE);
  console.log(`\n📝 Test sample (${testSample.length} records):`);
  testSample.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} - ${r.yelpUrl}`);
  });
  
  // Test actors
  const actorsToTest = [
    'tri_angle/yelp-scraper',
    'web_wanderer/yelp-scraper'
  ];
  
  const allResults = [];
  
  for (const actorId of actorsToTest) {
    try {
      const result = await testActorWithFormats(actorId, testSample);
      allResults.push(result);
      
      // Wait between actors
      if (actorId !== actorsToTest[actorsToTest.length - 1]) {
        console.log(`\n⏳ Waiting 5 seconds before next actor...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`❌ Failed to test ${actorId}:`, error.message);
      allResults.push({
        actorId,
        error: error.message
      });
    }
  }
  
  // Summary report
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 FINAL SUMMARY REPORT');
  console.log(`${'='.repeat(70)}\n`);
  
  for (const result of allResults) {
    if (result.error) {
      console.log(`\n❌ ${result.actorId}: ${result.error}`);
      continue;
    }
    
    console.log(`\n🎭 Actor: ${result.actorId}`);
    console.log(`   Formats tested: ${result.formats.length}`);
    
    const successful = result.formats.filter(f => f.success && f.itemsCount > 0);
    const withMenu = result.formats.filter(f => f.menuUrlFound);
    
    console.log(`   ✅ Successful formats: ${successful.length}`);
    console.log(`   🍽️  Formats with menu URLs: ${withMenu.length}`);
    
    if (result.bestFormat) {
      console.log(`\n   🏆 Best Format: ${result.bestFormat.formatName}`);
      console.log(`      Items returned: ${result.bestFormat.itemsCount}`);
      console.log(`      Menu URLs found: ${result.bestFormat.menuUrlCount || 0}`);
      console.log(`      Menu fields: ${result.bestFormat.menuFields.join(', ') || 'None'}`);
      if (result.bestFormat.estimatedCost) {
        console.log(`      Estimated cost: $${result.bestFormat.estimatedCost.toFixed(4)}`);
      }
      if (result.bestFormat.firstMenuUrl) {
        console.log(`      Sample menu URL: ${result.bestFormat.firstMenuUrl.substring(0, 80)}...`);
      }
    }
    
    // Show all formats
    console.log(`\n   📋 All formats:`);
    result.formats.forEach((f, i) => {
      const status = f.menuUrlFound ? '✅' : (f.success ? '⚠️' : '❌');
      console.log(`      ${i + 1}. ${status} ${f.formatName}: ${f.itemsCount} items, ${f.menuUrlCount || 0} menu URLs`);
    });
  }
  
  // Save results
  const resultsFile = path.join(__dirname, '../apify-menu-url-test-results-v2.json');
  fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);
  
  // Recommendations
  console.log(`\n${'='.repeat(70)}`);
  console.log('💡 RECOMMENDATIONS');
  console.log(`${'='.repeat(70)}\n`);
  
  const actorsWithMenu = allResults.filter(r => r.bestFormat && r.bestFormat.menuUrlFound);
  
  if (actorsWithMenu.length > 0) {
    console.log('✅ Actors that successfully extracted menu URLs:');
    actorsWithMenu.forEach(r => {
      console.log(`   - ${r.actorId}`);
      console.log(`     Format: ${r.bestFormat.formatName}`);
      console.log(`     Menu URLs found: ${r.bestFormat.menuUrlCount}/${r.bestFormat.itemsCount}`);
    });
  } else {
    console.log('⚠️  No actors successfully extracted menu URLs.');
    console.log('   Consider:');
    console.log('   1. Checking actor documentation for correct input format');
    console.log('   2. Using igview-owner/yelp-business-data-scraper (already tested successfully)');
    console.log('   3. Extracting menu URLs from website field as alternative approach');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});






