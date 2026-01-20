const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

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
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

async function checkLinking() {
  try {
    // First, check how many structuredData records exist with these types
    console.log("Checking structuredData records...");
    
    const allowsDogsResult = await db.query({
      structuredData: {
        $: {
          where: { type: 'allowsDogs' },
          limit: 10,
        }
      }
    });

    const curbsidePickupResult = await db.query({
      structuredData: {
        $: {
          where: { type: 'curbsidePickup' },
          limit: 10,
        }
      }
    });

    console.log(`\nSample allowsDogs records: ${allowsDogsResult.structuredData?.length || 0}`);
    if (allowsDogsResult.structuredData && allowsDogsResult.structuredData.length > 0) {
      console.log('Sample record:', JSON.stringify(allowsDogsResult.structuredData[0], null, 2));
    }

    console.log(`\nSample curbsidePickup records: ${curbsidePickupResult.structuredData?.length || 0}`);
    if (curbsidePickupResult.structuredData && curbsidePickupResult.structuredData.length > 0) {
      console.log('Sample record:', JSON.stringify(curbsidePickupResult.structuredData[0], null, 2));
    }

    // Now check a sample buffet with structuredData
    console.log("\n\nChecking sample buffet with structuredData...");
    const buffetResult = await db.query({
      buffets: {
        $: {
          limit: 5,
        },
        structuredData: {
          $: {
            limit: 10,
          }
        }
      }
    });

    if (buffetResult.buffets && buffetResult.buffets.length > 0) {
      const sampleBuffet = buffetResult.buffets[0];
      console.log(`\nSample buffet ID: ${sampleBuffet.id}`);
      console.log(`Sample buffet name: ${sampleBuffet.name}`);
      console.log(`Has structuredData: ${!!sampleBuffet.structuredData}`);
      console.log(`structuredData type: ${Array.isArray(sampleBuffet.structuredData) ? 'array' : typeof sampleBuffet.structuredData}`);
      
      if (sampleBuffet.structuredData) {
        const sdList = Array.isArray(sampleBuffet.structuredData) 
          ? sampleBuffet.structuredData 
          : [sampleBuffet.structuredData];
        console.log(`Number of structuredData records: ${sdList.length}`);
        
        if (sdList.length > 0) {
          console.log('\nSample structuredData record:');
          console.log(JSON.stringify(sdList[0], null, 2));
          
          // Check for our types
          const hasAllowsDogs = sdList.some(sd => sd && sd.type === 'allowsDogs');
          const hasCurbsidePickup = sdList.some(sd => sd && sd.type === 'curbsidePickup');
          console.log(`\nHas allowsDogs: ${hasAllowsDogs}`);
          console.log(`Has curbsidePickup: ${hasCurbsidePickup}`);
        }
      }
    }

    // Now count properly by checking all structuredData and finding linked buffets
    console.log("\n\nCounting buffets with these amenities...");
    
    // Get all structuredData of these types
    const allAllowsDogs = await db.query({
      structuredData: {
        $: {
          where: { type: 'allowsDogs' },
          limit: 100000,
        }
      }
    });

    const allCurbsidePickup = await db.query({
      structuredData: {
        $: {
          where: { type: 'curbsidePickup' },
          limit: 100000,
        }
      }
    });

    const allowsDogsIds = new Set((allAllowsDogs.structuredData || []).map(sd => sd.id));
    const curbsidePickupIds = new Set((allCurbsidePickup.structuredData || []).map(sd => sd.id));

    console.log(`Total allowsDogs records: ${allowsDogsIds.size}`);
    console.log(`Total curbsidePickup records: ${curbsidePickupIds.size}`);

    // Now query all buffets and check their structuredData
    const allBuffets = await db.query({
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

    const buffets = allBuffets.buffets || [];
    const buffetIds = new Set();

    buffets.forEach(buffet => {
      if (!buffet.structuredData) return;
      
      const sdList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      
      const hasAllowsDogs = sdList.some(sd => allowsDogsIds.has(sd.id));
      const hasCurbsidePickup = sdList.some(sd => curbsidePickupIds.has(sd.id));
      
      if (hasAllowsDogs || hasCurbsidePickup) {
        buffetIds.add(buffet.id);
      }
    });

    console.log(`\n=== Final Result ===`);
    console.log(`Total buffets with allowsDogs or curbsidePickup: ${buffetIds.size}`);
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkLinking()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
