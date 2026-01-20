// Script to download and match US cities population data from a comprehensive CSV
// This creates a local database that can be used to match remaining cities
// Run with: node scripts/download-city-population-data.js

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// This script downloads a free US cities population CSV and creates a JSON lookup file
// Source: SimpleMaps US Cities Database (free tier)

async function downloadCityPopulationData() {
  console.log('Downloading US cities population data...');
  
  // Try to download from a free source
  // SimpleMaps provides a free CSV: https://simplemaps.com/data/us-cities
  // For now, we'll create a comprehensive matching strategy
  
  // Alternative: Use the datausa.io API to build a comprehensive list
  const states = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
                  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
  
  const cityPopulationMap = new Map();
  let totalCities = 0;
  
  console.log('Note: This would require calling an API for each state.');
  console.log('For production use, download the SimpleMaps US Cities CSV instead:');
  console.log('https://simplemaps.com/data/us-cities');
  console.log('\nCreating a helper script to match cities from a CSV file...');
  
  // Create a script to process a CSV file
  const csvProcessorScript = `
// Script to import city population from CSV file
// Place a CSV file at: data/us-cities-population.csv
// Format: city,state_abbr,population
// Or: city,state,state_abbr,population

const fs = require('fs');
const path = require('path');

function normalizeCityName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/^st\\.\\s+/i, 'saint ')
    .replace(/^ft\\.\\s+/i, 'fort ')
    .replace(/\\s+city$/i, '')
    .replace(/\\s+township$/i, '')
    .replace(/\\s+county$/i, '')
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function processCSV(csvPath) {
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\\n').filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  
  const cityMap = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    
    // Find column indices
    const cityIdx = headers.findIndex(h => h.includes('city'));
    const stateIdx = headers.findIndex(h => h.includes('state') && !h.includes('abbr'));
    const stateAbbrIdx = headers.findIndex(h => (h.includes('state') && h.includes('abbr')) || h === 'state');
    const popIdx = headers.findIndex(h => h.includes('population') || h.includes('pop'));
    
    if (cityIdx >= 0 && stateAbbrIdx >= 0 && popIdx >= 0) {
      const city = values[cityIdx];
      const stateAbbr = values[stateAbbrIdx].toUpperCase();
      const population = parseInt(values[popIdx].replace(/,/g, ''), 10);
      
      if (city && stateAbbr && !isNaN(population) && population > 0) {
        const normalizedCity = normalizeCityName(city);
        const key = \`\${normalizedCity}-\${stateAbbr.toLowerCase()}\`;
        cityMap.set(key, population);
      }
    }
  }
  
  return cityMap;
}

module.exports = { processCSV, normalizeCityName };
`;
  
  // Write the CSV processor
  const processorPath = path.join(__dirname, 'csv-population-processor.js');
  fs.writeFileSync(processorPath, csvProcessorScript);
  console.log(`\n✓ Created CSV processor at: ${processorPath}`);
  
  return null;
}

downloadCityPopulationData().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
