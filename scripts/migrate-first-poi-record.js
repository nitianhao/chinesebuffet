// Script to migrate buffets' overpassPOIs data to the poiRecords table
// Processes a specified number of buffets (default: 100)

const { init, id } = require('@instantdb/admin');
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
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to parse JSON field
function parseJsonField(value) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField entry',data:{valueType:typeof value,valueLength:typeof value === 'string' ? value.length : 'N/A',hasValue:!!value},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
  // #endregion
  
  if (!value) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField no value',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return null;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField parsed successfully',data:{parsedType:typeof parsed,isArray:Array.isArray(parsed),arrayLength:Array.isArray(parsed) ? parsed.length : 'N/A'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return parsed;
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField parse error',data:{error:e.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      return null;
    }
  }
  if (Array.isArray(value)) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField already array',data:{arrayLength:value.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return value;
  }
  if (typeof value === 'object') {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:parseJsonField',message:'parseJsonField already object',data:{objectKeys:Object.keys(value)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return value;
  }
  return null;
}

// Transform POI object to InstantDB format
function preparePOIData(poi, order) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:preparePOIData',message:'preparePOIData entry',data:{poiId:poi.id || poi.osmId,poiType:poi.type,order},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  
  const result = {
    osmId: poi.id || poi.osmId || 0,
    type: poi.type || 'node',
    name: poi.name || null,
    category: poi.category || null,
    distance: poi.distance || 0,
    lat: poi.lat || 0,
    lon: poi.lon || 0,
    tags: poi.tags ? JSON.stringify(poi.tags) : null,
    order: order || null,
  };
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:preparePOIData',message:'preparePOIData result',data:{osmId:result.osmId,type:result.type,hasName:!!result.name,hasCategory:!!result.category,distance:result.distance},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  
  return result;
}

async function migrateBuffets(limit = null) {
  const limitText = limit ? `${limit} buffet records` : 'ALL remaining buffet records';
  console.log(`🚀 Starting migration of ${limitText}...\n`);

  try {
    // Step 1: Find buffets with overpassPOIs data
    console.log(`Step 1: Finding all buffets with overpassPOIs data...`);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'migrateBuffets entry',data:{limit:limit || 'all'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion
    
    // Fetch all buffets in batches
    let allBuffets = [];
    let offset = 0;
    const fetchLimit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: fetchLimit,
            offset: offset
          }
        }
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      if (buffets.length < fetchLimit) break;
      offset += fetchLimit;
    }

    // Filter buffets that have overpassPOIs field with actual data
    const allBuffetsWithPOIs = allBuffets.filter(b => {
      return b.overpassPOIs && 
             typeof b.overpassPOIs === 'string' && 
             b.overpassPOIs.trim().length > 0;
    });
    
    // Apply limit if specified, otherwise process all
    const buffets = limit ? allBuffetsWithPOIs.slice(0, limit) : allBuffetsWithPOIs;
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'found buffets with overpassPOIs',data:{totalFound:allBuffetsWithPOIs.length,buffetsToProcess:buffets.length,limit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H3'})}).catch(()=>{});
    // #endregion

    if (buffets.length === 0) {
      console.log('  ❌ No buffets found with overpassPOIs field');
      return;
    }

    console.log(`  ✅ Found ${buffets.length} buffets to process\n`);

    // Process each buffet
    let totalPOIsProcessed = 0;
    let totalPOIsCreated = 0;
    let totalPOIsSkipped = 0;
    let buffetsProcessed = 0;
    let buffetsWithErrors = 0;

    const BATCH_SIZE = 50; // Process POIs in batches

    for (let i = 0; i < buffets.length; i += 1) {
      const buffet = buffets[i];

      try {
        // Step 2: Parse the JSON data
        const poisJson = buffet.overpassPOIs;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'before parsing JSON',data:{buffetId:buffet.id,buffetName:buffet.name,jsonType:typeof poisJson,jsonLength:poisJson ? poisJson.length : 0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        
        const poisData = parseJsonField(poisJson);

        // Handle both array format and object format
        let poisArray = null;
        if (Array.isArray(poisData)) {
          poisArray = poisData;
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'parsed as array',data:{buffetId:buffet.id,arrayLength:poisArray.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
        } else if (poisData && typeof poisData === 'object') {
          // If it's an object, check for common array keys
          if (poisData.pois && Array.isArray(poisData.pois)) {
            poisArray = poisData.pois;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'found pois array in object',data:{buffetId:buffet.id,arrayLength:poisArray.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
            // #endregion
          } else if (poisData.data && Array.isArray(poisData.data)) {
            poisArray = poisData.data;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'found data array in object',data:{buffetId:buffet.id,arrayLength:poisArray.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
            // #endregion
          } else if (poisData.results && Array.isArray(poisData.results)) {
            poisArray = poisData.results;
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'found results array in object',data:{buffetId:buffet.id,arrayLength:poisArray.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
            // #endregion
          } else {
            // Try to find any array property
            const arrayKey = Object.keys(poisData).find(key => Array.isArray(poisData[key]));
            if (arrayKey) {
              poisArray = poisData[arrayKey];
              // #region agent log
              fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'found array in object by key',data:{buffetId:buffet.id,arrayKey,arrayLength:poisArray.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H4'})}).catch(()=>{});
              // #endregion
            }
          }
        }

        if (!Array.isArray(poisArray) || poisArray.length === 0) {
          continue; // Skip this buffet if no valid POIs
        }

        // Step 3: Check if POIs already exist for this buffet
        let existingPOIs = [];
        try {
          const checkResult = await db.query({
            buffets: {
              $: { where: { id: buffet.id } },
              poiRecords: {},
            },
          });
          existingPOIs = checkResult.buffets?.[0]?.poiRecords || [];
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'checked existing POIs',data:{buffetId:buffet.id,existingCount:existingPOIs.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
          // #endregion
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'error checking existing POIs',data:{buffetId:buffet.id,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
          // #endregion
        }

        // Create a set of existing POI keys for duplicate detection
        const existingPOIsSet = new Set();
        existingPOIs.forEach(poi => {
          const key = `${poi.osmId}_${poi.lat}_${poi.lon}`;
          existingPOIsSet.add(key);
        });

        // Step 4: Sort POIs by distance and prepare for migration
        const sortedPOIs = [...poisArray].sort((a, b) => {
          const distA = a.distance || 0;
          const distB = b.distance || 0;
          return distA - distB;
        });

        const transactions = [];
        let created = 0;
        let skipped = 0;

        for (let idx = 0; idx < sortedPOIs.length; idx++) {
          const poi = sortedPOIs[idx];
          
          // Check if POI already exists
          const poiKey = `${poi.id || poi.osmId || 0}_${poi.lat || 0}_${poi.lon || 0}`;
          if (existingPOIsSet.has(poiKey)) {
            skipped++;
            continue;
          }

          // Prepare POI data
          const poiData = preparePOIData(poi, idx);
          
          // Create POI transaction
          const poiId = id();
          const poiTx = db.tx.poiRecords[poiId]
            .create(poiData)
            .link({ buffet: buffet.id });

          transactions.push(poiTx);
          existingPOIsSet.add(poiKey);
          created++;
        }

        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'before transaction',data:{buffetId:buffet.id,transactionsCount:transactions.length,created,skipped},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
        // #endregion

        // Step 5: Execute transaction in batches
        if (transactions.length > 0) {
          // Process in batches to avoid overwhelming the database
          for (let batchStart = 0; batchStart < transactions.length; batchStart += BATCH_SIZE) {
            const batch = transactions.slice(batchStart, batchStart + BATCH_SIZE);
            await db.transact(batch);
          }
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'transaction completed',data:{buffetId:buffet.id,transactionsCount:transactions.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H6'})}).catch(()=>{});
          // #endregion
        }
        totalPOIsProcessed += poisArray.length;
        totalPOIsCreated += created;
        totalPOIsSkipped += skipped;
        buffetsProcessed++;

        if (created > 0 || (i + 1) % 10 === 0) {
          console.log(`  ✓ [${i + 1}/${buffets.length}] ${buffet.name}: ${created} created, ${skipped} skipped`);
        }
      } catch (error) {
        console.error(`  ✗ Error processing ${buffet.name}:`, error.message);
        buffetsWithErrors++;
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'error processing buffet',data:{buffetId:buffet.id,buffetName:buffet.name,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'ERROR'})}).catch(()=>{});
        // #endregion
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(80));
    console.log(`  Buffets processed: ${buffetsProcessed}/${buffets.length}`);
    console.log(`  Total POIs processed: ${totalPOIsProcessed}`);
    console.log(`  POIs created: ${totalPOIsCreated}`);
    console.log(`  POIs skipped (duplicates): ${totalPOIsSkipped}`);
    if (buffetsWithErrors > 0) {
      console.log(`  ⚠ Buffets with errors: ${buffetsWithErrors}`);
    }
    console.log('\n✅ Migration complete!');
    console.log('📝 Original overpassPOIs fields are preserved (not deleted)');
    console.log('📝 Please verify the data in your database before continuing');

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'migrate-first-poi-record.js:migrateBuffets',message:'error occurred',data:{error:error.message,stack:error.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'ERROR'})}).catch(()=>{});
    // #endregion
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run migration
if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

// Get limit from command line argument or null for all
const limitArg = process.argv[2];
const limit = limitArg && limitArg.toLowerCase() !== 'all' ? parseInt(limitArg, 10) : null;
migrateBuffets(limit);
