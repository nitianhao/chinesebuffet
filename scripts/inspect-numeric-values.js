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

const typesWithNumbers = [
  'noiseLevel',
  'alcohol',
  'offerings',
  'atmosphere',
  'diningOptions',
  'popularFor',
  'payments',
  'wiFi',
  'accessibility',
  'amenities',
  'highlights',
  'planning'
];

async function inspectNumericValues() {
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

    console.log('Inspecting numeric values and their meanings...\n');
    console.log('='.repeat(80));
    console.log('COPY-PASTE FORMAT (with value names):');
    console.log('='.repeat(80));
    console.log('');

    for (const type of typesWithNumbers) {
      try {
        const result = await db.query({
          structuredData: {
            $: {
              where: {
                type: type
              },
              limit: 200, // Get more samples to see all possible values
            }
          }
        });

        const records = result.structuredData || [];
        if (records.length === 0) {
          console.log(`${type}: (no records found)\n`);
          continue;
        }

        // Collect all unique values and their structures
        const valueMap = new Map();
        const allKeys = new Set();

        for (const record of records) {
          if (record.data) {
            try {
              const parsed = JSON.parse(record.data);
              
              // Handle different structures
              if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                // It's an object with keys
                Object.keys(parsed).forEach(key => {
                  allKeys.add(key);
                  const value = parsed[key];
                  if (!valueMap.has(key)) {
                    valueMap.set(key, new Set());
                  }
                  if (value !== null && value !== undefined) {
                    valueMap.get(key).add(String(value));
                  }
                });
              } else if (Array.isArray(parsed)) {
                // It's an array
                parsed.forEach((item, idx) => {
                  const key = String(idx);
                  allKeys.add(key);
                  if (!valueMap.has(key)) {
                    valueMap.set(key, new Set());
                  }
                  valueMap.get(key).add(String(item));
                });
              } else {
                // It's a primitive value
                allKeys.add('value');
                if (!valueMap.has('value')) {
                  valueMap.set('value', new Set());
                }
                valueMap.get('value').add(String(parsed));
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        const sortedKeys = Array.from(allKeys).sort((a, b) => {
          // Try to sort numerically if both are numbers
          const aNum = parseInt(a);
          const bNum = parseInt(b);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return aNum - bNum;
          }
          return a.localeCompare(b);
        });

        if (sortedKeys.length > 0) {
          console.log(`${type}:`);
          
          // Check if values are just numeric indices (0, 1, 2, etc.) - likely enum/array indices
          const isNumericIndex = sortedKeys.every(k => /^\d+$/.test(k));
          
          if (isNumericIndex) {
            // These are likely array indices, show the values
            const values = sortedKeys.map(key => {
              const valueSet = valueMap.get(key);
              const values = Array.from(valueSet || []).sort();
              return `${key} (${values.join(', ')})`;
            });
            console.log(values.join(', '));
          } else {
            // These are keys with values
            const keyValuePairs = sortedKeys.map(key => {
              const valueSet = valueMap.get(key);
              const values = Array.from(valueSet || []).sort();
              if (values.length > 0) {
                return `${key}: ${values.join('|')}`;
              }
              return key;
            });
            console.log(keyValuePairs.join(', '));
          }
        } else {
          console.log(`${type}: (no keys found)`);
        }
        console.log('');
      } catch (error) {
        console.log(`${type}: ERROR - ${error.message}\n`);
      }
    }

    // Also show some sample records to understand structure better
    console.log('\n' + '='.repeat(80));
    console.log('Sample records for context:');
    console.log('='.repeat(80));
    console.log('');

    for (const type of typesWithNumbers.slice(0, 3)) { // Show first 3 as examples
      try {
        const result = await db.query({
          structuredData: {
            $: {
              where: {
                type: type
              },
              limit: 3,
            }
          }
        });

        const records = result.structuredData || [];
        if (records.length > 0) {
          console.log(`${type} examples:`);
          records.forEach((record, idx) => {
            if (record.data) {
              try {
                const parsed = JSON.parse(record.data);
                console.log(`  Example ${idx + 1}:`, JSON.stringify(parsed));
              } catch (e) {
                console.log(`  Example ${idx + 1}:`, record.data);
              }
            }
          });
          console.log('');
        }
      } catch (error) {
        // Skip errors
      }
    }

  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

inspectNumericValues()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
