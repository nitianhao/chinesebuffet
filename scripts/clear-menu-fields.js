// Script to clear all menu-related metadata fields from buffets-urls-websites.json
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');

// Menu-related fields to clear (keep the base "menu" field)
const menuFieldsToClear = [
  'menu_analysis_status',
  'menu_has_content',
  'menu_likely_in_image',
  'menu_requires_js',
  'menu_can_scrape',
  'menu_final_url',
  'menu_status_code',
  'menu_confidence',
  'menu_image_count',
  'menu_analysis_error'
];

function main() {
  console.log('🧹 Clearing menu-related metadata fields...\n');
  
  // Read data file
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  let clearedCount = 0;
  let totalFieldsCleared = 0;
  
  // Process each record
  data.forEach((record, index) => {
    let recordCleared = false;
    
    menuFieldsToClear.forEach(field => {
      if (record.hasOwnProperty(field)) {
        delete record[field];
        totalFieldsCleared++;
        recordCleared = true;
      }
    });
    
    if (recordCleared) {
      clearedCount++;
    }
  });
  
  // Save updated data
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  
  console.log(`✅ Cleared menu metadata fields from ${clearedCount} records`);
  console.log(`   Total fields removed: ${totalFieldsCleared}`);
  console.log(`\n💾 Updated file saved to: ${dataPath}`);
}

main();





