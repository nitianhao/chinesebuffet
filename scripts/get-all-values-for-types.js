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

async function getAllValues() {
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
      
      // Fetch all records of this type
      const result = await db.query({
        structuredData: {
          $: {
            where: { type: type },
            limit: 10000,
          }
        }
      });

      const records = result.structuredData || [];
      console.log(`Total records: ${records.length}\n`);

      // Collect all unique values
      const allValues = new Set();
      const valueCounts = {};

      for (const record of records) {
        if (record.data) {
          try {
            const parsedData = JSON.parse(record.data);
            if (Array.isArray(parsedData)) {
              parsedData.forEach(value => {
                if (typeof value === 'string' && value.trim()) {
                  allValues.add(value);
                  valueCounts[value] = (valueCounts[value] || 0) + 1;
                }
              });
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      // Sort by frequency
      const sortedValues = Array.from(allValues).sort((a, b) => {
        return valueCounts[b] - valueCounts[a];
      });

      console.log(`Total unique values: ${sortedValues.length}\n`);
      console.log('All unique values (sorted by frequency):');
      sortedValues.forEach((value, index) => {
        const count = valueCounts[value];
        const percentage = ((count / records.length) * 100).toFixed(1);
        console.log(`  ${index + 1}. "${value}" - appears in ${count} records (${percentage}%)`);
      });
    }

  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  getAllValues()
    .then(() => {
      console.log('\n\nDone!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { getAllValues };
