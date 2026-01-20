// Wikipedia enrichment script
// Enriches cities with Wikipedia summaries for rich SEO content
// Data source: Wikipedia REST API (free, no key required)

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load schema
let schema;
try {
  schema = require('../../src/instant.schema.ts');
} catch (e) {
  schema = require('../../src/instant.schema.ts').default;
}

// Load environment variables
try {
  const envPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const match = trimmedLine.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key] && value) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in .env.local or as an environment variable');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Cache for Wikipedia API responses
const wikipediaCache = new Map();

/**
 * Get Wikipedia summary for a city
 * @param {string} cityName - City name
 * @param {string} stateName - State name (for disambiguation)
 * @returns {Promise<{summary: string, url: string, notableFacts: string[]}|null>}
 */
async function getWikipediaData(cityName, stateName) {
  // Try multiple search patterns for better results
  const searchQueries = [
    `${cityName}, ${stateName}`,
    cityName,
    `${cityName} (${stateName})`,
  ];
  
  for (const query of searchQueries) {
    const cacheKey = `${cityName}|${stateName}`;
    
    if (wikipediaCache.has(cacheKey)) {
      return wikipediaCache.get(cacheKey);
    }
    
    try {
      // Wikipedia REST API - get page summary
      // URL format: https://en.wikipedia.org/api/rest_v1/page/summary/{title}
      const encodedTitle = encodeURIComponent(query);
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedTitle}`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'CityEnrichmentBot/1.0 (contact@example.com)',
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if it's a valid page (not disambiguation or missing)
        if (data.type === 'standard' && data.extract) {
          // Extract first 2-3 sentences (usually 300-500 chars)
          const extract = data.extract;
          const sentences = extract.match(/[^.!?]+[.!?]+/g) || [];
          const summary = sentences.slice(0, 3).join(' ').trim();
          
          // Get notable facts from extract (key phrases)
          const notableFacts = [];
          
          // Look for population mentions, founding dates, etc.
          const populationMatch = extract.match(/population (?:of )?([\d,]+)/i);
          if (populationMatch) {
            notableFacts.push(`Population: ${populationMatch[1]}`);
          }
          
          const foundedMatch = extract.match(/founded (?:in )?(\d{4})/i);
          if (foundedMatch) {
            notableFacts.push(`Founded: ${foundedMatch[1]}`);
          }
          
          const result = {
            summary: summary || extract.substring(0, 500).trim(),
            url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
            notableFacts: notableFacts.length > 0 ? notableFacts : []
          };
          
          // Cache result
          wikipediaCache.set(cacheKey, result);
          
          // Rate limiting: Wikipedia allows 200 req/s but be respectful
          await new Promise(resolve => setTimeout(resolve, 50));
          
          return result;
        } else if (data.type === 'disambiguation') {
          // Try with state name appended
          continue;
        }
      } else if (response.status === 404) {
        // Page not found, try next query
        continue;
      } else {
        console.warn(`  ⚠ Wikipedia API returned ${response.status} for ${query}`);
      }
    } catch (error) {
      console.warn(`  ⚠ Error fetching Wikipedia data for ${query}: ${error.message}`);
      // Continue to next query
    }
    
    // Small delay between attempts
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // No Wikipedia page found
  return null;
}

/**
 * Enrich cities with Wikipedia data
 * @param {number|null} testLimit - Optional limit on number of cities to process (for testing)
 */
async function enrichWikipedia(testLimit = null) {
  console.log('Starting Wikipedia enrichment...\n');
  
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
    if (cities.length < limit) break;
    offset += limit;
    
    // If test limit is set, stop when we have enough cities
    if (testLimit && allCities.length >= testLimit) {
      allCities = allCities.slice(0, testLimit);
      break;
    }
  }
  
  if (testLimit) {
    console.log(`Found ${allCities.length} cities (limited to ${testLimit} for testing)\n`);
  } else {
    console.log(`Found ${allCities.length} cities in database\n`);
  }
  
  // Filter cities that need enrichment
  let citiesToEnrich = allCities.filter(city => 
    !city.wikipediaSummary || !city.wikipediaUrl
  );
  
  // Apply limit after filtering if test limit is set
  if (testLimit && citiesToEnrich.length > testLimit) {
    citiesToEnrich = citiesToEnrich.slice(0, testLimit);
  }
  
  console.log(`Processing ${citiesToEnrich.length} cities that need enrichment${testLimit ? ` (limited to ${testLimit})` : ''}\n`);
  
  const BATCH_SIZE = 20; // Batch size for database updates
  let enrichedCount = 0;
  let skippedCount = 0;
  const updateTxs = [];
  const startTime = Date.now();
  
  for (let i = 0; i < citiesToEnrich.length; i++) {
    const city = citiesToEnrich[i];
    const percent = ((i + 1) / citiesToEnrich.length * 100).toFixed(1);
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const avgTimePerCity = enrichedCount > 0 ? Math.floor((Date.now() - startTime) / 1000 / enrichedCount) : 0;
    const remaining = citiesToEnrich.length - i - 1;
    const estimatedTimeRemaining = remaining > 0 && avgTimePerCity > 0 ? Math.floor(remaining * avgTimePerCity) : 0;
    
    // Progress header every 10 cities
    if (i === 0 || i % 10 === 0 || i === citiesToEnrich.length - 1) {
      console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`  Progress: ${i + 1}/${citiesToEnrich.length} (${percent}%) | Enriched: ${enrichedCount} | Skipped: ${skippedCount} | Elapsed: ${elapsed}s`);
      if (estimatedTimeRemaining > 0) {
        const mins = Math.floor(estimatedTimeRemaining / 60);
        const secs = estimatedTimeRemaining % 60;
        console.log(`  Estimated time remaining: ${mins}m ${secs}s | Avg: ${avgTimePerCity}s per city`);
      }
      console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
    
    // Fetch Wikipedia data
    process.stdout.write(`  [${(i + 1).toString().padStart(3)}/${citiesToEnrich.length}] ${city.city}, ${city.state}... `);
    
    const wikipediaData = await getWikipediaData(city.city, city.state);
    
    if (!wikipediaData) {
      skippedCount++;
      console.log('✗ No Wikipedia page found');
      continue;
    }
    
    // Prepare update data
    const updateData = {
      wikipediaSummary: wikipediaData.summary,
      wikipediaUrl: wikipediaData.url,
    };
    
    if (wikipediaData.notableFacts && wikipediaData.notableFacts.length > 0) {
      updateData.notableFacts = JSON.stringify(wikipediaData.notableFacts);
    }
    
    updateTxs.push(
      db.tx.cities[city.id].update(updateData)
    );
    enrichedCount++;
    
    const summaryPreview = wikipediaData.summary.substring(0, 80).replace(/\n/g, ' ');
    console.log(`✓ "${summaryPreview}..."`);
    
    // Commit batch
    if (updateTxs.length >= BATCH_SIZE || i === citiesToEnrich.length - 1) {
      if (updateTxs.length > 0) {
        process.stdout.write(`      Committing batch to database (${updateTxs.length} cities)... `);
        try {
          await db.transact(updateTxs);
          console.log(`✓`);
          updateTxs.length = 0;
        } catch (error) {
          console.log(`✗ Error: ${error.message}`);
          updateTxs.length = 0;
        }
      }
    }
    
    // Rate limiting for Wikipedia API (be respectful - small delay)
    if (i < citiesToEnrich.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log(`\n✅ Wikipedia enrichment complete!`);
  console.log(`   - Enriched: ${enrichedCount} cities`);
  console.log(`   - Skipped: ${skippedCount} cities (no Wikipedia page found)`);
  console.log(`   - Already enriched: ${allCities.length - citiesToEnrich.length} cities`);
  console.log(`\n💡 Note: Wikipedia content is available under Creative Commons Attribution-ShareAlike 3.0`);
}

// Run if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  const limit = limitIndex !== -1 && args[limitIndex + 1] ? parseInt(args[limitIndex + 1], 10) : null;
  
  enrichWikipedia(limit).catch(error => {
    console.error('\n✗ Error enriching Wikipedia data:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { enrichWikipedia, getWikipediaData };
