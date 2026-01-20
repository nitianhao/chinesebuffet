/**
 * Add sample health inspection data to JSON files
 * This updates the local JSON files which can then be synced to InstantDB
 */

const fs = require('fs');
const path = require('path');

// Sample health inspection data
const sampleHealthInspection = {
  currentScore: 12,
  currentGrade: "A",
  inspectionDate: "2025-12-02T00:00:00.000",
  violations: [
    {
      code: "04H",
      description: "Raw, cooked or prepared food is adulterated, contaminated, cross-contaminated, or not discarded in accordance with HACCP plan.",
      category: "Critical",
      severity: "High",
      corrected: false
    }
  ],
  criticalViolationsCount: 1,
  generalViolationsCount: 0,
  inspectionHistory: [
    {
      date: "2025-12-02T00:00:00.000",
      score: 12,
      grade: "A",
      violationsCount: 1,
      criticalViolationsCount: 1
    },
    {
      date: "2024-04-29T00:00:00.000",
      score: 13,
      grade: "A",
      violationsCount: 1,
      criticalViolationsCount: 1
    },
    {
      date: "2024-02-28T00:00:00.000",
      score: 32,
      grade: null,
      violationsCount: 1,
      criticalViolationsCount: 1
    },
    {
      date: "2023-12-06T00:00:00.000",
      score: 34,
      grade: "C",
      violationsCount: 1,
      criticalViolationsCount: 1
    }
  ],
  dataSource: "NYC DOHMH",
  lastUpdated: new Date().toISOString(),
  permitNumber: "40536227",
  healthDepartmentUrl: "https://www1.nyc.gov/site/doh/business/food-operators/letter-grading-for-restaurants.page"
};

function addHealthDataToJSON() {
  const buffetsByIdPath = path.join(__dirname, '../../data/buffets-by-id.json');
  const buffetsByCityPath = path.join(__dirname, '../../data/buffets-by-city.json');
  
  // Load buffets
  const buffetsById = JSON.parse(fs.readFileSync(buffetsByIdPath, 'utf8'));
  const buffetsByCity = JSON.parse(fs.readFileSync(buffetsByCityPath, 'utf8'));
  
  // Add health data to first 3 buffets
  const buffets = Object.values(buffetsById);
  let updated = 0;
  
  for (let i = 0; i < Math.min(3, buffets.length); i++) {
    const buffet = buffets[i];
    if (!buffet.healthInspection) {
      buffet.healthInspection = sampleHealthInspection;
      updated++;
      
      // Also update in buffets-by-city
      for (const citySlug in buffetsByCity) {
        const city = buffetsByCity[citySlug];
        const cityBuffet = city.buffets.find(b => b.id === buffet.id);
        if (cityBuffet) {
          cityBuffet.healthInspection = sampleHealthInspection;
        }
      }
      
      console.log(`✓ Added health data to: ${buffet.name} (${buffet.address?.city}, ${buffet.address?.state})`);
      console.log(`  URL: /chinese-buffets/${Object.keys(buffetsByCity).find(slug => 
        buffetsByCity[slug].buffets.some(b => b.id === buffet.id)
      )}/${buffet.slug}`);
    }
  }
  
  // Save updated files
  fs.writeFileSync(buffetsByIdPath, JSON.stringify(buffetsById, null, 2));
  fs.writeFileSync(buffetsByCityPath, JSON.stringify(buffetsByCity, null, 2));
  
  console.log(`\n✓ Updated ${updated} buffets with health inspection data`);
  console.log('\nNote: To sync to InstantDB, run:');
  console.log('  node scripts/health-inspection/sync-health-data-to-db.js');
}

addHealthDataToJSON();
















