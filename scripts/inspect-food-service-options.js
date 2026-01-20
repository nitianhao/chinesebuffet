const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

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
        process.env[key] = value;
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

async function inspectFoodServiceOptions() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('INSTANT_ADMIN_TOKEN is required');
    process.exit(1);
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Fetching foodServiceOptions records...');
    
    // Fetch foodServiceOptions records (limit to a sample)
    const result = await db.query({
      structuredData: {
        $: {
          where: {
            type: 'foodServiceOptions'
          },
          limit: 100, // Sample 100 records
        }
      }
    });

    const records = result.structuredData || [];
    console.log(`Found ${records.length} foodServiceOptions records (sampling first 100)\n`);

    // Collect all unique values/keys
    const allKeys = new Set();
    const valueExamples = {};
    const valueCounts = {};

    for (const record of records) {
      if (record.data) {
        try {
          const parsedData = JSON.parse(record.data);
          const keys = Object.keys(parsedData);
          
          keys.forEach(key => {
            allKeys.add(key);
            const value = parsedData[key];
            
            // Track value examples
            if (!valueExamples[key]) {
              valueExamples[key] = value;
            }
            
            // Count value types
            const valueType = typeof value;
            const valueKey = `${key}_${valueType}`;
            if (!valueCounts[valueKey]) {
              valueCounts[valueKey] = { key, type: valueType, count: 0, example: value };
            }
            valueCounts[valueKey].count++;
          });
        } catch (e) {
          console.warn('Failed to parse JSON for record:', record.id);
        }
      }
    }

    console.log('=== All Keys Found ===');
    const sortedKeys = Array.from(allKeys).sort();
    sortedKeys.forEach(key => {
      console.log(`- ${key}: ${typeof valueExamples[key]} = ${JSON.stringify(valueExamples[key])}`);
    });

    console.log('\n=== Value Statistics ===');
    Object.values(valueCounts)
      .sort((a, b) => b.count - a.count)
      .forEach(({ key, type, count, example }) => {
        console.log(`${key} (${type}): ${count} occurrences, example: ${JSON.stringify(example)}`);
      });

    // Show a few full examples
    console.log('\n=== Sample Records (first 5) ===');
    records.slice(0, 5).forEach((record, idx) => {
      console.log(`\nRecord ${idx + 1}:`);
      if (record.data) {
        try {
          const parsed = JSON.parse(record.data);
          console.log(JSON.stringify(parsed, null, 2));
        } catch (e) {
          console.log('Raw data:', record.data);
        }
      }
    });

  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

inspectFoodServiceOptions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
