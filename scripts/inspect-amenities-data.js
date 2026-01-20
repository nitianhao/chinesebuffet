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

async function inspectData() {
  try {
    console.log("Inspecting amenities data structure...\n");
    
    // Get a buffet with structuredData that contains allowsDogs or curbsidePickup
    const result = await db.query({
      buffets: {
        $: { limit: 100 },
        structuredData: {
          $: { limit: 100 }
        }
      }
    });

    const buffets = result.buffets || [];
    
    // Find a buffet with allowsDogs or curbsidePickup in structuredData
    let foundBuffet = null;
    
    for (const buffet of buffets) {
      if (!buffet.structuredData) continue;
      
      const sdList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      
      for (const record of sdList) {
        if (!record || !record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          const dataStr = JSON.stringify(parsed).toLowerCase();
          
          if (dataStr.includes('allowsdogs') || dataStr.includes('curbsidepickup')) {
            foundBuffet = buffet;
            break;
          }
        } catch (e) {
          // Skip
        }
      }
      
      if (foundBuffet) break;
    }

    if (!foundBuffet) {
      console.log("No buffet found with allowsDogs or curbsidePickup. Checking all structuredData...");
      
      // Query structuredData directly
      const sdResult = await db.query({
        structuredData: {
          $: { limit: 1000 }
        }
      });

      for (const record of sdResult.structuredData || []) {
        if (!record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          const dataStr = JSON.stringify(parsed).toLowerCase();
          
          if (dataStr.includes('allowsdogs') || dataStr.includes('curbsidepickup')) {
            console.log("\n=== Found structuredData record ===");
            console.log("Record ID:", record.id);
            console.log("Type:", record.type);
            console.log("Group:", record.group);
            console.log("Buffet ID:", record.buffet);
            console.log("\nParsed data:");
            console.log(JSON.stringify(parsed, null, 2));
            
            // Now get the buffet
            const buffetResult = await db.query({
              buffets: {
                $: { where: { id: record.buffet } },
                structuredData: {
                  $: { limit: 100 }
                }
              }
            });
            
            if (buffetResult.buffets && buffetResult.buffets.length > 0) {
              foundBuffet = buffetResult.buffets[0];
              break;
            }
          }
        } catch (e) {
          // Skip
        }
      }
    }

    if (foundBuffet) {
      console.log("\n=== Found Buffet ===");
      console.log("Buffet ID:", foundBuffet.id);
      console.log("Buffet Name:", foundBuffet.name);
      console.log("\n=== All structuredData for this buffet ===");
      
      const sdList = Array.isArray(foundBuffet.structuredData) 
        ? foundBuffet.structuredData 
        : [foundBuffet.structuredData];
      
      console.log(`Total structuredData records: ${sdList.length}\n`);
      
      for (let i = 0; i < sdList.length; i++) {
        const record = sdList[i];
        console.log(`\n--- Record ${i + 1} ---`);
        console.log("ID:", record.id);
        console.log("Type:", record.type);
        console.log("Group:", record.group);
        console.log("Data (raw):", record.data);
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          console.log("Data (parsed):", JSON.stringify(parsed, null, 2));
          
          // Check for our keys
          if (parsed && typeof parsed === 'object') {
            const hasAllowsDogs = 'allowsDogs' in parsed || JSON.stringify(parsed).includes('allowsDogs');
            const hasCurbsidePickup = 'curbsidePickup' in parsed || JSON.stringify(parsed).includes('curbsidePickup');
            console.log("Has allowsDogs:", hasAllowsDogs);
            console.log("Has curbsidePickup:", hasCurbsidePickup);
          }
        } catch (e) {
          console.log("Parse error:", e.message);
        }
      }
      
      // Now simulate what getBuffetNameBySlug does
      console.log("\n=== Simulating getBuffetNameBySlug processing ===");
      let amenities = {};
      
      for (const record of sdList) {
        if (!record || !record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          const group = record.group || 'unknown';
          
          if (group === 'accessibility') continue;
          
          const amenityGroups = [
            'amenities', 'service options', 'food options', 'parking', 
            'payments', 'atmosphere', 'highlights', 'offerings', 
            'food and drink', 'planning'
          ];
          
          const normalizedGroup = group ? group.toLowerCase() : null;
          
          if (normalizedGroup && amenityGroups.includes(normalizedGroup)) {
            if (!amenities[normalizedGroup]) {
              amenities[normalizedGroup] = {};
            }
            
            if (typeof parsed === 'object' && parsed !== null) {
              Object.assign(amenities[normalizedGroup], parsed);
            } else {
              amenities[normalizedGroup][record.type || 'unknown'] = parsed;
            }
          }
        } catch (e) {
          // Skip
        }
      }
      
      console.log("\nFinal amenities object:");
      console.log(JSON.stringify(amenities, null, 2));
      
      // Check extraction
      function extractValue(data, key) {
        for (const [groupKey, groupData] of Object.entries(data)) {
          if (groupData && typeof groupData === 'object' && groupData !== null) {
            if (key in groupData) {
              return groupData[key];
            }
          }
        }
        return null;
      }
      
      const allowsDogsValue = extractValue(amenities, 'allowsDogs');
      const curbsidePickupValue = extractValue(amenities, 'curbsidePickup');
      
      console.log("\n=== Extraction Results ===");
      console.log("allowsDogs value:", allowsDogsValue);
      console.log("curbsidePickup value:", curbsidePickupValue);
      
    } else {
      console.log("Could not find a buffet with allowsDogs or curbsidePickup data");
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

inspectData()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
