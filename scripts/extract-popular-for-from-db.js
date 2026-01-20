// Script to extract "Popular for" from additionalInfo field in database
// and populate the popularFor field
// Run with: node scripts/extract-popular-for-from-db.js [--all]
// Without --all flag, processes only 10 records for testing

const { init } = require('@instantdb/admin');
const path = require('path');
const fs = require('fs');
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
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Please set it in your .env.local file or export it:');
  console.error('  export INSTANT_ADMIN_TOKEN="your-token-here"');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const migrateAll = process.argv.includes('--all');
const testLimit = 10;

/**
 * Extract "Popular for" values from additionalInfo
 * @param {string|object} additionalInfo - The additionalInfo JSON string or object
 * @returns {string|null} - Comma-separated list of popular items, or null if not found
 */
function extractPopularFor(additionalInfo) {
  if (!additionalInfo) {
    return null;
  }

  let infoObj;
  
  // If it's a string, try to parse it
  if (typeof additionalInfo === 'string') {
    try {
      // Check if it's already a valid JSON string
      if (additionalInfo.trim() === '' || additionalInfo.trim() === 'null') {
        return null;
      }
      infoObj = JSON.parse(additionalInfo);
    } catch (e) {
      // If parsing fails, return null
      return null;
    }
  } else if (typeof additionalInfo === 'object') {
    infoObj = additionalInfo;
  } else {
    return null;
  }

  // Check if "Popular for" exists in the object
  if (!infoObj || typeof infoObj !== 'object') {
    return null;
  }

  // Try different case variations of the key
  const popularForKey = Object.keys(infoObj).find(
    key => key.toLowerCase() === 'popular for' || key === 'Popular for' || key === 'popularFor'
  );

  if (!popularForKey) {
    return null;
  }

  const popularForArray = infoObj[popularForKey];

  if (!Array.isArray(popularForArray) || popularForArray.length === 0) {
    return null;
  }

  // Extract keys from objects like [{ "Lunch": true }, { "Dinner": true }]
  const popularItems = [];
  
  for (const item of popularForArray) {
    if (typeof item === 'object' && item !== null) {
      // Get the key(s) from the object
      const keys = Object.keys(item);
      // Only include items that are true (or truthy)
      for (const key of keys) {
        if (item[key] === true || item[key]) {
          popularItems.push(key);
        }
      }
    } else if (typeof item === 'string') {
      // If it's already a string, just add it
      popularItems.push(item);
    }
  }

  if (popularItems.length === 0) {
    return null;
  }

  // Return as comma-separated string
  return popularItems.join(', ');
}

async function extractPopularForFromDB() {
  console.log('='.repeat(80));
  console.log('Extracting "Popular for" from additionalInfo field in database');
  console.log('='.repeat(80));
  console.log(`Mode: ${migrateAll ? 'ALL records' : `TEST (${testLimit} records only)`}\n`);

  try {
    console.log('Fetching buffets with additionalInfo from database...');
    
    // Fetch all buffets in batches
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      try {
        const result = await db.query({
          buffets: {
            $: {
              limit: limit,
              offset: offset,
              // Filter for buffets that have additionalInfo
              where: {
                additionalInfo: { $exists: true, $ne: null }
              }
            }
          }
        });
        
        const buffets = result.buffets || [];
        if (buffets.length === 0) break;
        
        // Filter buffets that actually have non-empty additionalInfo
        const buffetsWithInfo = buffets.filter(b => {
          const info = b.additionalInfo;
          return info && 
                 typeof info === 'string' && 
                 info.trim() !== '' && 
                 info.trim() !== 'null';
        });
        
        allBuffets = allBuffets.concat(buffetsWithInfo);
        console.log(`  Fetched ${buffetsWithInfo.length} buffets with additionalInfo (total: ${allBuffets.length})...`);
        
        if (buffets.length < limit) break;
        offset += limit;
        
        // Stop early if we're in test mode and have enough
        if (!migrateAll && allBuffets.length >= testLimit * 2) {
          break;
        }
      } catch (error) {
        console.error(`  Error fetching batch at offset ${offset}:`, error.message);
        // Try without where clause if $exists doesn't work
        if (error.message.includes('$exists')) {
          const result = await db.query({
            buffets: {
              $: {
                limit: limit,
                offset: offset
              }
            }
          });
          
          const buffets = result.buffets || [];
          const buffetsWithInfo = buffets.filter(b => {
            const info = b.additionalInfo;
            return info && 
                   typeof info === 'string' && 
                   info.trim() !== '' && 
                   info.trim() !== 'null';
          });
          
          allBuffets = allBuffets.concat(buffetsWithInfo);
          console.log(`  Fetched ${buffetsWithInfo.length} buffets with additionalInfo (total: ${allBuffets.length})...`);
          
          if (buffets.length < limit) break;
          offset += limit;
          
          if (!migrateAll && allBuffets.length >= testLimit * 2) {
            break;
          }
        } else {
          throw error;
        }
      }
    }

    console.log(`\n✓ Found ${allBuffets.length} buffets with additionalInfo data\n`);

    if (allBuffets.length === 0) {
      console.log('No buffets with additionalInfo found in database.');
      console.log('Try syncing additionalInfo from JSON first:');
      console.log('  node scripts/sync-additional-info-from-json.js --all\n');
      return;
    }

    // Limit records for testing
    const recordsToProcess = migrateAll 
      ? allBuffets 
      : allBuffets.slice(0, testLimit);

    console.log(`Processing ${recordsToProcess.length} records...\n`);

    // Process each buffet and extract "Popular for"
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let foundWithPopularFor = 0;
    const updates = [];

    for (const buffet of recordsToProcess) {
      try {
        const additionalInfo = buffet.additionalInfo;
        const popularFor = extractPopularFor(additionalInfo);

        if (!popularFor || popularFor.trim() === '') {
          skipped++;
          continue;
        }

        foundWithPopularFor++;

        // Check if it's already set and different
        const currentPopularFor = buffet.popularFor || null;
        if (currentPopularFor === popularFor) {
          console.log(`⏭ Skipping buffet "${buffet.name}" - already set to same value`);
          skipped++;
          continue;
        }

        updates.push({
          buffetId: buffet.id,
          buffetName: buffet.name,
          placeId: buffet.placeId || 'N/A',
          popularFor: popularFor.trim(),
          oldValue: currentPopularFor
        });

      } catch (error) {
        console.error(`✗ Error processing buffet "${buffet.name}":`, error.message);
        errors++;
      }
    }

    console.log(`\n✓ Found ${foundWithPopularFor} records with "Popular for" data`);
    console.log(`✓ Prepared ${updates.length} updates. Applying to database...\n`);

    if (updates.length === 0) {
      console.log('No updates to apply. All records already have the correct popularFor value or have no "Popular for" data.\n');
      return;
    }

    // Apply updates in batches
    const updateBatchSize = 50;
    for (let i = 0; i < updates.length; i += updateBatchSize) {
      const batch = updates.slice(i, i + updateBatchSize);
      
      try {
        const transactions = batch.map(update => 
          db.tx.buffets[update.buffetId].update({
            popularFor: update.popularFor
          })
        );

        await db.transact(transactions);

        // Log progress
        for (const update of batch) {
          console.log(`✓ Updated "${update.buffetName}" (placeId: ${update.placeId})`);
          console.log(`  → popularFor: ${update.oldValue || 'null'} → "${update.popularFor}"`);
          updated++;
        }
        
        console.log(`\n  Batch ${Math.floor(i / updateBatchSize) + 1} complete (${Math.min(i + updateBatchSize, updates.length)}/${updates.length})\n`);

      } catch (error) {
        console.error(`✗ Error updating batch ${Math.floor(i / updateBatchSize) + 1}:`, error.message);
        
        // Try individual updates if batch fails
        console.log('  Trying individual updates...');
        for (const update of batch) {
          try {
            await db.transact([
              db.tx.buffets[update.buffetId].update({
                popularFor: update.popularFor
              })
            ]);
            console.log(`  ✓ Updated "${update.buffetName}" individually`);
            updated++;
          } catch (err) {
            console.error(`  ✗ Error updating "${update.buffetName}":`, err.message);
            errors++;
          }
        }
      }
    }

    console.log('='.repeat(80));
    console.log('Extraction Summary:');
    console.log(`  ✓ Updated: ${updated}`);
    console.log(`  ⏭ Skipped: ${skipped}`);
    console.log(`  ✗ Errors: ${errors}`);
    console.log(`  📊 Found with "Popular for": ${foundWithPopularFor}`);
    console.log('='.repeat(80));

    if (!migrateAll && updated > 0) {
      console.log('\n✓ Test extraction completed successfully!');
      console.log('To process all records, run:');
      console.log('  node scripts/extract-popular-for-from-db.js --all\n');
    }

  } catch (error) {
    console.error('\n✗ Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

extractPopularForFromDB().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
