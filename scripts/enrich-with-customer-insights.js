// Script to enrich database with what_customers_are_saying_seo field
// Run with: node scripts/enrich-with-customer-insights.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
  console.log('Loaded environment variables from .env.local');
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function enrichDatabase() {
  console.log('Reading enriched JSON data...');
  const enrichedJsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all_enriched_every_object.json');
  
  if (!fs.existsSync(enrichedJsonPath)) {
    console.error('Enriched JSON file not found at:', enrichedJsonPath);
    process.exit(1);
  }
  
  const enrichedData = JSON.parse(fs.readFileSync(enrichedJsonPath, 'utf8'));
  console.log(`Found ${enrichedData.length} entries in enriched JSON`);
  
  // Filter entries that have the what_customers_are_saying_seo field and a placeId
  const enrichedEntries = enrichedData.filter(entry => 
    entry.what_customers_are_saying_seo && 
    entry.placeId
  );
  
  console.log(`Found ${enrichedEntries.length} entries with what_customers_are_saying_seo field`);
  
  if (enrichedEntries.length === 0) {
    console.log('No entries to enrich. Exiting.');
    return;
  }
  
  // Create a map of placeId -> what_customers_are_saying_seo
  const enrichmentMap = new Map();
  enrichedEntries.forEach(entry => {
    if (entry.placeId && entry.what_customers_are_saying_seo) {
      enrichmentMap.set(entry.placeId, entry.what_customers_are_saying_seo);
    }
  });
  
  console.log(`Created enrichment map with ${enrichmentMap.size} placeIds`);
  
  // Get all placeIds from the database (batch queries if needed)
  console.log('\nFetching buffets from database...');
  const placeIds = Array.from(enrichmentMap.keys());
  const QUERY_BATCH_SIZE = 500; // InstantDB query limit
  const allBuffets = [];
  
  for (let i = 0; i < placeIds.length; i += QUERY_BATCH_SIZE) {
    const batchPlaceIds = placeIds.slice(i, i + QUERY_BATCH_SIZE);
    try {
      const batchResult = await db.query({ 
        buffets: { 
          $: { 
            where: { 
              placeId: { $in: batchPlaceIds } 
            } 
          } 
        } 
      });
      allBuffets.push(...batchResult.buffets);
      console.log(`  Fetched batch ${Math.floor(i / QUERY_BATCH_SIZE) + 1}: ${batchResult.buffets.length} buffets`);
    } catch (error) {
      console.error(`  ✗ Error fetching batch ${Math.floor(i / QUERY_BATCH_SIZE) + 1}:`, error.message);
    }
  }
  
  console.log(`Found ${allBuffets.length} matching buffets in database`);
  
  if (allBuffets.length === 0) {
    console.log('No matching buffets found. Exiting.');
    return;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = allBuffets
    .filter(buffet => {
      const enrichment = enrichmentMap.get(buffet.placeId);
      // Only update if the field is missing or different
      return enrichment && buffet.what_customers_are_saying_seo !== enrichment;
    })
    .map(buffet => {
      const enrichment = enrichmentMap.get(buffet.placeId);
      return db.tx.buffets[buffet.id].update({
        what_customers_are_saying_seo: enrichment,
      });
    });
  
  console.log(`Prepared ${updateTxs.length} updates`);
  
  if (updateTxs.length === 0) {
    console.log('No updates needed. All matching buffets already have the latest data.');
    return;
  }
  
  // Execute updates in batches to avoid overwhelming the database
  const BATCH_SIZE = 100;
  let updated = 0;
  
  for (let i = 0; i < updateTxs.length; i += BATCH_SIZE) {
    const batch = updateTxs.slice(i, i + BATCH_SIZE);
    try {
      await db.transact(batch);
      updated += batch.length;
      console.log(`  ✓ Updated ${updated}/${updateTxs.length} buffets...`);
    } catch (error) {
      console.error(`  ✗ Error updating batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
    }
  }
  
  console.log(`\n✅ Successfully enriched ${updated} buffets with what_customers_are_saying_seo field!`);
  
  // Show some statistics
  const stats = {
    totalEnriched: enrichmentMap.size,
    foundInDb: allBuffets.length,
    updated: updated,
    alreadyHadField: allBuffets.length - updateTxs.length,
  };
  
  console.log('\nStatistics:');
  console.log(`  Total entries with enrichment data: ${stats.totalEnriched}`);
  console.log(`  Found in database: ${stats.foundInDb}`);
  console.log(`  Updated: ${stats.updated}`);
  console.log(`  Already had field: ${stats.alreadyHadField}`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  console.error('Make sure it is set in .env.local or as an environment variable');
  process.exit(1);
}

enrichDatabase().catch(error => {
  console.error('Error enriching database:', error);
  process.exit(1);
});





















