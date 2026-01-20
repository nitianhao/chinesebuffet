// Script to scrape menu data from analyzed URLs and display the results
const { scrapeMenu } = require('./scrape-menus');
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');

/**
 * Main function to scrape and display menu data
 */
async function main() {
  console.log('🍽️  Scraping menu data from analyzed URLs...\n');
  
  // Read data file
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Get records that were analyzed and can be scraped
  const recordsToScrape = data
    .filter(r => 
      r.menu_analysis_status === 'analyzed' && 
      r.menu_can_scrape === true &&
      r.menu
    )
    .slice(0, 3); // First 3 that can be scraped
  
  if (recordsToScrape.length === 0) {
    console.error('No records found that can be scraped');
    process.exit(1);
  }
  
  console.log(`Found ${recordsToScrape.length} records to scrape\n`);
  console.log('='.repeat(80));
  
  const scrapedData = [];
  
  // Scrape each record
  for (let i = 0; i < recordsToScrape.length; i++) {
    const record = recordsToScrape[i];
    const url = record.menu_final_url || record.menu;
    
    console.log(`\n[${i + 1}/${recordsToScrape.length}] Scraping: ${record.Name}`);
    console.log(`   URL: ${url}`);
    console.log(`   PlaceID: ${record.PlaceID}`);
    
    try {
      const result = await scrapeMenu(url, record.PlaceID);
      
      scrapedData.push({
        name: record.Name,
        placeId: record.PlaceID,
        url: url,
        originalUrl: record.menu,
        result: result
      });
      
      if (result.success) {
        console.log(`\n   ✅ Successfully scraped menu!`);
        console.log(`   - Content Type: ${result.contentType}`);
        console.log(`   - Raw Text Length: ${result.rawText?.length || 0} characters`);
        
        if (result.structuredData) {
          const categories = result.structuredData.categories || [];
          const items = result.structuredData.items || [];
          console.log(`   - Categories: ${categories.length}`);
          console.log(`   - Menu Items: ${items.length}`);
        }
        
        if (result.processedImages && result.processedImages.length > 0) {
          const successful = result.processedImages.filter(img => img.success).length;
          console.log(`   - Images Processed: ${successful}/${result.processedImages.length}`);
        }
      } else {
        console.log(`\n   ❌ Failed to scrape: ${result.errorMessage}`);
      }
      
    } catch (error) {
      console.log(`\n   ❌ Error: ${error.message}`);
      scrapedData.push({
        name: record.Name,
        placeId: record.PlaceID,
        url: url,
        originalUrl: record.menu,
        error: error.message
      });
    }
    
    // Delay between requests
    if (i < recordsToScrape.length - 1) {
      console.log('\n' + '='.repeat(80));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Display detailed results
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 SCRAPED MENU DATA');
  console.log('='.repeat(80));
  
  scrapedData.forEach((data, index) => {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`${index + 1}. ${data.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`PlaceID: ${data.placeId}`);
    console.log(`URL: ${data.url}`);
    
    if (data.error) {
      console.log(`\n❌ Error: ${data.error}`);
      return;
    }
    
    if (!data.result || !data.result.success) {
      console.log(`\n❌ Scraping failed: ${data.result?.errorMessage || 'Unknown error'}`);
      return;
    }
    
    const result = data.result;
    
    console.log(`\n📊 Scraping Summary:`);
    console.log(`   Content Type: ${result.contentType}`);
    console.log(`   Raw Text Length: ${result.rawText?.length || 0} characters`);
    
    if (result.structuredData) {
      const structured = result.structuredData;
      const categories = structured.categories || [];
      const items = structured.items || [];
      
      console.log(`\n📑 Structured Menu Data:`);
      console.log(`   Total Categories: ${categories.length}`);
      console.log(`   Total Items: ${items.length}`);
      
      // Display categories and items
      if (categories.length > 0) {
        console.log(`\n📂 Categories:`);
        categories.forEach((category, catIdx) => {
          console.log(`\n   ${catIdx + 1}. ${category.name || 'Unnamed Category'}`);
          if (category.items && category.items.length > 0) {
            category.items.slice(0, 10).forEach((item, itemIdx) => {
              const price = item.price ? ` - ${item.price}` : '';
              const desc = item.description ? ` (${item.description.substring(0, 50)}...)` : '';
              console.log(`      • ${item.name}${price}${desc}`);
            });
            if (category.items.length > 10) {
              console.log(`      ... and ${category.items.length - 10} more items`);
            }
          }
        });
      } else if (items.length > 0) {
        console.log(`\n📋 Menu Items (no categories):`);
        items.slice(0, 20).forEach((item, itemIdx) => {
          const price = item.price ? ` - ${item.price}` : '';
          const desc = item.description ? ` (${item.description.substring(0, 50)}...)` : '';
          console.log(`   ${itemIdx + 1}. ${item.name}${price}${desc}`);
        });
        if (items.length > 20) {
          console.log(`   ... and ${items.length - 20} more items`);
        }
      }
      
      // Display metadata
      if (structured.metadata) {
        console.log(`\n📈 Metadata:`);
        Object.entries(structured.metadata).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }
    }
    
    // Display raw text preview
    if (result.rawText) {
      console.log(`\n📄 Raw Text Preview (first 500 characters):`);
      console.log(`   ${result.rawText.substring(0, 500).replace(/\n/g, ' ')}...`);
    }
    
    // Display image processing info
    if (result.processedImages && result.processedImages.length > 0) {
      console.log(`\n🖼️  Image Processing:`);
      result.processedImages.forEach((img, imgIdx) => {
        if (img.success) {
          console.log(`   ${imgIdx + 1}. ✅ ${img.url.substring(0, 60)}... (${img.textLength} chars)`);
        } else {
          console.log(`   ${imgIdx + 1}. ❌ ${img.url.substring(0, 60)}... (${img.error || 'failed'})`);
        }
      });
    }
  });
  
  // Save scraped data to file
  const outputPath = path.join(__dirname, '..', 'scraped-menu-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(scrapedData, null, 2), 'utf8');
  console.log(`\n\n💾 Scraped data saved to: ${outputPath}`);
  
  return scrapedData;
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };





