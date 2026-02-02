// Script to enrich neighborhood data using Groq API
// Run with: node scripts/enrich-neighborhoods-with-groq.js [--all] [--limit N]
// Without --all flag, processes only 10 records for testing
// --limit N: process only N records (useful for testing)

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
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export INSTANT_ADMIN_TOKEN="your-token-here"');
  process.exit(1);
}

if (!process.env.GROQ_API_KEY) {
  console.error('Error: GROQ_API_KEY environment variable is required');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export GROQ_API_KEY="your-key-here"');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const migrateAll = process.argv.includes('--all');
const limitArg = process.argv.findIndex(arg => arg === '--limit');
const testLimit = limitArg !== -1 && process.argv[limitArg + 1] 
  ? parseInt(process.argv[limitArg + 1], 10) 
  : (migrateAll ? null : 10);

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getNeighborhoodFromGroq(address, city, state, lat, lng) {
  const apiKey = process.env.GROQ_API_KEY;
  
  const prompt = `Given the following location information, determine the neighborhood name if it's a well-known, established neighborhood. 

Location details:
- Address: ${address || 'N/A'}
- City: ${city || 'N/A'}
- State: ${state || 'N/A'}
- Coordinates: ${lat}, ${lng}

IMPORTANT INSTRUCTIONS:
1. Only return a neighborhood name if it's a REAL, ESTABLISHED, WELL-KNOWN neighborhood in that city
2. Do NOT make up or invent neighborhood names
3. Do NOT return generic area names like "Downtown", "City Center", "Business District" unless that's the actual official neighborhood name
4. If you're not certain about a specific, well-known neighborhood name, return exactly "NONE"
5. Return ONLY the neighborhood name (e.g., "Greenwich Village", "SoHo", "Mission District") or "NONE" if no known neighborhood exists
6. Do not include any explanation, just the neighborhood name or "NONE"

Neighborhood name:`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.1, // Low temperature to reduce hallucination
          max_tokens: 50, // Neighborhood names are short
          messages: [
            {
              role: 'system',
              content: 'You are a geographic information expert. You only return real, established neighborhood names. If uncertain, return "NONE".'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const sleepMs = Math.min(2000 * Math.pow(2, attempt), 10000);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  Rate limit hit, waiting ${Math.round(sleepMs / 1000)}s before retry...`);
          await delay(sleepMs);
          continue;
        }
        throw new Error('Groq rate limited');
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await delay(500 * (attempt + 1));
          continue;
        }
        throw new Error(`Groq error: ${response.status}`);
      }

      const data = await response.json();
      let text = data?.choices?.[0]?.message?.content || '';
      
      // Clean up the response
      text = text.trim();
      text = text.replace(/```[\w]*\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Check if response indicates no neighborhood
      if (!text || text.toUpperCase() === 'NONE' || text.toUpperCase() === 'N/A' || text.toUpperCase() === 'UNKNOWN') {
        return null;
      }
      
      // Additional validation: reject generic terms
      const genericTerms = ['downtown', 'city center', 'business district', 'commercial district', 'residential area', 'suburban area'];
      const lowerText = text.toLowerCase();
      if (genericTerms.some(term => lowerText.includes(term))) {
        return null;
      }
      
      // Return the neighborhood name if it looks valid
      // Neighborhood names are typically 1-4 words, not too long
      const words = text.split(/\s+/);
      if (words.length > 5) {
        // Too long, probably not a neighborhood name
        return null;
      }
      
      return text;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw new Error('Request timeout');
      }
      
      // Retry on network errors or server errors
      if (attempt < MAX_RETRIES - 1) {
        const isServerError = error?.status >= 500 || error?.message?.includes('5');
        if (isServerError || error?.message?.includes('network') || error?.message?.includes('ECONNREFUSED')) {
          await delay(500 * (attempt + 1));
          continue;
        }
      }
      
      throw error;
    }
  }

  throw new Error('Groq unavailable after retries');
}

async function enrichNeighborhoods() {
  console.log('='.repeat(80));
  console.log('Enriching neighborhood data using Groq API');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : testLimit ? `LIMIT (${testLimit} records)` : 'TEST (10 records)'}\n`);

  try {
    // Fetch buffets with empty/null neighborhoods using pagination
    console.log('Fetching buffets with empty neighborhoods...');
    
    // Fetch buffets in batches to avoid memory issues
    let allBuffets = [];
    let buffetsWithoutNeighborhood = [];
    let offset = 0;
    const batchSize = 1000;
    let hasMore = true;
    const targetCount = testLimit || (migrateAll ? null : 10);

    while (hasMore) {
      try {
        const result = await db.query({
          buffets: {
            $: { 
              limit: batchSize, 
              offset: offset 
            }
          }
        });

        const buffets = result.buffets || [];
        console.log(`  Fetched ${buffets.length} buffets (offset: ${offset})`);

        if (buffets.length === 0) {
          hasMore = false;
        } else {
          allBuffets = allBuffets.concat(buffets);
          
          // Filter buffets with empty/null neighborhoods as we go
          const batchWithoutNeighborhood = buffets.filter(buffet => {
            const neighborhood = buffet.neighborhood;
            return !neighborhood || 
                   typeof neighborhood !== 'string' || 
                   neighborhood.trim() === '';
          });
          
          buffetsWithoutNeighborhood = buffetsWithoutNeighborhood.concat(batchWithoutNeighborhood);
          
          // If we have a target count and we've found enough, we can stop early
          if (targetCount && buffetsWithoutNeighborhood.length >= targetCount) {
            console.log(`  Found ${buffetsWithoutNeighborhood.length} buffets without neighborhood (target: ${targetCount}), stopping fetch early`);
            hasMore = false;
          } else if (buffets.length < batchSize) {
            hasMore = false;
          } else {
            offset += batchSize;
          }
        }
      } catch (error) {
        console.error(`Error fetching batch at offset ${offset}:`, error.message);
        hasMore = false;
      }
    }

    console.log(`✓ Found ${buffetsWithoutNeighborhood.length} buffets without neighborhood out of ${allBuffets.length} total buffets\n`);

    if (buffetsWithoutNeighborhood.length === 0) {
      console.log('No buffets without neighborhood found. All done!');
      return;
    }

    // Limit records for testing
    const buffetsToProcess = testLimit 
      ? buffetsWithoutNeighborhood.slice(0, testLimit)
      : buffetsWithoutNeighborhood;

    console.log(`Processing ${buffetsToProcess.length} buffets...\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let noNeighborhood = 0;

    // Process buffets one by one to avoid rate limits
    for (let i = 0; i < buffetsToProcess.length; i++) {
      const buffet = buffetsToProcess[i];
      
      try {
        console.log(`[${i + 1}/${buffetsToProcess.length}] Processing "${buffet.name}"`);
        console.log(`  Location: ${buffet.address || 'N/A'}, ${buffet.cityName || 'N/A'}, ${buffet.state || 'N/A'}`);
        console.log(`  Coordinates: ${buffet.lat}, ${buffet.lng}`);

        // Skip if already has neighborhood (shouldn't happen due to filter, but double-check)
        if (buffet.neighborhood && buffet.neighborhood.trim() !== '') {
          console.log(`  ⏭ Skipping - already has neighborhood: ${buffet.neighborhood}`);
          skipped++;
          continue;
        }

        // Call Groq to get neighborhood
        const neighborhood = await getNeighborhoodFromGroq(
          buffet.address || buffet.street,
          buffet.cityName,
          buffet.state || buffet.stateAbbr,
          buffet.lat,
          buffet.lng
        );

        if (!neighborhood) {
          console.log(`  ⏭ No known neighborhood found for this location`);
          noNeighborhood++;
          // Add a small delay even when skipping to be respectful to API
          await delay(500);
          continue;
        }

        // Update the database
        try {
          await db.transact([
            db.tx.buffets[buffet.id].update({
              neighborhood: neighborhood
            })
          ]);

          console.log(`  ✓ Updated neighborhood: "${neighborhood}"`);
          updated++;
        } catch (updateError) {
          console.error(`  ✗ Error updating database:`, updateError.message);
          errors++;
        }

        // Add delay between requests to avoid rate limits
        if (i < buffetsToProcess.length - 1) {
          await delay(1000); // 1 second delay between requests
        }

      } catch (error) {
        console.error(`  ✗ Error processing buffet "${buffet.name}":`, error.message);
        errors++;
        // Continue with next buffet
        await delay(1000);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Enrichment Summary:');
    console.log(`  ✓ Updated: ${updated}`);
    console.log(`  ⏭ Skipped (no neighborhood found): ${noNeighborhood}`);
    console.log(`  ⏭ Skipped (already had neighborhood): ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log('='.repeat(80));

    if (!migrateAll && updated > 0) {
      console.log('\n✓ Test enrichment completed successfully!');
      console.log('To process all records, run:');
      console.log('  node scripts/enrich-neighborhoods-with-groq.js --all\n');
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

enrichNeighborhoods().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
