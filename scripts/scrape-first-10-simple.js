// Simplified script to scrape first 10 records - HTML only, no OCR, no JavaScript
const { scrapeMenu, saveMenuToDB } = require('./scrape-menus');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');

async function main() {
  console.log('🍽️  Scraping first 100 menu URLs (HTML + JavaScript support, no OCR)...\n');
  
  // Read data file
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Get first 100 records with menu URLs
  const recordsToScrape = data
    .filter(r => {
      if (!r.menu || !r.menu.trim()) return false;
      if (r.menu.includes('facebook.com')) return false; // Skip Facebook URLs
      return true;
    })
    .slice(0, 100); // First 100 records
  
  if (recordsToScrape.length === 0) {
    console.log('No records found to scrape');
    process.exit(0);
  }
  
  console.log(`Found ${recordsToScrape.length} records to scrape\n`);
  console.log('='.repeat(80));
  
  const results = [];
  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // Scrape each record
  for (let i = 0; i < recordsToScrape.length; i++) {
    const record = recordsToScrape[i];
    const url = record.menu_final_url || record.menu;
    
    console.log(`\n[${i + 1}/${recordsToScrape.length}] ${record.Name}`);
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
    if (i < recordsToScrape.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Progress update every 10 records
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${i + 1}/${recordsToScrape.length} (${((i + 1) / recordsToScrape.length * 100).toFixed(1)}%)`);
      console.log(`   ✅ Saved: ${successCount}, ⚠️  Skipped: ${skippedCount}, ❌ Failed: ${failedCount}\n`);
      console.log('='.repeat(80));
    }
  }
  
  // Display summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 SCRAPING SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Processed: ${recordsToScrape.length}`);
  console.log(`✅ Successfully Saved: ${successCount}`);
  console.log(`⚠️  Skipped: ${skippedCount}`);
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
    }
    
    if (result.skipped && result.skipReason) {
      console.log(`   Skip Reason: ${result.skipReason}`);
      if (result.validationErrors) {
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
  const outputPath = path.join(__dirname, '..', 'scraped-100-with-js-results.json');
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

