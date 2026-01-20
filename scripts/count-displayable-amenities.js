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

// Helper function to extract a value from the data structure (matching component logic)
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

async function countDisplayable() {
  try {
    console.log("Counting buffets that would display amenities section...\n");
    
    // Get all buffets with structuredData
    const result = await db.query({
      buffets: {
        $: { limit: 100000 },
        structuredData: {
          $: { limit: 100000 }
        }
      }
    });

    const buffets = result.buffets || [];
    console.log(`Total buffets queried: ${buffets.length}`);

    let displayableCount = 0;
    let allowsDogsCount = 0;
    let curbsidePickupCount = 0;
    let bothCount = 0;

    for (const buffet of buffets) {
      if (!buffet.structuredData) continue;
      
      // Process structuredData like the component does (from lib/data-instantdb.ts)
      const structuredDataList = Array.isArray(buffet.structuredData) 
        ? buffet.structuredData 
        : [buffet.structuredData];
      
      // Build amenities object like getBuffetNameBySlug does
      const amenities = {};
      
      for (const record of structuredDataList) {
        if (!record || !record.data) continue;
        
        try {
          const parsed = typeof record.data === 'string' ? JSON.parse(record.data) : record.data;
          const group = record.group || 'unknown';
          
          // Skip accessibility
          if (group === 'accessibility') continue;
          
          // List of amenity-related groups
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
              // Flatten nested data
              Object.assign(amenities[normalizedGroup], parsed);
            } else {
              amenities[normalizedGroup][record.type || 'unknown'] = parsed;
            }
          }
        } catch (e) {
          // Skip parse errors
        }
      }

      // Now check if allowsDogs or curbsidePickup exist (using component logic)
      const allowsDogsValue = extractValue(amenities, 'allowsDogs');
      const curbsidePickupValue = extractValue(amenities, 'curbsidePickup');

      if (allowsDogsValue !== null || curbsidePickupValue !== null) {
        displayableCount++;
        
        if (allowsDogsValue !== null) allowsDogsCount++;
        if (curbsidePickupValue !== null) curbsidePickupCount++;
        if (allowsDogsValue !== null && curbsidePickupValue !== null) bothCount++;
      }
    }

    console.log(`\n=== Final Result ===`);
    console.log(`Total buffets that would display amenities section: ${displayableCount}`);
    console.log(`\nBreakdown:`);
    console.log(`- Buffets with allowsDogs: ${allowsDogsCount}`);
    console.log(`- Buffets with curbsidePickup: ${curbsidePickupCount}`);
    console.log(`- Buffets with both: ${bothCount}`);
    console.log(`- Buffets with either (unique): ${displayableCount}`);

    return displayableCount;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

countDisplayable()
  .then((count) => {
    console.log(`\nTotal: ${count} buffets`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
