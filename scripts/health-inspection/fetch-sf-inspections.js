/**
 * San Francisco Restaurant Inspection Data Fetcher
 * 
 * Fetches health inspection data from SF Open Data (Socrata API)
 * Endpoint: https://data.sfgov.org/resource/d27x-ftsz.json
 * 
 * Usage:
 *   node scripts/health-inspection/fetch-sf-inspections.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const SOCRATA_ENDPOINT = 'https://data.sfgov.org/resource/d27x-ftsz.json';
const APP_TOKEN = process.env.SOCRATA_APP_TOKEN || ''; // Optional but recommended

/**
 * Fetch inspection data from SF Socrata API
 * @param {Object} options - Query options
 * @param {string} options.restaurantName - Restaurant name to search for
 * @param {number} options.limit - Maximum results (default: 5000)
 * @returns {Promise<Array>} Array of inspection records
 */
async function fetchSFInspections(options = {}) {
  const { restaurantName, limit = 5000 } = options;
  
  let query = `$limit=${limit}`;
  
  // Build query filters
  if (restaurantName) {
    // Use $q parameter for text search (case-insensitive)
    query += `&$q=${encodeURIComponent(restaurantName)}`;
  }
  
  // Filter for Chinese/Buffet restaurants
  query += `&$where=UPPER(business_name) LIKE '%CHINESE%' OR UPPER(business_name) LIKE '%BUFFET%'`;
  
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
 * Transform SF inspection record to our standardized format
 * @param {Object} record - Raw SF inspection record
 * @returns {Object} Standardized health inspection object
 */
function transformSFInspection(record) {
  // SF uses numeric scores (0-100, higher is better)
  const score = record.score ? parseInt(record.score, 10) : null;
  
  // Convert score to letter grade (SF uses A/B/C system)
  let grade = null;
  if (score !== null) {
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
  }
  
  // Parse violations
  const violations = [];
  let criticalCount = 0;
  let generalCount = 0;
  
  // SF data structure may vary - check for violation fields
  if (record.violations) {
    const violationsList = Array.isArray(record.violations) ? record.violations : [record.violations];
    violationsList.forEach((violation) => {
      if (typeof violation === 'string') {
        // Try to parse violation string
        const isCritical = violation.toLowerCase().includes('critical') || 
                          violation.toLowerCase().includes('high risk');
        if (isCritical) {
          criticalCount++;
        } else {
          generalCount++;
        }
        
        violations.push({
          description: violation,
          category: isCritical ? 'Critical' : 'General',
          severity: isCritical ? 'High' : 'Medium',
        });
      }
    });
  }
  
  return {
    currentScore: score,
    currentGrade: grade,
    inspectionDate: record.inspection_date || null,
    inspectorName: record.inspector || null,
    violations: violations.length > 0 ? violations : undefined,
    criticalViolationsCount: criticalCount > 0 ? criticalCount : undefined,
    generalViolationsCount: generalCount > 0 ? generalCount : undefined,
    dataSource: 'SF Department of Public Health',
    lastUpdated: new Date().toISOString(),
    permitNumber: record.business_id || undefined,
    healthDepartmentUrl: `https://data.sfgov.org/Health-and-Social-Services/Restaurant-Scores-LIVES-Standard/d27x-ftsz`,
    // Store raw record for additional processing
    _raw: {
      business_id: record.business_id,
      business_name: record.business_name,
      business_address: record.business_address,
      business_city: record.business_city,
      business_state: record.business_state,
      business_postal_code: record.business_postal_code,
      business_phone_number: record.business_phone_number,
      inspection_date: record.inspection_date,
      inspection_score: record.score,
      inspection_type: record.inspection_type,
      violations: record.violations,
    }
  };
}

/**
 * Group inspections by restaurant (business_id) and build history
 * @param {Array} inspections - Array of inspection records
 * @returns {Object} Grouped inspections by business_id
 */
function groupInspectionsByRestaurant(inspections) {
  const grouped = {};
  
  inspections.forEach((inspection) => {
    const businessId = inspection.business_id;
    if (!businessId) return;
    
    if (!grouped[businessId]) {
      grouped[businessId] = {
        restaurant: {
          business_id: businessId,
          name: inspection.business_name,
          address: `${inspection.business_address || ''}, ${inspection.business_city || 'San Francisco'}, CA ${inspection.business_postal_code || ''}`.trim(),
          phone: inspection.business_phone_number,
        },
        inspections: [],
      };
    }
    
    grouped[businessId].inspections.push(inspection);
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
  const latest = transformSFInspection(inspections[0]);
  
  // Build inspection history
  const history = inspections.slice(0, 10).map((inspection) => {
    const transformed = transformSFInspection(inspection);
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
    const isClosure = inspection.inspection_type && (
      inspection.inspection_type.includes('Closure') || 
      inspection.inspection_type.includes('Closed')
    );
    
    if (isClosure && inspectionDate >= twoYearsAgo) {
      hasRecentClosure = true;
      closureHistory.push({
        closureDate: inspection.inspection_date || '',
        reason: inspection.inspection_type || 'Closure',
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
 * Main function to fetch and process SF inspections
 */
async function main() {
  try {
    console.log('Fetching San Francisco inspection data...');
    
    const inspections = await fetchSFInspections({
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
    Object.entries(grouped).forEach(([businessId, group]) => {
      const healthData = buildHealthInspectionWithHistory(group.inspections);
      if (healthData) {
        healthInspections[businessId] = {
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
    
    const outputFile = path.join(outputDir, 'sf-inspections.json');
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
  fetchSFInspections,
  transformSFInspection,
  groupInspectionsByRestaurant,
  buildHealthInspectionWithHistory,
};
















