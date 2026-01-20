// Script to export all overpassPOIs data from buffets table to a JSON file

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

// Verify required environment variables
if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('❌ Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('   Please set it in your .env.local file or export it in your shell');
  process.exit(1);
}

// Initialize InstantDB (with fallback for appId)
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

async function exportOverpassPOIs() {
  console.log('🚀 Starting export of overpassPOIs data...\n');

  try {
    // Fetch all buffets in batches
    let allBuffets = [];
    let offset = 0;
    const fetchLimit = 1000;
    
    console.log('Step 1: Fetching all buffets...');
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: fetchLimit,
            offset: offset
          }
        }
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      console.log(`  Fetched ${allBuffets.length} buffets so far...`);
      
      if (buffets.length < fetchLimit) break;
      offset += fetchLimit;
    }

    console.log(`\nStep 2: Filtering buffets with overpassPOIs data...`);
    
    // Filter buffets that have overpassPOIs field with actual data
    const buffetsWithPOIs = allBuffets.filter(b => {
      return b.overpassPOIs && 
             typeof b.overpassPOIs === 'string' && 
             b.overpassPOIs.trim().length > 0;
    });

    console.log(`  ✅ Found ${buffetsWithPOIs.length} buffets with overpassPOIs data\n`);

    // Extract the data - create an array of objects with buffet ID and overpassPOIs
    const exportData = buffetsWithPOIs.map(buffet => {
      let parsedPOIs = null;
      try {
        parsedPOIs = JSON.parse(buffet.overpassPOIs);
      } catch (e) {
        console.warn(`  ⚠️  Warning: Could not parse overpassPOIs for buffet ${buffet.id}: ${e.message}`);
        return null;
      }

      return {
        buffetId: buffet.id,
        buffetName: buffet.name || 'Unknown',
        overpassPOIs: parsedPOIs
      };
    }).filter(item => item !== null);

    console.log(`Step 3: Writing to JSON file...`);
    
    // Write to JSON file in Example JSON folder using streaming to handle large files
    const outputPath = path.join(__dirname, '../Example JSON/overpassPOIs.json');
    const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8' });
    
    // Write opening bracket
    writeStream.write('[\n');
    
    // Calculate statistics while writing
    let totalPOIs = 0;
    
    // Write each item with proper JSON formatting
    exportData.forEach((item, index) => {
      // Calculate POIs for statistics
      if (Array.isArray(item.overpassPOIs)) {
        totalPOIs += item.overpassPOIs.length;
      } else if (item.overpassPOIs && typeof item.overpassPOIs === 'object') {
        const values = Object.values(item.overpassPOIs);
        if (Array.isArray(values[0])) {
          totalPOIs += values[0].length;
        }
      }
      
      // Write the item as JSON
      const jsonStr = JSON.stringify(item, null, 2);
      writeStream.write(jsonStr);
      
      // Add comma if not last item
      if (index < exportData.length - 1) {
        writeStream.write(',\n');
      } else {
        writeStream.write('\n');
      }
      
      // Progress indicator
      if ((index + 1) % 500 === 0) {
        console.log(`  Written ${index + 1}/${exportData.length} records...`);
      }
    });
    
    // Write closing bracket
    writeStream.write(']');
    writeStream.end();
    
    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`\n✅ Export complete!`);
    console.log(`   Total buffets with POIs: ${exportData.length}`);
    console.log(`   Output file: ${outputPath}`);
    console.log(`   Total POI records: ${totalPOIs}`);
    console.log(`   Average POIs per buffet: ${(totalPOIs / exportData.length).toFixed(2)}`);

  } catch (error) {
    console.error('\n❌ Error during export:');
    console.error(error);
    process.exit(1);
  }
}

exportOverpassPOIs();
