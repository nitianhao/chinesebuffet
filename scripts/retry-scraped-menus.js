// Script to retry scraping records that were already attempted
const { scrapeMenu, saveMenuToDB } = require('./scrape-menus');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');

async function main() {
  console.log('🔄 Retrying scraping for previously attempted records...\n');
  
  // Read data file
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Get records that were already analyzed/attempted
  // This includes records with menu_analysis_status or records from the first 13 attempts
  const recordsToRetry = data
    .filter(r => {
      if (!r.menu || !r.menu.trim()) return false;
      if (r.menu.includes('facebook.com')) return false; // Skip Facebook URLs
      
      // Get records that were analyzed (first 3) or attempted in previous runs
      // We'll retry all records that have menu URLs and haven't been successfully saved
      return true;
    })
    .slice(0, 13); // First 13 records that were attempted
  
  if (recordsToRetry.length === 0) {
    console.log('No records found to retry');
    process.exit(0);
  }
  
  console.log(`Found ${recordsToRetry.length} records to retry\n`);
  console.log('='.repeat(80));
  
  const results = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // Scrape each record
  for (let i = 0; i < recordsToRetry.length; i++) {
    const record = recordsToRetry[i];
    const url = record.menu_final_url || record.menu;
    
    console.log(`\n[${i + 1}/${recordsToRetry.length}] Retrying: ${record.Name}`);
    console.log(`   PlaceID: ${record.PlaceID}`);
    console.log(`   URL: ${url}`);
    
    try {
      // Scrape menu
      const result = await scrapeMenu(url, record.PlaceID);
      
      // Try to save to database (will validate)
      const saveResult = await saveMenuToDB(record.PlaceID, url, result);
      
      const resultSummary = {
        name: record.Name,
        placeId: record.PlaceID,
        url: url,
        originalUrl: record.menu,
        success: result.success,
        statusCode: result.statusCode,
        saved: saveResult.saved || false,
        skipped: saveResult.skipped || false,
        skipReason: saveResult.reason || null,
        validationErrors: saveResult.errors || null,
        itemCount: result.structuredData?.items?.length || 0,
        categoryCount: result.structuredData?.categories?.length || 0,
        rawTextLength: result.rawText?.length || 0,
        usedPuppeteer: result.usedPuppeteer || false,
        error: result.errorMessage || null
      };
      
      results.push(resultSummary);
      
      if (saveResult.saved) {
        successCount++;
        console.log(`   ✅ Saved to database`);
        if (result.structuredData) {
          console.log(`      - Items: ${result.structuredData.items?.length || 0}`);
          console.log(`      - Categories: ${result.structuredData.categories?.length || 0}`);
        }
        if (result.usedPuppeteer) {
          console.log(`      - Method: Puppeteer (JavaScript-rendered)`);
        }
      } else if (saveResult.skipped) {
        skippedCount++;
        console.log(`   ⚠️  Skipped: ${saveResult.reason || 'Unknown reason'}`);
        if (saveResult.errors && saveResult.errors.length > 0) {
          saveResult.errors.forEach(err => {
            console.log(`      - ${err}`);
          });
        }
      } else {
        failedCount++;
        console.log(`   ❌ Failed: ${result.errorMessage || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({
        name: record.Name,
        placeId: record.PlaceID,
        url: url,
        originalUrl: record.menu,
        success: false,
        error: error.message
      });
      failedCount++;
    }
    
    // Delay between requests
    if (i < recordsToRetry.length - 1) {
      console.log('\n' + '='.repeat(80));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Display summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 RETRY SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Retried: ${recordsToRetry.length}`);
  console.log(`✅ Successfully Saved: ${successCount}`);
  console.log(`⚠️  Skipped (validation failed): ${skippedCount}`);
  console.log(`❌ Failed: ${failedCount}`);
  
  // Show detailed results
  console.log('\n' + '='.repeat(80));
  console.log('📋 DETAILED RESULTS');
  console.log('='.repeat(80));
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.name}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Status Code: ${result.statusCode || 'N/A'}`);
    console.log(`   Scraping: ${result.success ? '✅ Success' : '❌ Failed'}`);
    console.log(`   Database: ${result.saved ? '✅ Saved' : result.skipped ? '⚠️  Skipped' : '❌ Not Saved'}`);
    
    if (result.saved) {
      console.log(`   Items: ${result.itemCount}`);
      console.log(`   Categories: ${result.categoryCount}`);
      console.log(`   Text Length: ${result.rawTextLength} characters`);
      if (result.usedPuppeteer) {
        console.log(`   Method: Puppeteer`);
      }
    }
    
    if (result.skipped && result.skipReason) {
      console.log(`   Skip Reason: ${result.skipReason}`);
      if (result.validationErrors) {
        console.log(`   Validation Errors:`);
        result.validationErrors.forEach(err => {
          console.log(`      - ${err}`);
        });
      }
    }
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  // Save results to file
  const outputPath = path.join(__dirname, '..', 'retry-scraped-menus-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n\n💾 Results saved to: ${outputPath}`);
  
  return results;
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };





