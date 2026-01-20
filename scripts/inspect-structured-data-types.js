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

// Try to load schema
let schema;
try {
  try {
    require('ts-node/register');
  } catch (e) {
    // ts-node not available
  }
  
  try {
    schema = require('../src/instant.schema.ts');
  } catch (e) {
    schema = require('../src/instant.schema');
  }
  
  if (schema && (schema.default || schema)) {
    schema = schema.default || schema;
  }
} catch (e) {
  console.error('Error loading schema:', e.message);
  process.exit(1);
}

async function inspectTypes() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const typesToInspect = ['offerings', 'diningOptions', 'popularFor', 'amenities', 'highlights'];

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema,
    });

    for (const type of typesToInspect) {
      console.log('\n' + '='.repeat(80));
      console.log(`Type: ${type}`);
      console.log('='.repeat(80));
      
      // Fetch a few sample records of this type
      const result = await db.query({
        structuredData: {
          $: {
            where: { type: type },
            limit: 5,
          }
        }
      });

      const records = result.structuredData || [];
      console.log(`Found ${records.length} sample record(s)\n`);

      if (records.length === 0) {
        console.log('No records found for this type.\n');
        continue;
      }

      // Show each sample record
      records.forEach((record, index) => {
        console.log(`\n--- Sample ${index + 1} ---`);
        
        if (record.data) {
          try {
            const parsedData = JSON.parse(record.data);
            console.log('Parsed data structure:');
            console.log(JSON.stringify(parsedData, null, 2));
            
            // Show data type information
            console.log('\nData type analysis:');
            if (Array.isArray(parsedData)) {
              console.log(`  - Type: Array with ${parsedData.length} items`);
              if (parsedData.length > 0) {
                console.log(`  - First item type: ${typeof parsedData[0]}`);
                if (typeof parsedData[0] === 'object' && parsedData[0] !== null) {
                  console.log(`  - First item keys: ${Object.keys(parsedData[0]).join(', ')}`);
                }
              }
            } else if (typeof parsedData === 'object' && parsedData !== null) {
              console.log(`  - Type: Object`);
              console.log(`  - Keys: ${Object.keys(parsedData).join(', ')}`);
              console.log(`  - Total keys: ${Object.keys(parsedData).length}`);
              
              // Show sample values for each key
              Object.entries(parsedData).slice(0, 10).forEach(([key, value]) => {
                const valueType = Array.isArray(value) ? 'array' : typeof value;
                const valuePreview = Array.isArray(value) 
                  ? `[${value.length} items]`
                  : typeof value === 'object' && value !== null
                  ? `{${Object.keys(value).length} keys}`
                  : String(value).substring(0, 50);
                console.log(`    - ${key}: ${valueType} = ${valuePreview}`);
              });
            } else {
              console.log(`  - Type: ${typeof parsedData}`);
              console.log(`  - Value: ${String(parsedData).substring(0, 100)}`);
            }
          } catch (e) {
            console.log('Raw data (not valid JSON):');
            console.log(record.data.substring(0, 500));
          }
        } else {
          console.log('No data field in record');
        }
      });

      // Get all unique keys/structures across all records of this type
      console.log(`\n--- Summary for ${type} ---`);
      const allKeys = new Set();
      const allStructures = [];
      
      const allRecords = await db.query({
        structuredData: {
          $: {
            where: { type: type },
            limit: 100, // Sample more records for better analysis
          }
        }
      });

      for (const record of (allRecords.structuredData || [])) {
        if (record.data) {
          try {
            const parsed = JSON.parse(record.data);
            if (Array.isArray(parsed)) {
              allStructures.push('array');
              parsed.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                  Object.keys(item).forEach(k => allKeys.add(k));
                }
              });
            } else if (typeof parsed === 'object' && parsed !== null) {
              allStructures.push('object');
              Object.keys(parsed).forEach(k => allKeys.add(k));
            } else {
              allStructures.push(typeof parsed);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      const structureCounts = {};
      allStructures.forEach(s => {
        structureCounts[s] = (structureCounts[s] || 0) + 1;
      });

      console.log(`Structure types found: ${JSON.stringify(structureCounts, null, 2)}`);
      console.log(`All unique keys found across records: ${Array.from(allKeys).sort().join(', ')}`);
    }

  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  inspectTypes()
    .then(() => {
      console.log('\n\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { inspectTypes };
