/**
 * Manual Data Entry Template Generator
 * 
 * Creates a template JSON file for manually entering health inspection data
 * Useful when scraping is not feasible
 * 
 * Usage:
 *   node scripts/health-inspection/create-manual-template.js [city]
 */

const fs = require('fs');
const path = require('path');

function createManualTemplate(cityKey = 'all') {
  const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
  
  if (!fs.existsSync(buffetsPath)) {
    console.error('Buffets file not found');
    process.exit(1);
  }
  
  const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
  
  // Filter by city if specified
  let cityBuffets = Object.values(buffets);
  if (cityKey !== 'all') {
    const cityMap = {
      houston: { state: 'TX', city: 'houston' },
      dallas: { state: 'TX', city: 'dallas' },
      austin: { state: 'TX', city: 'austin' },
    };
    
    const config = cityMap[cityKey.toLowerCase()];
    if (config) {
      cityBuffets = cityBuffets.filter(b => 
        b.address?.stateAbbr === config.state && 
        b.address?.city?.toLowerCase() === config.city
      );
    }
  }
  
  // Create template
  const template = {
    metadata: {
      created: new Date().toISOString(),
      city: cityKey,
      totalRestaurants: cityBuffets.length,
      instructions: [
        '1. For each restaurant, search the health department website',
        '2. Find the most recent inspection',
        '3. Fill in the data fields below',
        '4. Save this file',
        '5. Run: node scripts/health-inspection/match-all-health-data.js',
      ],
    },
    restaurants: cityBuffets.map(buffet => ({
      buffetId: buffet.id,
      buffetName: buffet.name,
      address: buffet.address?.full || buffet.address?.street,
      city: buffet.address?.city,
      state: buffet.address?.stateAbbr,
      phone: buffet.phone || buffet.phoneUnformatted,
      
      // Health inspection data (fill these in manually)
      healthInspection: {
        // Search health department website for this restaurant
        // Fill in the data you find:
        
        currentScore: null,        // e.g., 12, 85, etc.
        currentGrade: null,         // e.g., "A", "B", "C"
        inspectionDate: null,       // e.g., "2025-12-02"
        inspectorName: null,        // Optional
        
        violations: [
          // Example:
          // {
          //   code: "04H",
          //   description: "Raw food contamination...",
          //   category: "Critical",  // or "General"
          //   severity: "High",      // or "Medium", "Low"
          //   corrected: false
          // }
        ],
        criticalViolationsCount: null,
        generalViolationsCount: null,
        
        inspectionHistory: [
          // Example:
          // {
          //   date: "2025-12-02",
          //   score: 12,
          //   grade: "A",
          //   violationsCount: 1,
          //   criticalViolationsCount: 1
          // }
        ],
        
        dataSource: null,           // e.g., "Houston Health Department"
        permitNumber: null,         // Health permit/license number
        healthDepartmentUrl: null,  // URL to inspection record
        
        // Notes (optional)
        notes: '',
      },
    })),
  };
  
  // Save template
  const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `manual-entry-${cityKey}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(template, null, 2));
  
  console.log(`✓ Created manual entry template`);
  console.log(`  File: ${outputFile}`);
  console.log(`  Restaurants: ${cityBuffets.length}`);
  console.log(`\n📝 Instructions:`);
  console.log(`  1. Open ${outputFile}`);
  console.log(`  2. For each restaurant, visit the health department website`);
  console.log(`  3. Search for the restaurant and find inspection data`);
  console.log(`  4. Fill in the healthInspection fields`);
  console.log(`  5. Save the file`);
  console.log(`  6. The data will be automatically matched when you run:`);
  console.log(`     node scripts/health-inspection/match-all-health-data.js`);
}

// Run if called directly
if (require.main === module) {
  const city = process.argv[2] || 'all';
  createManualTemplate(city);
}

module.exports = { createManualTemplate };
















