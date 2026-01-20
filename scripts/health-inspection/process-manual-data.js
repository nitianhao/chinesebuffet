/**
 * Process Manually Entered Health Inspection Data
 * 
 * Takes manually entered data from manual-entry-*.json files
 * and processes it into the standard format, then matches to buffets
 * 
 * Usage:
 *   node scripts/health-inspection/process-manual-data.js [city]
 */

const fs = require('fs');
const path = require('path');

/**
 * Process manual entry file
 */
function processManualData(city = 'houston') {
  const manualFile = path.join(__dirname, '../..', 'data', 'health-inspections', `manual-entry-${city}.json`);
  
  if (!fs.existsSync(manualFile)) {
    console.error(`Manual entry file not found: ${manualFile}`);
    console.log('\nCreate it first:');
    console.log(`  node scripts/health-inspection/create-manual-template.js ${city}`);
    process.exit(1);
  }
  
  const manualData = JSON.parse(fs.readFileSync(manualFile, 'utf8'));
  console.log(`Processing manual data for ${city}`);
  console.log(`Total restaurants: ${manualData.restaurants.length}\n`);
  
  // Filter restaurants with health inspection data
  const withData = manualData.restaurants.filter(r => {
    const hi = r.healthInspection;
    return hi && (
      hi.currentScore !== null ||
      hi.currentGrade !== null ||
      hi.inspectionDate !== null ||
      (hi.violations && hi.violations.length > 0)
    );
  });
  
  console.log(`Restaurants with data: ${withData.length}`);
  
  if (withData.length === 0) {
    console.log('\n⚠ No health inspection data found in manual entry file.');
    console.log('Please fill in the data first, then run this script again.');
    return;
  }
  
  // Transform to inspection format
  const inspections = {};
  withData.forEach(restaurant => {
    if (restaurant.healthInspection) {
      inspections[restaurant.buffetId] = {
        restaurant: {
          id: restaurant.buffetId,
          name: restaurant.buffetName,
          address: restaurant.address,
          city: restaurant.city,
          state: restaurant.state,
          phone: restaurant.phone,
        },
        healthInspection: {
          ...restaurant.healthInspection,
          dataSource: restaurant.healthInspection.dataSource || `${city.charAt(0).toUpperCase() + city.slice(1)} Health Department`,
          lastUpdated: new Date().toISOString(),
        },
      };
    }
  });
  
  // Save processed data
  const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `${city}-inspections-manual.json`);
  fs.writeFileSync(outputFile, JSON.stringify(inspections, null, 2));
  console.log(`\n✓ Saved processed data to ${outputFile}`);
  
  // Update buffets-by-id.json
  const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
  if (fs.existsSync(buffetsPath)) {
    const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
    let updated = 0;
    
    Object.entries(inspections).forEach(([buffetId, inspection]) => {
      if (buffets[buffetId]) {
        buffets[buffetId].healthInspection = inspection.healthInspection;
        updated++;
      }
    });
    
    fs.writeFileSync(buffetsPath, JSON.stringify(buffets, null, 2));
    console.log(`✓ Updated ${updated} buffets in buffets-by-id.json`);
  }
  
  console.log(`\n✅ Processing complete!`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review the data in ${outputFile}`);
  console.log(`  2. Run matching: node scripts/health-inspection/match-all-health-data.js`);
  console.log(`  3. Sync to database: node scripts/health-inspection/sync-health-data-to-db.js`);
}

// Run if called directly
if (require.main === module) {
  const city = process.argv[2] || 'houston';
  processManualData(city);
}

module.exports = { processManualData };
















