/**
 * Health Data Enricher - Main Orchestration Script
 * 
 * Coordinates data fetching, matching, and updating InstantDB
 * 
 * Usage:
 *   node scripts/health-inspection/health-data-enricher.js [state] [--update-db]
 */

const fs = require('fs');
const path = require('path');
const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');

const fetchNYC = require('./fetch-nyc-inspections');
const fetchState = require('./fetch-state-inspections');
const matchInspections = require('./match-inspections-to-buffets');

/**
 * Initialize InstantDB connection
 */
function initDB() {
  const db = init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });
  return db;
}

/**
 * Update buffet in InstantDB with health inspection data
 * @param {Object} db - InstantDB instance
 * @param {string} buffetId - Buffet ID
 * @param {Object} healthInspection - Health inspection data
 * @returns {Promise<void>}
 */
async function updateBuffetHealthData(db, buffetId, healthInspection) {
  try {
    await db.transact([
      db.tx.buffets[buffetId].update({
        healthInspection: JSON.stringify(healthInspection),
      }),
    ]);
    console.log(`  ✓ Updated buffet ${buffetId}`);
  } catch (error) {
    console.error(`  ✗ Error updating buffet ${buffetId}: ${error.message}`);
  }
}

/**
 * Fetch health inspection data for a state
 * @param {string} stateAbbr - State abbreviation
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Health inspection data
 */
async function fetchHealthData(stateAbbr, options = {}) {
  console.log(`\n=== Fetching Health Data for ${stateAbbr} ===`);
  
  let inspections = {};
  
  if (stateAbbr === 'NY') {
    // Use NYC-specific fetcher
    console.log('Using NYC DOHMH API...');
    const nycData = await fetchNYC.fetchNYCInspections({
      restaurantName: options.restaurantName,
      borough: options.borough,
      limit: options.limit || 5000,
    });
    
    // Transform NYC data format
    const grouped = fetchNYC.groupInspectionsByRestaurant(nycData);
    Object.entries(grouped).forEach(([camis, group]) => {
      const healthData = fetchNYC.buildHealthInspectionWithHistory(group.inspections);
      if (healthData) {
        inspections[camis] = {
          restaurant: group.restaurant,
          healthInspection: healthData,
        };
      }
    });
    
  } else {
    // Use generic state fetcher
    console.log('Using generic state API fetcher...');
    inspections = await fetchState.fetchStateInspections(stateAbbr, options);
  }
  
  // Save fetched data
  const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const outputFile = path.join(outputDir, `${stateAbbr.toLowerCase()}-inspections.json`);
  fs.writeFileSync(outputFile, JSON.stringify(inspections, null, 2));
  console.log(`✓ Saved ${Object.keys(inspections).length} inspection records to ${outputFile}`);
  
  return inspections;
}

/**
 * Match inspections to buffets and update database
 * @param {string} stateAbbr - State abbreviation
 * @param {boolean} updateDB - Whether to update InstantDB
 * @returns {Promise<Object>} Match results
 */
async function matchAndUpdate(stateAbbr, updateDB = false) {
  console.log(`\n=== Matching Inspections to Buffets for ${stateAbbr} ===`);
  
  // Load buffets
  const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
  if (!fs.existsSync(buffetsPath)) {
    throw new Error('Buffets file not found. Run data export first.');
  }
  
  const buffetsById = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
  const buffets = Object.values(buffetsById).filter(b => 
    b.address?.stateAbbr === stateAbbr || b.address?.state === stateAbbr
  );
  
  console.log(`Loaded ${buffets.length} buffets from ${stateAbbr}`);
  
  // Load health inspections
  const inspectionsPath = path.join(__dirname, '../..', 'data', 'health-inspections', `${stateAbbr.toLowerCase()}-inspections.json`);
  if (!fs.existsSync(inspectionsPath)) {
    throw new Error(`Health inspections file not found: ${inspectionsPath}\nRun fetch step first.`);
  }
  
  const healthInspections = JSON.parse(fs.readFileSync(inspectionsPath, 'utf8'));
  console.log(`Loaded ${Object.keys(healthInspections).length} health inspection records`);
  
  // Perform matching
  const matches = matchInspections.matchInspectionsToBuffets(
    buffets,
    healthInspections,
    {
      minScore: 0.6,
      maxMatches: 1,
    }
  );
  
  console.log(`\nFound ${matches.length} matches:`);
  const byConfidence = {
    high: matches.filter(m => m.confidence === 'high'),
    medium: matches.filter(m => m.confidence === 'medium'),
    low: matches.filter(m => m.confidence === 'low'),
  };
  console.log(`  High confidence: ${byConfidence.high.length}`);
  console.log(`  Medium confidence: ${byConfidence.medium.length}`);
  console.log(`  Low confidence: ${byConfidence.low.length}`);
  
  // Save matches
  const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
  const matchesFile = path.join(outputDir, `matches-${stateAbbr.toLowerCase()}.json`);
  fs.writeFileSync(matchesFile, JSON.stringify(matches, null, 2));
  console.log(`✓ Saved matches to ${matchesFile}`);
  
  // Update InstantDB if requested
  if (updateDB && matches.length > 0) {
    console.log(`\n=== Updating InstantDB ===`);
    
    if (!process.env.INSTANT_ADMIN_TOKEN) {
      console.error('Error: INSTANT_ADMIN_TOKEN environment variable not set');
      console.error('Skipping database update.');
      return matches;
    }
    
    const db = initDB();
    let updated = 0;
    let errors = 0;
    
    // Only update high-confidence matches
    const highConfidenceMatches = byConfidence.high;
    console.log(`Updating ${highConfidenceMatches.length} high-confidence matches...`);
    
    for (const match of highConfidenceMatches) {
      try {
        await updateBuffetHealthData(db, match.buffetId, match.healthInspection);
        updated++;
      } catch (error) {
        console.error(`  ✗ Error: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n✓ Updated ${updated} buffets`);
    if (errors > 0) {
      console.log(`  ✗ ${errors} errors`);
    }
  }
  
  return matches;
}

/**
 * Main orchestration function
 */
async function main() {
  const args = process.argv.slice(2);
  const stateAbbr = args[0] || 'NY';
  const updateDB = args.includes('--update-db');
  const fetchOnly = args.includes('--fetch-only');
  const matchOnly = args.includes('--match-only');
  
  try {
    console.log('Health Data Enricher');
    console.log('===================\n');
    console.log(`State: ${stateAbbr}`);
    console.log(`Update DB: ${updateDB ? 'Yes' : 'No'}`);
    console.log(`Mode: ${fetchOnly ? 'Fetch only' : matchOnly ? 'Match only' : 'Full pipeline'}\n`);
    
    if (!matchOnly) {
      // Step 1: Fetch health inspection data
      await fetchHealthData(stateAbbr, {
        limit: 5000,
      });
    }
    
    if (!fetchOnly) {
      // Step 2: Match and update
      await matchAndUpdate(stateAbbr, updateDB);
    }
    
    console.log('\n✓ Health data enrichment complete!');
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  fetchHealthData,
  matchAndUpdate,
  updateBuffetHealthData,
};
















