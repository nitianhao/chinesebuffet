const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
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

async function checkFields() {
  try {
    console.log("Checking for allowsDogs and curbsidePickup data...\n");
    
    // Check if fields exist directly on buffets table
    console.log("1. Checking buffets table for direct fields...");
    const sampleBuffets = await db.query({
      buffets: {
        $: { limit: 10 }
      }
    });

    if (sampleBuffets.buffets && sampleBuffets.buffets.length > 0) {
      const sample = sampleBuffets.buffets[0];
      console.log("Sample buffet fields:", Object.keys(sample).filter(k => 
        k.toLowerCase().includes('dog') || 
        k.toLowerCase().includes('curbside') || 
        k.toLowerCase().includes('pickup')
      ));
      
      // Count buffets with these fields
      const allBuffets = await db.query({
        buffets: {
          $: { limit: 100000 }
        }
      });

      let allowsDogsCount = 0;
      let curbsidePickupCount = 0;

      allBuffets.buffets.forEach(buffet => {
        if (buffet.allowsDogs !== null && buffet.allowsDogs !== undefined) {
          allowsDogsCount++;
        }
        if (buffet.curbsidePickup !== null && buffet.curbsidePickup !== undefined) {
          curbsidePickupCount++;
        }
      });

      console.log(`  Buffets with allowsDogs field: ${allowsDogsCount}`);
      console.log(`  Buffets with curbsidePickup field: ${curbsidePickupCount}`);
    }

    // Check structuredData for these values in the data field
    console.log("\n2. Checking structuredData for these values in data field...");
    const allStructuredData = await db.query({
      structuredData: {
        $: { limit: 10000 }
      }
    });

    let allowsDogsInData = 0;
    let curbsidePickupInData = 0;
    const buffetIdsWithAllowsDogs = new Set();
    const buffetIdsWithCurbsidePickup = new Set();

    if (allStructuredData.structuredData) {
      for (const record of allStructuredData.structuredData) {
        if (!record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          
          // Check if allowsDogs is in the parsed data
          if (parsed && typeof parsed === 'object') {
            const hasAllowsDogs = 'allowsDogs' in parsed || 
              JSON.stringify(parsed).includes('allowsDogs');
            const hasCurbsidePickup = 'curbsidePickup' in parsed || 
              JSON.stringify(parsed).includes('curbsidePickup');
            
            if (hasAllowsDogs) {
              allowsDogsInData++;
              if (record.buffet) {
                buffetIdsWithAllowsDogs.add(record.buffet);
              }
            }
            if (hasCurbsidePickup) {
              curbsidePickupInData++;
              if (record.buffet) {
                buffetIdsWithCurbsidePickup.add(record.buffet);
              }
            }
          }
        } catch (e) {
          // Skip parse errors
        }
      }
    }

    console.log(`  structuredData records with allowsDogs in data: ${allowsDogsInData}`);
    console.log(`  structuredData records with curbsidePickup in data: ${curbsidePickupInData}`);
    console.log(`  Unique buffets with allowsDogs in structuredData: ${buffetIdsWithAllowsDogs.size}`);
    console.log(`  Unique buffets with curbsidePickup in structuredData: ${buffetIdsWithCurbsidePickup.size}`);

    // Now check buffets that would actually display these
    console.log("\n3. Checking buffets that would display amenities...");
    const buffetsWithStructuredData = await db.query({
      buffets: {
        $: { limit: 100000 },
        structuredData: {
          $: { limit: 100000 }
        }
      }
    });

    let displayableCount = 0;
    const displayableBuffetIds = new Set();

    if (buffetsWithStructuredData.buffets) {
      buffetsWithStructuredData.buffets.forEach(buffet => {
        if (!buffet.structuredData) return;
        
        const sdList = Array.isArray(buffet.structuredData) 
          ? buffet.structuredData 
          : [buffet.structuredData];
        
        let hasAllowsDogs = false;
        let hasCurbsidePickup = false;

        for (const sd of sdList) {
          if (!sd || !sd.data) continue;
          
          try {
            const parsed = typeof sd.data === 'string' ? JSON.parse(sd.data) : sd.data;
            
            if (parsed && typeof parsed === 'object') {
              // Check nested structures
              const dataStr = JSON.stringify(parsed).toLowerCase();
              if (dataStr.includes('allowsdogs') || dataStr.includes('allows_dogs')) {
                hasAllowsDogs = true;
              }
              if (dataStr.includes('curbsidepickup') || dataStr.includes('curbside_pickup')) {
                hasCurbsidePickup = true;
              }
            }
          } catch (e) {
            // Skip parse errors
          }
        }

        if (hasAllowsDogs || hasCurbsidePickup) {
          displayableCount++;
          displayableBuffetIds.add(buffet.id);
        }
      });
    }

    console.log(`\n=== Final Result ===`);
    console.log(`Total buffets that would display amenities section: ${displayableCount}`);
    console.log(`Unique buffet IDs: ${displayableBuffetIds.size}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkFields()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
