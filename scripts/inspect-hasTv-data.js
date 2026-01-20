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

async function inspectHasTv() {
  try {
    console.log("Inspecting hasTv data structure...\n");
    
    // Query structuredData with type = hasTv
    const result = await db.query({
      structuredData: {
        $: {
          where: { type: 'hasTv' },
          limit: 10
        }
      }
    });

    const records = result.structuredData || [];
    console.log(`Found ${records.length} hasTv records\n`);

    if (records.length > 0) {
      console.log("=== Sample hasTv records ===");
      for (let i = 0; i < Math.min(3, records.length); i++) {
        const record = records[i];
        console.log(`\n--- Record ${i + 1} ---`);
        console.log("ID:", record.id);
        console.log("Type:", record.type);
        console.log("Group:", record.group);
        console.log("Buffet ID:", record.buffet);
        console.log("Data (raw):", record.data);
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          console.log("Data (parsed):", JSON.stringify(parsed, null, 2));
          console.log("Data type:", typeof parsed);
          console.log("Is boolean:", typeof parsed === 'boolean');
        } catch (e) {
          console.log("Parse error:", e.message);
        }
      }

      // Now get a buffet with hasTv
      if (records[0].buffet) {
        console.log("\n\n=== Getting buffet with hasTv ===");
        const buffetResult = await db.query({
          buffets: {
            $: { where: { id: records[0].buffet } },
            structuredData: {
              $: { limit: 100 }
            }
          }
        });

        if (buffetResult.buffets && buffetResult.buffets.length > 0) {
          const buffet = buffetResult.buffets[0];
          console.log("Buffet ID:", buffet.id);
          console.log("Buffet Name:", buffet.name);
          
          // Simulate processing
          const sdList = Array.isArray(buffet.structuredData) 
            ? buffet.structuredData 
            : [buffet.structuredData];
          
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
              } else if (record.type === 'hasTv') {
                // hasTv might be in a different group or have null group
                const targetGroup = normalizedGroup || 'amenities';
                if (!amenities[targetGroup]) {
                  amenities[targetGroup] = {};
                }
                amenities[targetGroup]['hasTv'] = parsed;
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
                  const value = groupData[key];
                  if (value && typeof value === 'object' && !Array.isArray(value)) {
                    if (key in value) {
                      return value[key];
                    }
                    return value;
                  }
                  return value;
                }
              }
            }
            return null;
          }
          
          const hasTvValue = extractValue(amenities, 'hasTv');
          console.log("\n=== Extraction Result ===");
          console.log("hasTv value:", hasTvValue);
          console.log("hasTv type:", typeof hasTvValue);
        }
      }
    } else {
      console.log("No hasTv records found");
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

inspectHasTv()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
