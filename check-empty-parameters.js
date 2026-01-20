// Script to find all parameters in the buffets table that have no values for any records

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPaths = [
  path.join(__dirname, '.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, 'env.local.txt'),
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
      break; // Stop after first successful load
    }
  } catch (error) {
    // Continue to next path
  }
}

async function findEmptyParameters() {
  const MIN_VALUES_THRESHOLD = 20;
  
  console.log('Connecting to InstantDB...');
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  try {
    console.log('Fetching all buffets...');
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    // Fetch all buffets in batches
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
      console.log(`  Fetched ${allBuffets.length} buffets so far...`);
      
      if (buffets.length < limit) break;
      offset += limit;
    }

    const buffets = allBuffets;
    console.log(`\nFound ${buffets.length} buffets total\n`);

    if (buffets.length === 0) {
      console.log('No buffets found in the database.');
      return;
    }

    // Collect all unique field names from ALL records (not just first one)
    const allFieldsSet = new Set();
    buffets.forEach(buffet => {
      Object.keys(buffet).forEach(field => allFieldsSet.add(field));
    });
    const allFields = Array.from(allFieldsSet);
    
    console.log(`Analyzing ${allFields.length} unique fields across all records...\n`);

    // Track which fields have values
    const fieldStats = {};
    
    // Initialize all fields
    allFields.forEach(field => {
      fieldStats[field] = {
        hasValue: false,
        nonNullCount: 0,
        nonEmptyCount: 0,
        totalRecords: buffets.length,
        appearsInRecords: 0 // Count how many records have this field (even if null/undefined)
      };
    });

    // Check each buffet for each field
    buffets.forEach((buffet, index) => {
      allFields.forEach(field => {
        // Check if field exists in this record (even if null/undefined)
        if (field in buffet) {
          fieldStats[field].appearsInRecords++;
        }
        
        const value = buffet[field];
        
        // Check if value exists and is not null/undefined
        if (value !== null && value !== undefined) {
          fieldStats[field].nonNullCount++;
          
          // Check if value is not empty
          let hasNonEmptyValue = false;
          
          if (typeof value === 'string') {
            const trimmed = value.trim();
            // Check if it's not an empty string or the string "null"
            if (trimmed !== '' && trimmed !== 'null' && trimmed !== '[]' && trimmed !== '{}') {
              // For JSON strings, try to parse and check if it's meaningful
              if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                  const parsed = JSON.parse(trimmed);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    hasNonEmptyValue = true;
                  } else if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
                    hasNonEmptyValue = true;
                  } else if (parsed !== null && parsed !== undefined) {
                    hasNonEmptyValue = true;
                  }
                } catch (e) {
                  // If it's not valid JSON but has content, count it
                  hasNonEmptyValue = true;
                }
              } else {
                hasNonEmptyValue = true;
              }
            }
          } else if (Array.isArray(value) && value.length > 0) {
            hasNonEmptyValue = true;
          } else if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
            hasNonEmptyValue = true;
          } else if (typeof value === 'number' && !isNaN(value)) {
            hasNonEmptyValue = true;
          } else if (typeof value === 'boolean') {
            hasNonEmptyValue = true;
          }
          
          if (hasNonEmptyValue) {
            fieldStats[field].nonEmptyCount++;
            fieldStats[field].hasValue = true;
          }
        }
      });

      if ((index + 1) % 1000 === 0) {
        console.log(`Processed ${index + 1}/${buffets.length} buffets...`);
      }
    });

    console.log('\n' + '='.repeat(80));
    console.log('RESULTS: Fields with NO values for ANY records');
    console.log('='.repeat(80) + '\n');

    // Find completely empty fields
    const emptyFields = [];
    const fieldsWithSomeValues = [];

    Object.entries(fieldStats).forEach(([field, stats]) => {
      if (!stats.hasValue) {
        emptyFields.push({
          field,
          nonNullCount: stats.nonNullCount,
          nonEmptyCount: stats.nonEmptyCount,
          totalRecords: stats.totalRecords,
          appearsInRecords: stats.appearsInRecords
        });
      } else {
        fieldsWithSomeValues.push({
          field,
          nonNullCount: stats.nonNullCount,
          nonEmptyCount: stats.nonEmptyCount,
          totalRecords: stats.totalRecords,
          appearsInRecords: stats.appearsInRecords,
          percentage: ((stats.nonEmptyCount / stats.totalRecords) * 100).toFixed(2) + '%'
        });
      }
    });

    if (emptyFields.length === 0) {
      console.log('✓ All fields have at least one value!');
    } else {
      console.log(`Found ${emptyFields.length} field(s) with NO values:\n`);
      emptyFields.forEach(({ field, nonNullCount, nonEmptyCount, totalRecords, appearsInRecords }) => {
        console.log(`  - ${field}`);
        console.log(`    Total records: ${totalRecords}`);
        console.log(`    Appears in records (even if null): ${appearsInRecords}`);
        console.log(`    Non-null count: ${nonNullCount}`);
        console.log(`    Non-empty count: ${nonEmptyCount}`);
        if (appearsInRecords === 0) {
          console.log(`    ⚠️  WARNING: Field does not appear in ANY record`);
        }
        console.log('');
      });
    }

    // Find fields with less than threshold values
    const fieldsWithFewValues = fieldsWithSomeValues.filter(
      ({ nonEmptyCount }) => nonEmptyCount > 0 && nonEmptyCount < MIN_VALUES_THRESHOLD
    );

    console.log('\n' + '='.repeat(80));
    console.log(`RESULTS: Fields with less than ${MIN_VALUES_THRESHOLD} values`);
    console.log('='.repeat(80) + '\n');

    if (fieldsWithFewValues.length === 0) {
      console.log(`✓ All fields with values have at least ${MIN_VALUES_THRESHOLD} non-empty values!`);
    } else {
      // Sort by count (ascending)
      fieldsWithFewValues.sort((a, b) => a.nonEmptyCount - b.nonEmptyCount);
      
      console.log(`Found ${fieldsWithFewValues.length} field(s) with less than ${MIN_VALUES_THRESHOLD} values:\n`);
      fieldsWithFewValues.forEach(({ field, nonEmptyCount, nonNullCount, totalRecords, appearsInRecords, percentage }) => {
        console.log(`  - ${field}`);
        console.log(`    Non-empty count: ${nonEmptyCount}/${totalRecords} (${percentage})`);
        console.log(`    Non-null count: ${nonNullCount}`);
        console.log(`    Appears in records: ${appearsInRecords}`);
        console.log('');
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('Fields with SOME values (for reference)');
    console.log('='.repeat(80) + '\n');

    // Sort by percentage
    fieldsWithSomeValues.sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));

    console.log(`Found ${fieldsWithSomeValues.length} field(s) with at least some values:\n`);
    console.log('Top 10 most populated fields:');
    fieldsWithSomeValues.slice(0, 10).forEach(({ field, nonEmptyCount, totalRecords, percentage }) => {
      console.log(`  - ${field}: ${nonEmptyCount}/${totalRecords} (${percentage})`);
    });

    if (fieldsWithSomeValues.length > 10) {
      console.log(`\n... and ${fieldsWithSomeValues.length - 10} more fields with values\n`);
    }

    // Show least populated fields (even if above threshold) for reference
    console.log('\n' + '='.repeat(80));
    console.log('Least populated fields (for reference)');
    console.log('='.repeat(80) + '\n');

    // Sort by count (ascending)
    const leastPopulated = [...fieldsWithSomeValues].sort((a, b) => a.nonEmptyCount - b.nonEmptyCount);
    
    console.log('Bottom 15 least populated fields:');
    leastPopulated.slice(0, 15).forEach(({ field, nonEmptyCount, totalRecords, percentage }) => {
      console.log(`  - ${field}: ${nonEmptyCount}/${totalRecords} (${percentage})`);
    });

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total fields analyzed: ${allFields.length}`);
    console.log(`Fields with NO values: ${emptyFields.length}`);
    console.log(`Fields with < ${MIN_VALUES_THRESHOLD} values: ${fieldsWithFewValues.length}`);
    console.log(`Fields with SOME values: ${fieldsWithSomeValues.length}`);
    console.log(`Total records: ${buffets.length}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

findEmptyParameters()
  .then(() => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
