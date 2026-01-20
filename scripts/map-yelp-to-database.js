/**
 * Map Yelp restaurant data to database records by matching name + address
 * Adds placeID field to each JSON entry for easier import
 */

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
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
  // Ignore errors reading .env.local - environment variables may already be set
  console.log('Note: Could not read .env.local, using existing environment variables');
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

/**
 * Normalize a string for comparison (lowercase, remove special chars, trim)
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Normalize restaurant name for matching
 */
function normalizeName(name) {
  if (!name) return '';
  // Remove common suffixes that might differ
  return normalizeString(name)
    .replace(/\s+(restaurant|buffet|chinese|eatery|bistro|cafe|diner|grill|kitchen|house|palace|garden|express|takeout|take-out)$/i, '')
    .trim();
}

/**
 * Normalize address for matching
 */
function normalizeAddress(address) {
  if (!address) return '';
  return normalizeString(address)
    .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|way|circle|cir|court|ct)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract street address from full address string
 */
function extractStreetAddress(address) {
  if (!address) return '';
  // Take the first part before comma (usually the street)
  const parts = address.split(',').map(s => s.trim());
  return normalizeAddress(parts[0] || address);
}

/**
 * Match a Yelp entry to a database buffet
 */
function findMatchingBuffet(yelpEntry, buffets) {
  // Extract Yelp data - try multiple sources
  const yelpName = yelpEntry.buffetName || yelpEntry.yelp?.name || '';
  
  // Try to get address from multiple locations
  const yelpAddress = yelpEntry.yelp?.address || 
                      (yelpEntry.yelp?.location?.address1 ? 
                        `${yelpEntry.yelp.location.address1} ${yelpEntry.yelp.location.city || ''} ${yelpEntry.yelp.location.state || ''}`.trim() : 
                        '');
  
  const yelpStreet = yelpEntry.yelp?.location?.address1 || 
                     extractStreetAddress(yelpEntry.yelp?.address || '');
  
  const yelpCity = yelpEntry.city || 
                   yelpEntry.yelp?.city || 
                   yelpEntry.yelp?.location?.city || '';
  
  const yelpState = yelpEntry.state || 
                    yelpEntry.yelp?.state || 
                    yelpEntry.yelp?.location?.state || '';
  
  const normalizedYelpName = normalizeName(yelpName);
  const normalizedYelpStreet = normalizeAddress(yelpStreet);
  const normalizedYelpCity = normalizeString(yelpCity);
  const normalizedYelpState = normalizeString(yelpState);
  
  // Try exact matches first
  let bestMatch = null;
  let bestScore = 0;
  
  for (const buffet of buffets) {
    const buffetName = buffet.name || '';
    const buffetAddress = buffet.address || '';
    const buffetCity = buffet.cityName || buffet.city?.city || '';
    const buffetState = buffet.state || '';
    
    const normalizedBuffetName = normalizeName(buffetName);
    const normalizedBuffetStreet = extractStreetAddress(buffetAddress);
    const normalizedBuffetCity = normalizeString(buffetCity);
    const normalizedBuffetState = normalizeString(buffetState);
    
    let score = 0;
    
    // Name match (most important)
    if (normalizedYelpName === normalizedBuffetName) {
      score += 50;
    } else if (normalizedYelpName.includes(normalizedBuffetName) || normalizedBuffetName.includes(normalizedYelpName)) {
      score += 30;
    }
    
    // Street address match
    if (normalizedYelpStreet && normalizedBuffetStreet) {
      if (normalizedYelpStreet === normalizedBuffetStreet) {
        score += 30;
      } else {
        // Check if street numbers match (important for same location)
        const yelpStreetNum = normalizedYelpStreet.match(/^\d+/)?.[0];
        const buffetStreetNum = normalizedBuffetStreet.match(/^\d+/)?.[0];
        if (yelpStreetNum && buffetStreetNum && yelpStreetNum === buffetStreetNum) {
          score += 20; // Same street number is a strong signal
        }
        
        // Partial match
        if (normalizedYelpStreet.includes(normalizedBuffetStreet) || normalizedBuffetStreet.includes(normalizedYelpStreet)) {
          score += 15;
        }
      }
    }
    
    // City match
    if (normalizedYelpCity && normalizedBuffetCity) {
      if (normalizedYelpCity === normalizedBuffetCity) {
        score += 15;
      }
    }
    
    // State match
    if (normalizedYelpState && normalizedBuffetState) {
      if (normalizedYelpState === normalizedBuffetState || 
          normalizedYelpState === normalizedBuffetState.substring(0, 2) ||
          normalizedBuffetState === normalizedYelpState.substring(0, 2)) {
        score += 5;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = buffet;
    }
  }
  
  // Only return match if score is high enough (at least name + some address match)
  if (bestScore >= 50) {
    return bestMatch;
  }
  
  return null;
}

async function mapYelpToDatabase() {
  const jsonPath = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
  
  console.log('Loading Yelp JSON file...');
  const yelpData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const yelpEntries = Object.values(yelpData);
  console.log(`Loaded ${yelpEntries.length} Yelp entries\n`);
  
  console.log('Fetching all buffets from InstantDB...');
  
  try {
    // Fetch all buffets
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    let hasMore = true;
    
    while (hasMore) {
      try {
        const result = await db.query({
          buffets: {
            $: { limit: limit, offset: offset },
            city: {}
          }
        });
        
        const buffets = result.buffets || [];
        console.log(`  Fetched ${buffets.length} buffets (offset: ${offset})`);
        
        if (buffets.length === 0) {
          hasMore = false;
        } else {
          allBuffets = allBuffets.concat(buffets);
          
          if (buffets.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        }
      } catch (error) {
        console.error(`Error fetching batch at offset ${offset}:`, error.message);
        if (offset === 0) {
          console.log('Trying without pagination...');
          const result = await db.query({
            buffets: {
              city: {}
            }
          });
          allBuffets = result.buffets || [];
        }
        hasMore = false;
      }
    }
    
    console.log(`\nTotal buffets in database: ${allBuffets.length}\n`);
    
    // Map each Yelp entry to database
    let matchedCount = 0;
    let unmatchedCount = 0;
    const unmatchedEntries = [];
    
    console.log('Matching Yelp entries to database records...\n');
    
    for (const [key, entry] of Object.entries(yelpData)) {
      const match = findMatchingBuffet(entry, allBuffets);
      
      if (match) {
        // Add placeID (prefer placeId from database, fallback to id)
        entry.placeID = match.placeId || match.id || null;
        matchedCount++;
        
        if (matchedCount % 100 === 0) {
          console.log(`  Matched ${matchedCount} entries...`);
        }
      } else {
        entry.placeID = null;
        unmatchedCount++;
        unmatchedEntries.push({
          key,
          name: entry.buffetName || entry.yelp?.name,
          address: entry.yelp?.address,
          city: entry.city || entry.yelp?.city,
          state: entry.state || entry.yelp?.state
        });
      }
    }
    
    // Save updated JSON
    const outputPath = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
    fs.writeFileSync(outputPath, JSON.stringify(yelpData, null, 2), 'utf8');
    
    console.log(`\n✓ Mapping complete!`);
    console.log(`  Matched: ${matchedCount} entries (${((matchedCount / yelpEntries.length) * 100).toFixed(1)}%)`);
    console.log(`  Unmatched: ${unmatchedCount} entries (${((unmatchedCount / yelpEntries.length) * 100).toFixed(1)}%)`);
    console.log(`  Updated file: ${outputPath}\n`);
    
    // Count how many have placeID vs id
    let placeIdCount = 0;
    let idCount = 0;
    for (const entry of Object.values(yelpData)) {
      if (entry.placeID) {
        // Check if it's a Google Place ID (starts with ChIJ) or a UUID
        if (entry.placeID.startsWith('ChIJ')) {
          placeIdCount++;
        } else {
          idCount++;
        }
      }
    }
    
    console.log(`  Entries with Google Place ID: ${placeIdCount}`);
    console.log(`  Entries with database ID: ${idCount}\n`);
    
    // Save unmatched entries report
    if (unmatchedEntries.length > 0) {
      const reportPath = path.join(__dirname, '../Example JSON/yelp-unmatched-entries.json');
      fs.writeFileSync(reportPath, JSON.stringify(unmatchedEntries, null, 2), 'utf8');
      console.log(`  Unmatched entries report saved to: ${reportPath}`);
      console.log(`  You can review these entries and manually match them if needed.\n`);
    }
    
  } catch (error) {
    console.error('Error mapping Yelp data:', error);
    process.exit(1);
  }
}

mapYelpToDatabase();

