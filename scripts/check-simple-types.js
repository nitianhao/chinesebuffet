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

const simpleTypes = [
  'goodForKids',
  'goodForGroups',
  'hasTv',
  'waiterService',
  'outdoorSeating',
  'wheelchairAccessible',
  'businessAcceptsApplePay',
  'genderNeutralRestrooms',
  'openToAll',
  'acceptsGooglePay'
];

async function checkSimpleTypes() {
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

    console.log('Checking simple types structure...\n');

    for (const type of simpleTypes) {
      try {
        const result = await db.query({
          structuredData: {
            $: {
              where: {
                type: type
              },
              limit: 5,
            }
          }
        });

        const records = result.structuredData || [];
        if (records.length > 0) {
          console.log(`${type}:`);
          const record = records[0];
          if (record.data) {
            try {
              const parsed = JSON.parse(record.data);
              console.log('  Structure:', JSON.stringify(parsed));
              console.log('  Keys:', Object.keys(parsed).join(', ') || '(no keys - likely boolean value)');
            } catch (e) {
              console.log('  Raw data:', record.data);
            }
          }
          console.log('');
        }
      } catch (error) {
        console.log(`${type}: ERROR - ${error.message}\n`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSimpleTypes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
