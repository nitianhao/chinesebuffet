// Script to update cities with population data using multiple data sources
// Updates directly in InstantDB
// Run with: node scripts/update-cities-population.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  // Silently fail if .env.local can't be read
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Cache for population data to avoid duplicate API calls
const populationCache = new Map();

// Clean and validate state abbreviation
function cleanStateAbbr(stateAbbr) {
  if (!stateAbbr) return null;
  
  // Remove any numbers or invalid characters
  const cleaned = stateAbbr.toString().trim().replace(/[^A-Za-z]/g, '').toUpperCase();
  
  // Valid 2-letter state codes
  const validStates = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 
                       'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                       'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                       'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                       'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'];
  
  if (cleaned.length === 2 && validStates.includes(cleaned)) {
    return cleaned;
  }
  
  return null;
}

// Get population using World Population Review API (simpler approach)
async function getPopulationFromWPR(cityName, stateAbbr, retries = 2) {
  const cleanState = cleanStateAbbr(stateAbbr);
  if (!cleanState) return null;
  
  const cacheKey = `${cityName.toLowerCase()}-${cleanState.toLowerCase()}`;
  
  // Check cache first
  if (populationCache.has(cacheKey)) {
    return populationCache.get(cacheKey);
  }
  
  // Try World Population Review - they have a simple structure
  // Format: https://worldpopulationreview.com/us-cities/{city-name}-{state-abbr}
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Clean city name for URL
      const citySlug = cityName
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      
      const url = `https://worldpopulationreview.com/us-cities/${citySlug}-${cleanState.toLowerCase()}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.ok) {
        const html = await response.text();
        
        // Look for population in the HTML
        // Common patterns: "Population: 123,456" or "123,456" near "population"
        const patterns = [
          /population[:\s]+(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/i,
          /(\d{1,3}(?:,\d{3})*(?:,\d{3})*)\s*(?:residents|people|population)/i,
          /<span[^>]*>(\d{1,3}(?:,\d{3})*(?:,\d{3})*)<\/span>/g,
        ];
        
        for (const pattern of patterns) {
          const matches = html.match(pattern);
          if (matches) {
            for (const match of matches) {
              const numMatch = match.match(/(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/);
              if (numMatch) {
                const population = parseInt(numMatch[1].replace(/,/g, ''), 10);
                if (population >= 1000 && population <= 50000000) {
                  populationCache.set(cacheKey, population);
                  return population;
                }
              }
            }
          }
        }
      } else if (response.status === 429) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
      }
    } catch (error) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  return null;
}

// Get population using DataUSA API (free, no key required)
async function getPopulationFromDataUSA(cityName, stateAbbr, retries = 2) {
  const cleanState = cleanStateAbbr(stateAbbr);
  if (!cleanState) return null;
  
  const cacheKey = `${cityName.toLowerCase()}-${cleanState.toLowerCase()}`;
  
  // Check cache first
  if (populationCache.has(cacheKey)) {
    return populationCache.get(cacheKey);
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // DataUSA API format
      const url = `https://datausa.io/api/data?drilldowns=Place&measures=Population&Geography=${encodeURIComponent(cityName)}, ${cleanState}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CityPopulationBot/1.0)'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
          // Find the most recent year
          const latest = data.data.reduce((latest, current) => {
            return (!latest || current.Year > latest.Year) ? current : latest;
          }, null);
          
          if (latest && latest.Population) {
            const population = parseInt(latest.Population, 10);
            if (population > 0) {
              populationCache.set(cacheKey, population);
              return population;
            }
          }
        }
      } else if (response.status === 429) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
          continue;
        }
      }
    } catch (error) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  
  return null;
}

// Get population using Wikipedia (improved parsing)
async function getPopulationFromWikipedia(cityName, stateAbbr, retries = 2) {
  const cleanState = cleanStateAbbr(stateAbbr);
  if (!cleanState) return null;
  
  const cacheKey = `${cityName.toLowerCase()}-${cleanState.toLowerCase()}`;
  
  // Check cache first
  if (populationCache.has(cacheKey)) {
    return populationCache.get(cacheKey);
  }
  
  // Try different Wikipedia page title formats
  const pageTitleVariations = [
    `${cityName}, ${cleanState}`,
    cityName,
  ];
  
  for (const pageTitle of pageTitleVariations) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const encodedTitle = encodeURIComponent(pageTitle);
        const wikipediaUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
        
        const response = await fetch(wikipediaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CityPopulationBot/1.0)'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          const extract = data.extract || '';
          
          // Improved population extraction patterns
          const patterns = [
            /population[:\s]+(?:of\s+)?(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/i,
            /(\d{1,3}(?:,\d{3})*(?:,\d{3})*)\s+(?:residents|people|inhabitants)/i,
            /with\s+(?:a\s+)?population\s+(?:of\s+)?(\d{1,3}(?:,\d{3})*(?:,\d{3})*)/i,
          ];
          
          for (const pattern of patterns) {
            const match = extract.match(pattern);
            if (match) {
              const population = parseInt(match[1].replace(/,/g, ''), 10);
              if (population >= 1000 && population <= 50000000) {
                populationCache.set(cacheKey, population);
                return population;
              }
            }
          }
        } else if (response.status === 404) {
          break; // Try next variation
        } else if (response.status === 429) {
          if (attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
            continue;
          }
        }
      } catch (error) {
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
      }
    }
  }
  
  return null;
}

// Main function to get population - tries multiple sources
async function getPopulation(cityName, stateAbbr) {
  // Try multiple sources in order of reliability
  const sources = [
    () => getPopulationFromDataUSA(cityName, stateAbbr),
    () => getPopulationFromWikipedia(cityName, stateAbbr),
    () => getPopulationFromWPR(cityName, stateAbbr),
  ];
  
  for (const source of sources) {
    try {
      const population = await source();
      if (population) {
        return population;
      }
    } catch (error) {
      // Continue to next source
      continue;
    }
  }
  
  return null;
}

// Main function to update cities with population data
async function updateCitiesPopulation() {
  console.log('Fetching all cities from InstantDB...');
  
  // Fetch all cities
  let allCities = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      cities: {
        $: {
          limit: limit,
          offset: offset,
        }
      }
    });
    
    const cities = result.cities || [];
    if (cities.length === 0) break;
    
    allCities = allCities.concat(cities);
    console.log(`  Fetched ${allCities.length} cities so far...`);
    
    if (cities.length < limit) break;
    offset += limit;
  }
  
  console.log(`\nTotal cities in database: ${allCities.length}`);
  
  // Find cities that need population updates
  const citiesToUpdate = [];
  let alreadyHasPopulation = 0;
  
  allCities.forEach(city => {
    // Check if city already has population data (and it's not 0)
    if (city.population && city.population > 0) {
      alreadyHasPopulation++;
      return;
    }
    
    citiesToUpdate.push(city);
  });
  
  console.log(`\nCities status:`);
  console.log(`  - Already have population: ${alreadyHasPopulation}`);
  console.log(`  - Need population update: ${citiesToUpdate.length}`);
  
  if (citiesToUpdate.length === 0) {
    console.log('\n✓ All cities already have population data!');
    return;
  }
  
  console.log(`\nUpdating ${citiesToUpdate.length} cities with population data...`);
  console.log('Using multiple data sources: DataUSA API, Wikipedia, World Population Review\n');
  
  // Update cities in batches
  const BATCH_SIZE = 25;
  const totalBatches = Math.ceil(citiesToUpdate.length / BATCH_SIZE);
  let updatedCount = 0;
  let failedCount = 0;
  const updateTxs = [];
  
  for (let i = 0; i < citiesToUpdate.length; i++) {
    const city = citiesToUpdate[i];
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    // Progress indicator
    if (i % 10 === 0 || i === citiesToUpdate.length - 1) {
      const percent = ((i + 1) / citiesToUpdate.length * 100).toFixed(1);
      console.log(`  [${percent}%] Processing ${i + 1}/${citiesToUpdate.length}: ${city.city}, ${city.stateAbbr || 'N/A'}...`);
    }
    
    // Skip if state abbreviation is invalid
    if (!cleanStateAbbr(city.stateAbbr)) {
      failedCount++;
      console.warn(`    ⚠ Skipping ${city.city} - invalid state abbreviation: ${city.stateAbbr}`);
      continue;
    }
    
    // Fetch population from multiple sources
    const population = await getPopulation(city.city, city.stateAbbr);
    
    if (population && population > 0) {
      updateTxs.push(
        db.tx.cities[city.id].update({
          population: population
        })
      );
      updatedCount++;
      console.log(`    ✓ Found population: ${population.toLocaleString()}`);
    } else {
      failedCount++;
      console.warn(`    ⚠ Could not find population for ${city.city}, ${city.stateAbbr}`);
    }
    
    // Rate limiting: add delay between requests
    if (i < citiesToUpdate.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms delay
    }
    
    // Commit batch when full or at the end
    if (updateTxs.length >= BATCH_SIZE || i === citiesToUpdate.length - 1) {
      if (updateTxs.length > 0) {
        try {
          await db.transact(updateTxs);
          console.log(`    ✓ Committed batch ${batchNum}/${totalBatches} (${updateTxs.length} cities updated)`);
          updateTxs.length = 0;
        } catch (error) {
          console.error(`    ✗ Error updating batch ${batchNum}:`, error.message);
          updateTxs.length = 0;
        }
      }
    }
  }
  
  console.log(`\n✅ Update complete!`);
  console.log(`   - Updated: ${updatedCount} cities`);
  console.log(`   - Failed: ${failedCount} cities`);
  console.log(`   - Already had population: ${alreadyHasPopulation} cities`);
  
  // Final stats
  const finalCities = await db.query({ cities: {} });
  const citiesWithPopulation = finalCities.cities.filter(c => c.population && c.population > 0).length;
  console.log(`\n   Total cities with population data: ${citiesWithPopulation}/${finalCities.cities.length}`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateCitiesPopulation().catch(error => {
  console.error('\n✗ Error updating cities population:', error);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
