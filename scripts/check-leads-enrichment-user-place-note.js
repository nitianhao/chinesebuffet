// Script to check leadsEnrichment and userPlaceNote fields

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables
const envPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, '../env.local.txt'),
  path.join(process.cwd(), 'env.local.txt'),
];

for (const envPath of envPaths) {
  try {
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      break;
    }
  } catch (error) {
    // Continue
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const fieldsToCheck = ['leadsEnrichment', 'userPlaceNote'];

async function checkFields() {
  console.log(`Checking fields: ${fieldsToCheck.join(', ')}...\n`);

  try {
    console.log('Fetching all buffets...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          }
        }
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (allBuffets.length % 2000 === 0) {
        console.log(`  Fetched ${allBuffets.length} buffets...`);
      }
      
      if (buffets.length < limit) break;
      offset += limit;
    }

    console.log(`\nTotal buffets: ${allBuffets.length}\n`);

    // Analyze each field
    const fieldStats = {};
    
    fieldsToCheck.forEach(field => {
      fieldStats[field] = {
        appearsInRecords: 0,
        nonNull: 0,
        nonEmpty: 0,
        examples: []
      };
    });

    allBuffets.forEach(buffet => {
      fieldsToCheck.forEach(field => {
        if (field in buffet) {
          fieldStats[field].appearsInRecords++;
          if (buffet[field] !== null && buffet[field] !== undefined) {
            fieldStats[field].nonNull++;
            const value = buffet[field];
            let isEmpty = false;
            
            if (typeof value === 'string') {
              const trimmed = value.trim();
              // Check if it's not an empty string or the string "null"
              if (trimmed !== '' && trimmed !== 'null' && trimmed !== '[]' && trimmed !== '{}') {
                // For JSON strings (leadsEnrichment), try to parse and check if it's meaningful
                if (field === 'leadsEnrichment' && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
                  try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                      isEmpty = parsed.length === 0;
                    } else if (typeof parsed === 'object' && parsed !== null) {
                      isEmpty = Object.keys(parsed).length === 0;
                    }
                    if (!isEmpty) {
                      fieldStats[field].nonEmpty++;
                      if (fieldStats[field].examples.length < 5) {
                        fieldStats[field].examples.push({
                          buffetId: buffet.id,
                          buffetName: buffet.name || 'N/A',
                          rawValue: value,
                          parsedValue: parsed
                        });
                      }
                    }
                  } catch (e) {
                    // If it's not valid JSON but has content, count it
                    fieldStats[field].nonEmpty++;
                    if (fieldStats[field].examples.length < 5) {
                      fieldStats[field].examples.push({
                        buffetId: buffet.id,
                        buffetName: buffet.name || 'N/A',
                        rawValue: value,
                        parsedValue: null,
                        parseError: e.message
                      });
                    }
                  }
                } else {
                  // Non-JSON string with content (userPlaceNote or non-JSON leadsEnrichment)
                  isEmpty = false;
                  fieldStats[field].nonEmpty++;
                  if (fieldStats[field].examples.length < 5) {
                    fieldStats[field].examples.push({
                      buffetId: buffet.id,
                      buffetName: buffet.name || 'N/A',
                      rawValue: value,
                      parsedValue: null
                    });
                  }
                }
              }
            } else if (Array.isArray(value) && value.length > 0) {
              fieldStats[field].nonEmpty++;
              if (fieldStats[field].examples.length < 5) {
                fieldStats[field].examples.push({
                  buffetId: buffet.id,
                  buffetName: buffet.name || 'N/A',
                  rawValue: value,
                  parsedValue: value
                });
              }
            } else if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
              fieldStats[field].nonEmpty++;
              if (fieldStats[field].examples.length < 5) {
                fieldStats[field].examples.push({
                  buffetId: buffet.id,
                  buffetName: buffet.name || 'N/A',
                  rawValue: value,
                  parsedValue: value
                });
              }
            }
          }
        }
      });
    });

    // Display results for each field
    fieldsToCheck.forEach(field => {
      const stats = fieldStats[field];
      console.log('='.repeat(80));
      console.log(`${field} Field Analysis`);
      console.log('='.repeat(80));
      console.log(`Total records: ${allBuffets.length}`);
      console.log(`Field appears in records: ${stats.appearsInRecords}`);
      console.log(`Non-null values: ${stats.nonNull}`);
      console.log(`Non-empty values: ${stats.nonEmpty}`);
      console.log(`Percentage: ${((stats.nonEmpty / allBuffets.length) * 100).toFixed(2)}%`);
      
      if (stats.examples.length > 0) {
        console.log(`\nExample values (${stats.examples.length} examples):`);
        stats.examples.forEach((example, index) => {
          console.log(`\n  Example ${index + 1}:`);
          console.log(`    Buffet ID: ${example.buffetId}`);
          console.log(`    Buffet Name: ${example.buffetName}`);
          if (example.parseError) {
            console.log(`    Parse error: ${example.parseError}`);
            console.log(`    Raw value: ${JSON.stringify(example.rawValue).substring(0, 200)}${JSON.stringify(example.rawValue).length > 200 ? '...' : ''}`);
          } else if (example.parsedValue !== null) {
            const valueStr = JSON.stringify(example.parsedValue, null, 2);
            console.log(`    Parsed value: ${valueStr.substring(0, 500)}${valueStr.length > 500 ? '...' : ''}`);
          } else {
            const displayValue = typeof example.rawValue === 'string' 
              ? example.rawValue.substring(0, 200) 
              : JSON.stringify(example.rawValue).substring(0, 200);
            console.log(`    Raw value: ${displayValue}${(typeof example.rawValue === 'string' ? example.rawValue.length : JSON.stringify(example.rawValue).length) > 200 ? '...' : ''}`);
          }
        });
      } else {
        console.log('\n  No non-empty values found');
      }
      console.log('');
    });

    // Summary
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    fieldsToCheck.forEach(field => {
      const stats = fieldStats[field];
      if (stats.nonEmpty === 0) {
        console.log(`❌ ${field}: No values found - field is empty`);
      } else {
        console.log(`✓ ${field}: ${stats.nonEmpty} non-empty value(s)`);
      }
    });

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkFields()
  .then(() => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
