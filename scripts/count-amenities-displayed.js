const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      // Skip comments and empty lines
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      // Match key=value format
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
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

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

async function countAmenitiesDisplayed() {
  try {
    console.log("Fetching structuredData records with type = 'allowsDogs' or 'curbsidePickup'...");
    
    // Query structuredData records filtered by type
    const allowsDogsResult = await db.query({
      structuredData: {
        $: {
          where: { type: 'allowsDogs' },
          limit: 100000,
        }
      }
    });

    const curbsidePickupResult = await db.query({
      structuredData: {
        $: {
          where: { type: 'curbsidePickup' },
          limit: 100000,
        }
      }
    });

    const allowsDogsRecords = allowsDogsResult.structuredData || [];
    const curbsidePickupRecords = curbsidePickupResult.structuredData || [];

    console.log(`\nFound ${allowsDogsRecords.length} allowsDogs records`);
    console.log(`Found ${curbsidePickupRecords.length} curbsidePickup records`);

    // Get unique buffet IDs from both sets
    const buffetIds = new Set();
    
    // Get buffet IDs from allowsDogs records
    for (const record of allowsDogsRecords) {
      // Need to query which buffets have this structuredData linked
      // Let's query buffets that have structuredData linked
      const buffetQuery = await db.query({
        buffets: {
          $: {
            limit: 100000,
          },
          structuredData: {
            $: {
              where: { id: record.id },
            }
          }
        }
      });
      
      if (buffetQuery.buffets) {
        buffetQuery.buffets.forEach(buffet => {
          if (buffet.id) {
            buffetIds.add(buffet.id);
          }
        });
      }
    }

    // Get buffet IDs from curbsidePickup records
    for (const record of curbsidePickupRecords) {
      const buffetQuery = await db.query({
        buffets: {
          $: {
            limit: 100000,
          },
          structuredData: {
            $: {
              where: { id: record.id },
            }
          }
        }
      });
      
      if (buffetQuery.buffets) {
        buffetQuery.buffets.forEach(buffet => {
          if (buffet.id) {
            buffetIds.add(buffet.id);
          }
        });
      }
    }

    console.log(`\n=== Result ===`);
    console.log(`Total unique buffets with allowsDogs or curbsidePickup: ${buffetIds.size}`);
    console.log(`\nBreakdown:`);
    console.log(`- allowsDogs records: ${allowsDogsRecords.length}`);
    console.log(`- curbsidePickup records: ${curbsidePickupRecords.length}`);
    console.log(`- Unique buffets: ${buffetIds.size}`);
    
    return buffetIds.size;
  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

// Alternative approach: Query buffets directly with structuredData links
async function countAmenitiesDisplayedV2() {
  try {
    console.log("Fetching buffets with allowsDogs or curbsidePickup structuredData...");
    
    // Query all buffets with their structuredData (no filter, we'll filter in code)
    const result = await db.query({
      buffets: {
        $: {
          limit: 100000,
        },
        structuredData: {
          $: {
            limit: 100000,
          }
        }
      }
    });

    const buffets = result.buffets || [];
    console.log(`Total buffets queried: ${buffets.length}`);
    
    // Count buffets that have at least one of these types
    const buffetsWithAmenities = buffets.filter(buffet => {
      if (!buffet.structuredData) return false;
      const structuredDataList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      
      return structuredDataList.some(sd => 
        sd && (sd.type === 'allowsDogs' || sd.type === 'curbsidePickup')
      );
    });

    // Get counts by type
    const allowsDogsCount = buffets.filter(buffet => {
      if (!buffet.structuredData) return false;
      const structuredDataList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      return structuredDataList.some(sd => sd && sd.type === 'allowsDogs');
    }).length;

    const curbsidePickupCount = buffets.filter(buffet => {
      if (!buffet.structuredData) return false;
      const structuredDataList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      return structuredDataList.some(sd => sd && sd.type === 'curbsidePickup');
    }).length;

    // Count buffets with both
    const bothCount = buffets.filter(buffet => {
      if (!buffet.structuredData) return false;
      const structuredDataList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      const hasAllowsDogs = structuredDataList.some(sd => sd && sd.type === 'allowsDogs');
      const hasCurbsidePickup = structuredDataList.some(sd => sd && sd.type === 'curbsidePickup');
      return hasAllowsDogs && hasCurbsidePickup;
    }).length;

    console.log(`\n=== Result ===`);
    console.log(`Total buffets with allowsDogs or curbsidePickup: ${buffetsWithAmenities.length}`);
    console.log(`\nBreakdown:`);
    console.log(`- Buffets with allowsDogs: ${allowsDogsCount}`);
    console.log(`- Buffets with curbsidePickup: ${curbsidePickupCount}`);
    console.log(`- Buffets with both: ${bothCount}`);
    console.log(`- Buffets with either (unique): ${buffetsWithAmenities.length}`);
    
    return buffetsWithAmenities.length;
  } catch (error) {
    console.error('Error querying buffets:', error);
    throw error;
  }
}

countAmenitiesDisplayedV2()
  .then((count) => {
    console.log(`\nTotal count: ${count}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
