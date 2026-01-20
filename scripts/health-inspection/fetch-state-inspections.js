/**
 * Generic State Health Department API Fetcher
 * 
 * Handles multiple state health department APIs with different formats
 * Supports Socrata, CKAN, and custom REST APIs
 * 
 * Usage:
 *   node scripts/health-inspection/fetch-state-inspections.js [state] [city]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const STATE_SOURCES = require('./state-sources.json');

/**
 * Fetch data from Socrata API
 * @param {string} endpoint - API endpoint URL
 * @param {Object} queryParams - Query parameters
 * @returns {Promise<Array>} Array of records
 */
async function fetchSocrataAPI(endpoint, queryParams = {}) {
  let query = Object.entries(queryParams)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  
  const url = `${endpoint}?${query}`;
  
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
    }).on('error', reject);
  });
}

/**
 * Fetch data from CKAN API
 * @param {string} endpoint - API endpoint URL
 * @param {string} resourceId - Resource ID
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Array>} Array of records
 */
async function fetchCKANAPI(endpoint, resourceId, filters = {}) {
  // CKAN API format varies, this is a generic implementation
  const url = `${endpoint}/action/datastore_search?resource_id=${resourceId}`;
  
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error(`API returned status ${res.statusCode}`));
            return;
          }
          
          const response = JSON.parse(data);
          resolve(response.result?.records || []);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

/**
 * Generic API fetcher that detects API type
 * @param {string} endpoint - API endpoint
 * @param {string} apiType - API type ('socrata', 'ckan', 'rest')
 * @param {Object} options - Fetch options
 * @returns {Promise<Array>} Array of records
 */
async function fetchGenericAPI(endpoint, apiType, options = {}) {
  switch (apiType.toLowerCase()) {
    case 'socrata':
      return fetchSocrataAPI(endpoint, options.queryParams || {});
    
    case 'ckan':
      return fetchCKANAPI(endpoint, options.resourceId, options.filters || {});
    
    case 'rest':
    default:
      // Generic REST API
      return new Promise((resolve, reject) => {
        const url = new URL(endpoint);
        Object.entries(options.queryParams || {}).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
        
        const protocol = url.protocol === 'https:' ? https : http;
        
        protocol.get(url.toString(), (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            try {
              if (res.statusCode !== 200) {
                reject(new Error(`API returned status ${res.statusCode}`));
                return;
              }
              
              const records = JSON.parse(data);
              resolve(Array.isArray(records) ? records : [records]);
            } catch (error) {
              reject(new Error(`Failed to parse JSON: ${error.message}`));
            }
          });
        }).on('error', reject);
      });
  }
}

/**
 * Transform inspection record based on state-specific format
 * @param {Object} record - Raw inspection record
 * @param {Object} format - Data format mapping from state-sources.json
 * @param {string} state - State abbreviation
 * @returns {Object} Standardized health inspection object
 */
function transformInspectionRecord(record, format, state) {
  // Extract fields based on format mapping
  const score = record[format.scoreField] || null;
  const grade = record[format.gradeField] || null;
  const inspectionDate = record[format.inspectionDateField] || null;
  
  // Handle violations
  const violations = [];
  let criticalCount = 0;
  let generalCount = 0;
  
  if (format.violationsField && record[format.violationsField]) {
    const violationCodes = Array.isArray(record[format.violationsField])
      ? record[format.violationsField]
      : [record[format.violationsField]];
    
    const violationDescriptions = format.violationDescriptionField && record[format.violationDescriptionField]
      ? (Array.isArray(record[format.violationDescriptionField])
          ? record[format.violationDescriptionField]
          : [record[format.violationDescriptionField]])
      : [];
    
    const criticalFlags = format.criticalFlagField && record[format.criticalFlagField]
      ? (Array.isArray(record[format.criticalFlagField])
          ? record[format.criticalFlagField]
          : [record[format.criticalFlagField]])
      : [];
    
    violationCodes.forEach((code, index) => {
      const isCritical = criticalFlags[index] === 'Critical' || 
                        criticalFlags[index] === 'Y' ||
                        criticalFlags[index] === true;
      
      if (isCritical) {
        criticalCount++;
      } else {
        generalCount++;
      }
      
      violations.push({
        code: code || undefined,
        description: violationDescriptions[index] || '',
        category: isCritical ? 'Critical' : 'General',
        severity: isCritical ? 'High' : 'Medium',
      });
    });
  }
  
  return {
    currentScore: score ? (isNaN(score) ? score : parseFloat(score)) : undefined,
    currentGrade: grade || undefined,
    inspectionDate: inspectionDate || undefined,
    violations: violations.length > 0 ? violations : undefined,
    criticalViolationsCount: criticalCount > 0 ? criticalCount : undefined,
    generalViolationsCount: generalCount > 0 ? generalCount : undefined,
    dataSource: `${state} Health Department`,
    lastUpdated: new Date().toISOString(),
    _raw: record, // Store raw record for additional processing
  };
}

/**
 * Fetch inspections for a specific state
 * @param {string} stateAbbr - State abbreviation (e.g., 'CA', 'TX')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Health inspection data grouped by restaurant
 */
async function fetchStateInspections(stateAbbr, options = {}) {
  const stateInfo = STATE_SOURCES.sources[stateAbbr];
  
  if (!stateInfo) {
    throw new Error(`No data source configuration found for state: ${stateAbbr}`);
  }
  
  console.log(`Fetching inspections for ${stateInfo.state}...`);
  console.log(`  Data source: ${stateInfo.dataSource}`);
  console.log(`  Type: ${stateInfo.type}`);
  
  const results = {};
  
  if (stateInfo.type === 'api' && stateInfo.endpoint) {
    // Single API endpoint
    try {
      const records = await fetchGenericAPI(
        stateInfo.endpoint,
        stateInfo.apiType || 'rest',
        {
          queryParams: {
            $limit: options.limit || 1000,
            ...(options.restaurantName && { $q: options.restaurantName }),
          },
        }
      );
      
      console.log(`  Fetched ${records.length} records`);
      
      records.forEach((record) => {
        const transformed = transformInspectionRecord(
          record,
          stateInfo.dataFormat || {},
          stateAbbr
        );
        
        // Use a unique identifier from the record (varies by state)
        const id = record.id || record.camis || record.permit_number || 
                  `${record.name}_${record.address}` || `record_${Date.now()}`;
        
        results[id] = {
          restaurant: {
            name: record.name || record.dba || record.restaurant_name || '',
            address: record.address || '',
            phone: record.phone || '',
          },
          healthInspection: transformed,
        };
      });
      
    } catch (error) {
      console.error(`  Error fetching from API: ${error.message}`);
      throw error;
    }
    
  } else if (stateInfo.type === 'mixed' && stateInfo.endpoints) {
    // Multiple endpoints (city-specific)
    const city = options.city || null;
    
    if (city && stateInfo.endpoints[city]) {
      const cityEndpoint = stateInfo.endpoints[city];
      console.log(`  Fetching for city: ${city}`);
      
      if (cityEndpoint.type === 'api' && cityEndpoint.endpoint) {
        // This would require scraping for most cities
        console.log(`  Note: ${city} requires scraping (not implemented in this script)`);
      }
    } else {
      console.log(`  Multiple cities available. Specify city or use scraping script.`);
    }
  } else {
    throw new Error(`State ${stateAbbr} requires scraping (use scrape-health-departments.js)`);
  }
  
  return results;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const state = args[0] || 'CA';
  const city = args[1] || null;
  const restaurantName = args[2] || null;
  
  try {
    const inspections = await fetchStateInspections(state, {
      city,
      restaurantName,
      limit: 5000,
    });
    
    console.log(`\n✓ Fetched ${Object.keys(inspections).length} inspection records`);
    
    // Save results
    const outputDir = path.join(__dirname, '../..', 'data', 'health-inspections');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFile = path.join(outputDir, `${state.toLowerCase()}-inspections.json`);
    fs.writeFileSync(outputFile, JSON.stringify(inspections, null, 2));
    console.log(`✓ Saved to ${outputFile}`);
    
    // Print sample
    if (Object.keys(inspections).length > 0) {
      const firstKey = Object.keys(inspections)[0];
      console.log('\nSample record:');
      console.log(JSON.stringify(inspections[firstKey], null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  fetchSocrataAPI,
  fetchCKANAPI,
  fetchGenericAPI,
  transformInspectionRecord,
  fetchStateInspections,
};
















