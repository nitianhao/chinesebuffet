/**
 * Comprehensive Health Inspection Data Matcher
 * 
 * Matches health inspection data from all sources to all buffets in the database
 * Works across all states and uses fuzzy matching
 * 
 * Usage:
 *   node scripts/health-inspection/match-all-health-data.js
 */

const fs = require('fs');
const path = require('path');
const { matchInspectionsToBuffets, calculateMatchScore } = require('./match-inspections-to-buffets');

/**
 * Load all health inspection data files
 * @returns {Object} Object mapping source names to inspection data
 */
function loadAllInspectionData() {
  const inspectionDir = path.join(__dirname, '../..', 'data', 'health-inspections');
  const files = fs.readdirSync(inspectionDir);
  const inspectionFiles = files.filter(f => 
    f.endsWith('-inspections.json') && !f.includes('matches')
  );
  
  const allInspections = {};
  
  inspectionFiles.forEach(file => {
    const filePath = path.join(inspectionDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const source = file.replace('-inspections.json', '').toUpperCase();
      allInspections[source] = data;
      console.log(`  Loaded ${Object.keys(data).length} inspections from ${source}`);
    } catch (error) {
      console.error(`  Error loading ${file}:`, error.message);
    }
  });
  
  return allInspections;
}

/**
 * Flatten all inspection data into a single object for matching
 * @param {Object} allInspections - Object mapping sources to inspection data
 * @returns {Object} Flattened inspection data with source prefixes
 */
function flattenInspectionData(allInspections) {
  const flattened = {};
  
  Object.entries(allInspections).forEach(([source, inspections]) => {
    Object.entries(inspections).forEach(([id, inspection]) => {
      // Prefix ID with source to avoid collisions
      const prefixedId = `${source}_${id}`;
      flattened[prefixedId] = inspection;
    });
  });
  
  return flattened;
}

/**
 * Match all inspections to all buffets with lower threshold
 * @param {Array} buffets - All buffet profiles
 * @param {Object} allInspections - All inspection data
 * @returns {Array} Array of matches
 */
function matchAllData(buffets, allInspections) {
  console.log('\nMatching inspections to buffets...');
  console.log(`  Total buffets: ${buffets.length}`);
  console.log(`  Total inspections: ${Object.keys(allInspections).length}`);
  
  // Use lower threshold to catch more potential matches
  const matches = matchInspectionsToBuffets(buffets, allInspections, {
    minScore: 0.5, // Lower threshold (was 0.6)
    maxMatches: 1,
  });
  
  return matches;
}

/**
 * Update buffets-by-id.json with matched health inspection data
 * @param {Array} matches - Array of matches
 * @param {string} buffetsPath - Path to buffets-by-id.json
 */
function updateBuffetsWithHealthData(matches, buffetsPath) {
  const buffets = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
  let updatedCount = 0;
  
  matches.forEach(match => {
    if (match.buffetId && buffets[match.buffetId]) {
      // Only update if we don't already have health data or if this match is better
      const existingHealth = buffets[match.buffetId].healthInspection;
      const shouldUpdate = !existingHealth || 
                          (match.confidence === 'high' && match.score >= 0.8);
      
      if (shouldUpdate) {
        buffets[match.buffetId].healthInspection = match.healthInspection;
        updatedCount++;
      }
    }
  });
  
  // Save updated buffets
  fs.writeFileSync(buffetsPath, JSON.stringify(buffets, null, 2));
  console.log(`\n✓ Updated ${updatedCount} buffets with health inspection data`);
  
  return updatedCount;
}

/**
 * Generate summary report
 * @param {Array} matches - Array of matches
 * @param {Object} buffets - All buffets
 */
function generateSummaryReport(matches, buffets) {
  const byConfidence = {
    high: matches.filter(m => m.confidence === 'high'),
    medium: matches.filter(m => m.confidence === 'medium'),
    low: matches.filter(m => m.confidence === 'low'),
  };
  
  const byState = {};
  matches.forEach(match => {
    const buffet = Object.values(buffets).find(b => b.id === match.buffetId);
    if (buffet) {
      const state = buffet.address?.stateAbbr || buffet.address?.state || 'Unknown';
      byState[state] = (byState[state] || 0) + 1;
    }
  });
  
  const report = {
    summary: {
      totalMatches: matches.length,
      highConfidence: byConfidence.high.length,
      mediumConfidence: byConfidence.medium.length,
      lowConfidence: byConfidence.low.length,
      matchesByState: byState,
    },
    sampleMatches: {
      high: byConfidence.high.slice(0, 5).map(m => ({
        buffetName: m.buffetName,
        inspectionName: m.inspectionName,
        score: (m.score * 100).toFixed(1) + '%',
        state: Object.values(buffets).find(b => b.id === m.buffetId)?.address?.stateAbbr || 'Unknown',
      })),
      medium: byConfidence.medium.slice(0, 5).map(m => ({
        buffetName: m.buffetName,
        inspectionName: m.inspectionName,
        score: (m.score * 100).toFixed(1) + '%',
        state: Object.values(buffets).find(b => b.id === m.buffetId)?.address?.stateAbbr || 'Unknown',
      })),
    },
  };
  
  return report;
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('=== Health Inspection Data Matching ===\n');
    
    // Load buffets
    const buffetsPath = path.join(__dirname, '../..', 'data', 'buffets-by-id.json');
    if (!fs.existsSync(buffetsPath)) {
      console.error('Buffets file not found:', buffetsPath);
      process.exit(1);
    }
    
    const buffetsById = JSON.parse(fs.readFileSync(buffetsPath, 'utf8'));
    const buffets = Object.values(buffetsById);
    console.log(`Loaded ${buffets.length} buffets from database\n`);
    
    // Load all health inspection data
    console.log('Loading health inspection data...');
    const allInspectionsBySource = loadAllInspectionData();
    
    if (Object.keys(allInspectionsBySource).length === 0) {
      console.log('\n⚠ No health inspection data files found.');
      console.log('Run fetch scripts first to collect data.');
      process.exit(1);
    }
    
    // Flatten all inspection data
    const allInspections = flattenInspectionData(allInspectionsBySource);
    console.log(`\nTotal unique inspections: ${Object.keys(allInspections).length}`);
    
    // Match all data
    const matches = matchAllData(buffets, allInspections);
    
    // Filter matches: only keep if states match or if high confidence
    const filteredMatches = matches.filter(match => {
      const buffet = buffets.find(b => b.id === match.buffetId);
      if (!buffet) return false;
      
      const buffetState = buffet.address?.stateAbbr || buffet.address?.state;
      const inspectionState = match.healthInspection?._raw?.boro || 
                             match.healthInspection?.dataSource?.includes('NYC') ? 'NY' : null;
      
      // For NYC data, only match NY buffets
      if (match.inspectionId?.startsWith('NYC_') || match.inspectionId?.startsWith('NY_')) {
        if (buffetState !== 'NY') return false;
      }
      
      // Only keep medium+ confidence matches, or low confidence with state match
      if (match.confidence === 'low' && buffetState !== inspectionState) {
        return false;
      }
      
      return true;
    });
    
    // Group by confidence
    const byConfidence = {
      high: filteredMatches.filter(m => m.confidence === 'high'),
      medium: filteredMatches.filter(m => m.confidence === 'medium'),
      low: filteredMatches.filter(m => m.confidence === 'low'),
    };
    
    console.log(`\nMatch Results:`);
    console.log(`  High confidence (≥80%): ${byConfidence.high.length}`);
    console.log(`  Medium confidence (60-79%): ${byConfidence.medium.length}`);
    console.log(`  Low confidence (50-59%): ${byConfidence.low.length}`);
    
    // Show sample matches
    if (byConfidence.high.length > 0) {
      console.log(`\nSample High Confidence Matches:`);
      byConfidence.high.slice(0, 5).forEach((match, idx) => {
        const buffet = buffets.find(b => b.id === match.buffetId);
        console.log(`  ${idx + 1}. ${match.buffetName} (${buffet?.address?.stateAbbr || 'Unknown'})`);
        console.log(`     ↔ ${match.inspectionName}`);
        console.log(`     Score: ${(match.score * 100).toFixed(1)}%`);
        console.log(`     Name: ${(match.details.name * 100).toFixed(1)}%, Address: ${(match.details.address * 100).toFixed(1)}%, Phone: ${(match.details.phone * 100).toFixed(1)}%`);
      });
    }
    
    // Update buffets file with matched data (use filtered matches)
    const updatedCount = updateBuffetsWithHealthData(filteredMatches, buffetsPath);
    
    // Generate and save report (use filtered matches)
    const report = generateSummaryReport(filteredMatches, buffetsById);
    const reportPath = path.join(__dirname, '../..', 'data', 'health-inspections', 'matching-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n✓ Saved matching report to ${reportPath}`);
    
    // Save detailed matches (both filtered and all for review)
    const matchesPath = path.join(__dirname, '../..', 'data', 'health-inspections', 'all-matches.json');
    fs.writeFileSync(matchesPath, JSON.stringify(filteredMatches, null, 2));
    console.log(`✓ Saved all matches to ${matchesPath}`);
    
    console.log(`\n✅ Matching complete!`);
    console.log(`   ${updatedCount} buffets updated with health inspection data`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  loadAllInspectionData,
  flattenInspectionData,
  matchAllData,
  updateBuffetsWithHealthData,
  generateSummaryReport,
};

