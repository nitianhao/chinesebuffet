/**
 * NYC DOHMH Restaurant Inspection Data Fetcher
 * 
 * Fetches health inspection data from NYC Open Data (Socrata API)
 * Endpoint: https://data.cityofnewyork.us/resource/43nn-pn8j.json
 * 
 * Usage:
 *   node scripts/health-inspection/fetch-nyc-inspections.js [restaurant-name] [borough]
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOCRATA_ENDPOINT = 'https://data.cityofnewyork.us/resource/43nn-pn8j.json';
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || ''; // Optional but recommended

/**
 * Fetch inspection data from NYC DOHMH Socrata API
 * @param {Object} options - Query options
 * @param {string} options.restaurantName - Restaurant name to search for
 * @param {string} options.borough - Borough name (optional)
 * @param {string} options.camis - CAMIS (restaurant ID) - optional
 * @param {number} options.limit - Maximum results (default: 1000)
 * @returns {Promise<Array>} Array of inspection records
 */
async function fetchNYCInspections(options = {}) {
  const { restaurantName, borough, camis, limit = 1000 } = options;
  
  let query = `$limit=${limit}`;
  
  // Build query filters
  if (camis) {
    query += `&camis=${encodeURIComponent(camis)}`;
  } else if (restaurantName) {
    // Use $q parameter for text search (case-insensitive)
    query += `&$q=${encodeURIComponent(restaurantName)}`;
  }
  
  if (borough) {
    query += `&boro=${encodeURIComponent(borough.toUpperCase())}`;
  }
  
  // Order by inspection date (most recent first)
  query += `&$order=inspection_date DESC`;
  
  const url = `${SOCRATA_ENDPOINT}?${query}${APP_TOKEN ? `&$$app_token=${APP_TOKEN}` : ''}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}: ${data}`));
            return;
          }
          
          const records = JSON.parse(data);
          resolve(records);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Transform NYC inspection record to our standardized format
 * @param {Object} record - Raw NYC inspection record
 * @returns {Object} Standardized health inspection object
 */
function transformNYCInspection(record) {
  // NYC uses letter grades (A, B, C) and numeric scores
  const grade = record.grade || null;
  const score = record.score ? parseInt(record.score, 10) : null;
  
  // Parse violations
  const violations = [];
  let criticalCount = 0;
  let generalCount = 0;
  
  if (record.violation_code && record.violation_description) {
    const codes = Array.isArray(record.violation_code) ? record.violation_code : [record.violation_code];
    const descriptions = Array.isArray(record.violation_description) 
      ? record.violation_description 
      : [record.violation_description];
    const criticalFlags = Array.isArray(record.critical_flag) 
      ? record.critical_flag 
      : [record.critical_flag];
    
    codes.forEach((code, index) => {
      const isCritical = criticalFlags[index] === 'Critical' || criticalFlags[index] === 'Y';
      if (isCritical) {
        criticalCount++;
      } else {
        generalCount++;
      }
      
      violations.push({
        code: code || undefined,
        description: descriptions[index] || '',
        category: isCritical ? 'Critical' : 'General',
        severity: isCritical ? 'High' : 'Medium',
        corrected: record.action === 'Violations were cited in the following area(s).' ? false : true,
      });
    });
  }
  
  // Check for closure (action indicates closure)
  const isClosure = record.action && (
    record.action.includes('Closed') || 
    record.action.includes('Establishment Closed')
  );
  
  return {
    currentScore: score,
    currentGrade: grade,
    inspectionDate: record.inspection_date || null,
    inspectorName: null, // Not available in NYC data
    violations: violations.length > 0 ? violations : undefined,
    criticalViolationsCount: criticalCount > 0 ? criticalCount : undefined,
    generalViolationsCount: generalCount > 0 ? generalCount : undefined,
    dataSource: 'NYC DOHMH',
    lastUpdated: new Date().toISOString(),
    permitNumber: record.camis || undefined,
    healthDepartmentUrl: `https://www1.nyc.gov/site/doh/business/food-operators/letter-grading-for-restaurants.page`,
    // Store raw record for additional processing
    _raw: {
      camis: record.camis,
      dba: record.dba,
      boro: record.boro,
      building: record.building,
      street: record.street,
      zipcode: record.zipcode,
      phone: record.phone,
      cuisine_description: record.cuisine_description,
      action: record.action,
      violation_code: record.violation_code,
      violation_description: record.violation_description,
      critical_flag: record.critical_flag,
    }
  };
}

/**
 * Group inspections by restaurant (CAMIS) and build history
 * @param {Array} inspections - Array of inspection records
 * @returns {Object} Grouped inspections by CAMIS
 */
function groupInspectionsByRestaurant(inspections) {
  const grouped = {};
  
  inspections.forEach((inspection) => {
    const camis = inspection.camis;
    if (!camis) return;
    
    if (!grouped[camis]) {
      grouped[camis] = {
        restaurant: {
          camis: camis,
          name: inspection.dba,
          address: `${inspection.building} ${inspection.street}, ${inspection.boro}, NY ${inspection.zipcode}`,
          phone: inspection.phone,
          cuisine: inspection.cuisine_description,
        },
        inspections: [],
      };
    }
    
    grouped[camis].inspections.push(inspection);
  });
  
  // Sort inspections by date (most recent first)
  Object.values(grouped).forEach((group) => {
    group.inspections.sort((a, b) => {
      const dateA = new Date(a.inspection_date || 0);
      const dateB = new Date(b.inspection_date || 0);
      return dateB - dateA;
    });
  });
  
  return grouped;
}

/**
 * Build complete health inspection object with history
 * @param {Array} inspections - Array of inspection records for a restaurant
 * @returns {Object} Complete health inspection object
 */
function buildHealthInspectionWithHistory(inspections) {
  if (!inspections || inspections.length === 0) {
    return null;
  }
  
  // Most recent inspection
  const latest = transformNYCInspection(inspections[0]);
  
  // Build inspection history
  const history = inspections.slice(0, 10).map((inspection) => {
    const transformed = transformNYCInspection(inspection);
    return {
      date: inspection.inspection_date || '',
      score: transformed.currentScore,
      grade: transformed.currentGrade,
      violationsCount: (transformed.criticalViolationsCount || 0) + (transformed.generalViolationsCount || 0),
      criticalViolationsCount: transformed.criticalViolationsCount,
    };
  });
  
  // Check for closures in last 2 years
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  
  const closureHistory = [];
  let hasRecentClosure = false;
  
  inspections.forEach((inspection) => {
    const inspectionDate = new Date(inspection.inspection_date || 0);
    const isClosure = inspection.action && (
      inspection.action.includes('Closed') || 
      inspection.action.includes('Establishment Closed')
    );
    
    if (isClosure && inspectionDate >= twoYearsAgo) {
      hasRecentClosure = true;
      closureHistory.push({
        closureDate: inspection.inspection_date || '',
        reason: inspection.action || 'Closure',
      });
    }
  });
  
  return {
    ...latest,
    inspectionHistory: history.length > 0 ? history : undefined,
    closureHistory: closureHistory.length > 0 ? closureHistory : undefined,
    hasRecentClosure: hasRecentClosure || undefined,
  };
}

/**
 * Main function to fetch and process NYC inspections
 */
async function main() {
  const args = process.argv.slice(2);
  const restaurantName = args[0] || null;
  const borough = args[1] || null;
  
  try {
    console.log('Fetching NYC inspection data...');
    if (restaurantName) {
      console.log(`  Searching for: ${restaurantName}`);
    }
    if (borough) {
      console.log(`  Borough: ${borough}`);
    }
    
    const inspections = await fetchNYCInspections({
      restaurantName,
      borough,
      limit: 5000,
    });
    
    console.log(`  Found ${inspections.length} inspection records`);
    
    if (inspections.length === 0) {
      console.log('No inspections found.');
      return;
    }
    
    // Group by restaurant
    const grouped = groupInspectionsByRestaurant(inspections);
    console.log(`  Grouped into ${Object.keys(grouped).length} unique restaurants`);
    
    // Build health inspection objects
    const healthInspections = {};
    Object.entries(grouped).forEach(([camis, group]) => {
      const healthData = buildHealthInspectionWithHistory(group.inspections);
      if (healthData) {
        healthInspections[camis] = {
          restaurant: group.restaurant,
          healthInspection: healthData,
        };
      }
    });
    
    // Save results
    const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, 'nyc-inspections.json');
    fs.writeFileSync(outputFile, JSON.stringify(healthInspections, null, 2));
    console.log(`\n✓ Saved results to ${outputFile}`);
    console.log(`  Total restaurants: ${Object.keys(healthInspections).length}`);
    
    // Print sample
    if (Object.keys(healthInspections).length > 0) {
      const firstKey = Object.keys(healthInspections)[0];
      const sample = healthInspections[firstKey];
      console.log('\nSample result:');
      console.log(JSON.stringify(sample, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  fetchNYCInspections,
  transformNYCInspection,
  groupInspectionsByRestaurant,
  buildHealthInspectionWithHistory,
};
















