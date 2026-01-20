/**
 * Test script to evaluate 3 Apify actors for menu_url extraction
 * 
 * Actors to test:
 * 1. tri_angle/yelp-scraper
 * 2. web_wanderer/yelp-scraper
 * 3. igview-owner/yelp-business-data-scraper
 */

const fs = require('fs');
const path = require('path');
const apify = require('../lib/apify-client');

// Configuration
const JSON_FILE = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
const TEST_SAMPLE_SIZE = 3; // Test with 3 records per actor
const ACTORS = [
  {
    id: 'tri_angle/yelp-scraper',
    name: 'tri_angle/yelp-scraper'
  },
  {
    id: 'web_wanderer/yelp-scraper',
    name: 'web_wanderer/yelp-scraper'
  },
  {
    id: 'igview-owner/yelp-business-data-scraper',
    name: 'igview-owner/yelp-business-data-scraper'
  }
];

/**
 * Clean Yelp URL - remove query parameters
 */
function cleanYelpUrl(url) {
  if (!url) return null;
  // Extract base URL: https://www.yelp.com/biz/alias
  const match = url.match(/https?:\/\/www\.yelp\.com\/biz\/[^?]+/);
  return match ? match[0] : url;
}

/**
 * Load JSON file and find records without menu_url
 */
function loadDataAndFindMissingMenuUrls() {
  console.log('📂 Loading JSON file...');
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  
  const recordsWithoutMenuUrl = [];
  const recordsWithMenuUrl = [];
  
  for (const [key, record] of Object.entries(data)) {
    if (record.yelp && record.yelp.details) {
      if (!record.yelp.details.menu_url) {
        const rawUrl = record.yelp.url || record.yelp.details.url;
        const cleanUrl = cleanYelpUrl(rawUrl);
        recordsWithoutMenuUrl.push({
          buffetId: key,
          yelpUrl: cleanUrl,
          rawYelpUrl: rawUrl,
          yelpId: record.yelp.id || record.yelp.alias,
          name: record.yelp.name || record.buffetName
        });
      } else {
        recordsWithMenuUrl.push(key);
      }
    }
  }
  
  console.log(`✅ Found ${recordsWithoutMenuUrl.length} records without menu_url`);
  console.log(`✅ Found ${recordsWithMenuUrl.length} records with menu_url`);
  
  return recordsWithoutMenuUrl;
}

/**
 * Get actor pricing information
 */
async function getActorPricing(actorId) {
  try {
    const client = apify.getClient();
    const actor = await client.actor(actorId).get();
    
    return {
      name: actor.name,
      username: actor.username,
      pricing: actor.pricing || 'Not specified',
      stats: actor.stats || {},
      description: actor.description || 'No description'
    };
  } catch (error) {
    console.error(`❌ Error getting pricing for ${actorId}:`, error.message);
    return null;
  }
}

/**
 * Test an actor with a sample of records
 */
async function testActor(actorId, testRecords) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing Actor: ${actorId}`);
  console.log(`${'='.repeat(60)}`);
  
  // Get actor info and pricing
  const actorInfo = await getActorPricing(actorId);
  if (actorInfo) {
    console.log(`📋 Actor Name: ${actorInfo.name}`);
    console.log(`👤 Username: ${actorInfo.username}`);
    console.log(`💰 Pricing: ${JSON.stringify(actorInfo.pricing, null, 2)}`);
  }
  
  const results = {
    actorId,
    actorInfo,
    testRecords: [],
    successCount: 0,
    menuUrlFoundCount: 0,
    errors: [],
    runId: null,
    cost: null
  };
  
  // Prepare input based on actor
  let input = {};
  
  // Different actors may have different input formats
  // Clean URLs first
  const cleanUrls = testRecords.map(r => r.yelpUrl).filter(Boolean);
  
  if (actorId === 'tri_angle/yelp-scraper') {
    // tri_angle/yelp-scraper uses startUrls
    input = {
      startUrls: cleanUrls.map(url => ({ url }))
    };
  } else if (actorId === 'web_wanderer/yelp-scraper') {
    // web_wanderer/yelp-scraper uses urls array
    input = {
      urls: cleanUrls
    };
  } else if (actorId === 'igview-owner/yelp-business-data-scraper') {
    // igview-owner/yelp-business-data-scraper uses businessUrls
    input = {
      businessUrls: cleanUrls
    };
  } else {
    // Default: try startUrls
    input = {
      startUrls: cleanUrls.map(url => ({ url }))
    };
  }
  
  console.log(`\n📥 Input format:`, JSON.stringify(input, null, 2));
  
  try {
    // Start the actor run
    const startTime = Date.now();
    const result = await apify.runActor(actorId, input, {
      waitForFinish: true,
      timeout: 600000 // 10 minutes timeout
    });
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    results.runId = result.runId;
    results.duration = `${duration}s`;
    results.itemsCount = result.items ? result.items.length : 0;
    
    console.log(`\n✅ Actor completed successfully!`);
    console.log(`⏱️  Duration: ${duration}s`);
    console.log(`📊 Items returned: ${result.items ? result.items.length : 0}`);
    
    // Analyze results
    if (result.items && result.items.length > 0) {
      console.log(`\n📋 Analyzing results...`);
      
      // Show all items first to understand structure
      console.log(`\n📄 All returned items (${result.items.length}):`);
      result.items.forEach((item, idx) => {
        console.log(`\n  Item ${idx + 1}:`);
        console.log(`    Keys: ${Object.keys(item).join(', ')}`);
        // Try to find URL or name to match
        const itemUrl = item.url || item.business_url || item.businessUrl || item.yelpUrl || '';
        const itemName = item.name || item.businessName || '';
        console.log(`    URL: ${itemUrl}`);
        console.log(`    Name: ${itemName}`);
        
        // Check for menu-related fields
        const menuFields = Object.keys(item).filter(k => 
          k.toLowerCase().includes('menu') || 
          k.toLowerCase().includes('menuurl') ||
          k.toLowerCase().includes('menulink')
        );
        if (menuFields.length > 0) {
          console.log(`    Menu fields found: ${menuFields.join(', ')}`);
          menuFields.forEach(field => {
            console.log(`      ${field}: ${item[field]}`);
          });
        }
      });
      
      // Try to match items with test records
      for (const item of result.items) {
        const itemUrl = item.url || item.business_url || item.businessUrl || item.yelpUrl || '';
        const itemName = item.name || item.businessName || '';
        
        // Try to match by URL or name
        const testRecord = testRecords.find(r => {
          const rAlias = r.yelpId || '';
          const rName = r.name || '';
          return itemUrl.includes(rAlias) || 
                 itemUrl.includes(r.yelpUrl?.split('/').pop() || '') ||
                 itemName.toLowerCase().includes(rName.toLowerCase()) ||
                 rName.toLowerCase().includes(itemName.toLowerCase());
        });
        
        // Check for menu URL in various possible field names
        const menuUrlValue = item.menuUrl || item.menu_url || item.menu || item.menuLink || 
                            item.menu_url || item.menuUrl || item.menu_link || 
                            (item.business_details && (item.business_details.menu_url || item.business_details.menuUrl)) ||
                            (item.details && (item.details.menu_url || item.details.menuUrl));
        
        const hasMenuUrl = !!menuUrlValue;
        
        if (testRecord) {
          results.testRecords.push({
            name: testRecord.name,
            yelpUrl: testRecord.yelpUrl,
            matchedItemName: itemName,
            matchedItemUrl: itemUrl,
            hasMenuUrl,
            menuUrl: menuUrlValue,
            allFields: Object.keys(item)
          });
          
          if (hasMenuUrl) {
            results.menuUrlFoundCount++;
            console.log(`\n  ✅ Found menu_url for: ${testRecord.name}`);
            console.log(`     Menu URL: ${menuUrlValue}`);
          } else {
            console.log(`\n  ❌ No menu_url found for: ${testRecord.name}`);
            console.log(`     Available fields: ${Object.keys(item).join(', ')}`);
          }
        } else {
          // Item doesn't match any test record, but still check for menu
          if (hasMenuUrl) {
            console.log(`\n  ℹ️  Found menu_url in unmatched item: ${itemName}`);
            console.log(`     Menu URL: ${menuUrlValue}`);
          }
        }
      }
      
      results.successCount = results.testRecords.length;
      
      // Show full sample of first item
      if (result.items[0]) {
        console.log(`\n📄 Full sample output structure (first item):`);
        console.log(JSON.stringify(result.items[0], null, 2));
      }
    } else {
      console.log(`⚠️  No items returned from actor`);
      // Try to fetch dataset items directly
      if (result.runId) {
        try {
          const client = apify.getClient();
          const run = await client.run(result.runId).get();
          if (run.defaultDatasetId) {
            console.log(`\n🔍 Trying to fetch dataset items directly...`);
            const datasetItems = await apify.getDatasetItems(run.defaultDatasetId, { limit: 10 });
            console.log(`   Found ${datasetItems.length} items in dataset`);
            if (datasetItems.length > 0) {
              console.log(`   Sample item keys: ${Object.keys(datasetItems[0]).join(', ')}`);
            }
          }
        } catch (err) {
          console.log(`   Could not fetch dataset: ${err.message}`);
        }
      }
    }
    
    // Try to get cost information from run stats
    if (result.stats) {
      console.log(`\n📊 Run Stats:`, JSON.stringify(result.stats, null, 2));
      
      // Calculate estimated cost based on compute units
      // Apify pricing: typically $25 per 1,000 compute units (CUs)
      if (result.stats.computeUnits) {
        const computeUnits = result.stats.computeUnits;
        const costPer1000CUs = 25; // $25 per 1000 CUs (approximate)
        const estimatedCost = (computeUnits / 1000) * costPer1000CUs;
        results.computeUnits = computeUnits;
        results.estimatedCost = estimatedCost;
        console.log(`\n💰 Estimated Cost: $${estimatedCost.toFixed(4)} (${computeUnits.toFixed(6)} CUs)`);
      }
      
      // Try to get actual run details for pricing
      try {
        const client = apify.getClient();
        const runDetails = await client.run(result.runId).get();
        if (runDetails.usage) {
          results.usage = runDetails.usage;
          console.log(`\n💰 Usage Details:`, JSON.stringify(runDetails.usage, null, 2));
        }
      } catch (err) {
        // Ignore errors getting run details
      }
    }
    
  } catch (error) {
    console.error(`\n❌ Error testing actor ${actorId}:`, error.message);
    results.errors.push(error.message);
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Apify Menu URL Actor Testing\n');
  
  // Load data and find records without menu_url
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
  
  // Test each actor
  const allResults = [];
  
  for (const actor of ACTORS) {
    try {
      const result = await testActor(actor.id, testSample);
      allResults.push(result);
      
      // Wait a bit between tests to avoid rate limiting
      if (actor !== ACTORS[ACTORS.length - 1]) {
        console.log('\n⏳ Waiting 5 seconds before next test...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`❌ Failed to test ${actor.id}:`, error.message);
      allResults.push({
        actorId: actor.id,
        error: error.message
      });
    }
  }
  
  // Summary report
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 SUMMARY REPORT');
  console.log(`${'='.repeat(60)}\n`);
  
  for (const result of allResults) {
    console.log(`\n🎭 Actor: ${result.actorId}`);
    if (result.actorInfo) {
      console.log(`   Name: ${result.actorInfo.name}`);
      console.log(`   Pricing: ${JSON.stringify(result.actorInfo.pricing, null, 2)}`);
    }
    if (result.runId) {
      console.log(`   Run ID: ${result.runId}`);
      console.log(`   Duration: ${result.duration}`);
      console.log(`   Items returned: ${result.itemsCount}`);
      console.log(`   Menu URLs found: ${result.menuUrlFoundCount}/${result.successCount}`);
    }
    if (result.errors.length > 0) {
      console.log(`   Errors: ${result.errors.join(', ')}`);
    }
  }
  
  // Save results to file
  const resultsFile = path.join(__dirname, '../apify-menu-url-test-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Results saved to: ${resultsFile}`);
  
  // Recommendations
  console.log(`\n${'='.repeat(60)}`);
  console.log('💡 RECOMMENDATIONS');
  console.log(`${'='.repeat(60)}\n`);
  
  const actorsWithMenuUrl = allResults.filter(r => r.menuUrlFoundCount > 0);
  if (actorsWithMenuUrl.length > 0) {
    console.log('✅ Actors that successfully extracted menu_url:');
    actorsWithMenuUrl.forEach(r => {
      console.log(`   - ${r.actorId} (${r.menuUrlFoundCount} found)`);
    });
  } else {
    console.log('⚠️  No actors successfully extracted menu_url in the test sample.');
    console.log('   You may need to check the actor documentation for correct input format.');
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

