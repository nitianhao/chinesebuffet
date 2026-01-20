/**
 * Export all buffets from InstantDB to a JSON file for Yelp matching
 * This exports ALL buffets (not just the processed ones)
 */

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
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

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function exportAllBuffets() {
  console.log('Fetching ALL buffets from InstantDB...');
  
  try {
    // Fetch all buffets - try to get them all
    console.log('Querying buffets (this may take a moment for large datasets)...');
    
    let allBuffets = [];
    let offset = 0;
    const limit = 1000; // Fetch in batches
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
          
          // If we got fewer than the limit, we're done
          if (buffets.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        }
      } catch (error) {
        console.error(`Error fetching batch at offset ${offset}:`, error.message);
        // Try without limit/offset
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
    
    console.log(`\nTotal buffets fetched: ${allBuffets.length}`);
    
    // Transform to format expected by matching script
    const buffetsById = {};
    
    for (const buffet of allBuffets) {
      const buffetId = buffet.id;
      
      // Extract address components
      const addressString = typeof buffet.address === 'string' ? buffet.address : '';
      const addressParts = addressString.split(',').map(s => s.trim());
      
      buffetsById[buffetId] = {
        id: buffetId,
        name: buffet.name || '',
        slug: buffet.slug || '',
        address: {
          street: buffet.street || addressParts[0] || '',
          city: buffet.cityName || buffet.city?.city || addressParts[1] || '',
          state: buffet.state || addressParts[2] || '',
          stateAbbr: buffet.stateAbbr || '',
          postalCode: buffet.postalCode || addressParts[3] || '',
          full: buffet.address || addressString
        },
        phone: buffet.phone || '',
        phoneUnformatted: buffet.phoneUnformatted || '',
        location: {
          lat: buffet.lat || 0,
          lng: buffet.lng || 0
        }
      };
    }
    
    // Save to file
    const outputPath = path.join(__dirname, '../data/all-buffets-for-matching.json');
    fs.writeFileSync(outputPath, JSON.stringify(buffetsById, null, 2), 'utf8');
    
    console.log(`\n✓ Exported ${Object.keys(buffetsById).length} buffets to: ${outputPath}`);
    console.log('\nYou can now run the Yelp matching script with this file.');
    
  } catch (error) {
    console.error('Error exporting buffets:', error);
    process.exit(1);
  }
}

exportAllBuffets();
















