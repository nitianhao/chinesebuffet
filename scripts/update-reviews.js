// Script to update existing buffet records with reviews from JSON file
// Matches records by placeId

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function updateReviews() {
  console.log('Reading allcities.cleaned.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.cleaned.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('Error: allcities.cleaned.json not found');
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);

  // Build map placeId -> reviews (stringified)
  const reviewsMap = new Map();
  jsonData.forEach(record => {
    if (record.placeId && record.reviews) {
      // store as string (schema expects string)
      reviewsMap.set(record.placeId, JSON.stringify(record.reviews));
    }
  });

  console.log(`Created map with ${reviewsMap.size} placeIds with reviews`);

  // Fetch existing buffets
  console.log('\\nFetching existing buffets from database...');
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset }
      }
    });

    const buffets = result.buffets || [];
    if (buffets.length === 0) break;

    allBuffets = allBuffets.concat(buffets);
    console.log(`  Fetched ${allBuffets.length} buffets so far...`);

    if (buffets.length < limit) break;
    offset += limit;
  }

  console.log(`Total buffets in database: ${allBuffets.length}`);

  // Determine which need updates
  const buffetsToUpdate = allBuffets.filter(buffet => {
    if (!buffet.placeId) return false;
    const reviewsStr = reviewsMap.get(buffet.placeId);
    if (!reviewsStr) return false;
    // Only update if different or empty
    return !buffet.reviews || buffet.reviews !== reviewsStr;
  });

  console.log(`\\nFound ${buffetsToUpdate.length} buffets that need reviews update`);

  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed.');
    return;
  }

  // Create update transactions
  console.log('\\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(buffet => {
    const reviewsStr = reviewsMap.get(buffet.placeId);
    return db.tx.buffets[buffet.id].update({ reviews: reviewsStr });
  });

  // Execute in batches
  const batchSize = 100;
  let updated = 0;

  for (let i = 0; i < updateTxs.length; i += batchSize) {
    const batch = updateTxs.slice(i, i + batchSize);
    await db.transact(batch);
    updated += batch.length;
    console.log(`  ✓ Updated ${updated}/${buffetsToUpdate.length} buffets...`);
  }

  console.log(`\\n✅ Successfully updated ${updated} buffets with reviews!`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateReviews().catch(error => {
  console.error('Error updating reviews:', error);
  process.exit(1);
});

