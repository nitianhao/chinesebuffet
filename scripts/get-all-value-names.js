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

async function getAllValueNames() {
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

    console.log('='.repeat(80));
    console.log('ALL TYPES WITH VALUE NAMES (COPY-PASTE FORMAT):');
    console.log('='.repeat(80));
    console.log('');

    // Simple boolean types
    const simpleTypes = {
      'foodServiceOptions': ['servesBreakfast', 'servesLunch', 'servesDinner', 'servesBrunch', 'servesBeer', 'servesWine', 'servesVegetarianFood', 'servesDessert', 'servesCocktails', 'servesCoffee', 'menuForChildren'],
      'serviceOptions': ['delivery', 'dineIn', 'reservable', 'takeout'],
      'businessParking': ['garage', 'lot', 'street', 'valet', 'validated'],
      'allowsDogs': ['allowsDogs'],
      'curbsidePickup': ['curbsidePickup'],
      'businessAcceptsCreditCards': ['businessAcceptsCreditCards'],
      'bikeParking': ['bikeParking'],
      'goodForKids': ['(boolean value)'],
      'goodForGroups': ['(boolean value)'],
      'hasTv': ['(boolean value)'],
      'waiterService': ['(boolean value)'],
      'outdoorSeating': ['(boolean value)'],
      'wheelchairAccessible': ['(boolean value)'],
      'businessAcceptsApplePay': ['(boolean value)'],
      'genderNeutralRestrooms': ['(boolean value)'],
      'openToAll': ['(boolean value)'],
      'acceptsGooglePay': ['(boolean value)']
    };

    // Print simple types
    Object.entries(simpleTypes).forEach(([type, values]) => {
      console.log(`${type}:`);
      console.log(values.join(', '));
      console.log('');
    });

    // Complex types that need inspection
    const complexTypes = ['noiseLevel', 'alcohol', 'offerings', 'atmosphere', 'diningOptions', 'popularFor', 'payments', 'wiFi', 'accessibility', 'amenities', 'highlights', 'planning'];

    for (const type of complexTypes) {
      try {
        const result = await db.query({
          structuredData: {
            $: {
              where: {
                type: type
              },
              limit: 500, // Get more samples
            }
          }
        });

        const records = result.structuredData || [];
        if (records.length === 0) {
          console.log(`${type}: (no records found)\n`);
          continue;
        }

        // Collect all unique string values
        const allValues = new Set();

        for (const record of records) {
          if (record.data) {
            try {
              const parsed = JSON.parse(record.data);
              
              if (typeof parsed === 'string') {
                // Direct string value
                allValues.add(parsed);
              } else if (Array.isArray(parsed)) {
                // Array of strings
                parsed.forEach(item => {
                  if (typeof item === 'string') {
                    allValues.add(item);
                  }
                });
              } else if (typeof parsed === 'object' && parsed !== null) {
                // Object - collect all string values
                Object.values(parsed).forEach(value => {
                  if (typeof value === 'string') {
                    allValues.add(value);
                  } else if (Array.isArray(value)) {
                    value.forEach(item => {
                      if (typeof item === 'string') {
                        allValues.add(item);
                      }
                    });
                  }
                });
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        const sortedValues = Array.from(allValues).sort();
        if (sortedValues.length > 0) {
          console.log(`${type}:`);
          console.log(sortedValues.join(', '));
        } else {
          console.log(`${type}: (no string values found)`);
        }
        console.log('');
      } catch (error) {
        console.log(`${type}: ERROR - ${error.message}\n`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

getAllValueNames()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
