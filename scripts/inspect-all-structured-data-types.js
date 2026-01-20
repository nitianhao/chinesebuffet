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

const typesToInspect = [
  'allowsDogs',
  'curbsidePickup',
  'businessAcceptsCreditCards',
  'noiseLevel',
  'goodForKids',
  'goodForGroups',
  'hasTv',
  'bikeParking',
  'alcohol',
  'waiterService',
  'offerings',
  'atmosphere',
  'diningOptions',
  'popularFor',
  'payments',
  'wiFi',
  'accessibility',
  'amenities',
  'outdoorSeating',
  'wheelchairAccessible',
  'highlights',
  'planning',
  'businessAcceptsApplePay',
  'genderNeutralRestrooms',
  'openToAll',
  'acceptsGooglePay'
];

async function inspectAllTypes() {
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

    console.log('Inspecting all structured data types...\n');
    console.log('='.repeat(80));
    console.log('COPY-PASTE FORMAT (one line per type):');
    console.log('='.repeat(80));
    console.log('');

    for (const type of typesToInspect) {
      try {
        const result = await db.query({
          structuredData: {
            $: {
              where: {
                type: type
              },
              limit: 50, // Sample 50 records
            }
          }
        });

        const records = result.structuredData || [];
        if (records.length === 0) {
          console.log(`${type}: (no records found)`);
          continue;
        }

        // Collect all unique keys
        const allKeys = new Set();

        for (const record of records) {
          if (record.data) {
            try {
              const parsedData = JSON.parse(record.data);
              const keys = Object.keys(parsedData);
              keys.forEach(key => allKeys.add(key));
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        const sortedKeys = Array.from(allKeys).sort();
        if (sortedKeys.length > 0) {
          console.log(`${type}:`);
          console.log(sortedKeys.join(', '));
        } else {
          console.log(`${type}: (no keys found)`);
        }
        console.log('');
      } catch (error) {
        console.log(`${type}: ERROR - ${error.message}`);
        console.log('');
      }
    }

  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

inspectAllTypes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
