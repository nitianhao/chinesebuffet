// Find buffets that still have reviews in JSON field but not in reviews table
const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
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
} catch (error) {}

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(value)) {
    return value;
  }
  return null;
}

async function findMissingReviews() {
  console.log('🔍 Finding buffets with reviews still in JSON field...\n');
  
  // Fetch all buffets with reviews field
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit: limit,
          offset: offset,
        },
        reviewRecords: {},
      },
    });
    
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;
    
    allBuffets = allBuffets.concat(buffets);
    if (buffets.length < limit) break;
    offset += limit;
  }
  
  console.log(`Fetched ${allBuffets.length} total buffets\n`);
  
  // Find buffets that have reviews in JSON but not in reviewRecords
  const buffetsNeedingMigration = [];
  let totalReviewsInJson = 0;
  let totalReviewsInTable = 0;
  
  for (const buffet of allBuffets) {
    const jsonReviews = parseJsonField(buffet.reviews);
    const jsonReviewCount = Array.isArray(jsonReviews) ? jsonReviews.length : 0;
    const tableReviewCount = buffet.reviewRecords?.length || 0;
    
    totalReviewsInJson += jsonReviewCount;
    totalReviewsInTable += tableReviewCount;
    
    if (jsonReviewCount > 0 && jsonReviewCount > tableReviewCount) {
      buffetsNeedingMigration.push({
        id: buffet.id,
        name: buffet.name,
        jsonCount: jsonReviewCount,
        tableCount: tableReviewCount,
        missing: jsonReviewCount - tableReviewCount,
      });
    }
  }
  
  console.log('📊 Statistics:');
  console.log(`  Total reviews in JSON fields: ${totalReviewsInJson.toLocaleString()}`);
  console.log(`  Total reviews in reviews table: ${totalReviewsInTable.toLocaleString()}`);
  console.log(`  Missing reviews: ${(totalReviewsInJson - totalReviewsInTable).toLocaleString()}`);
  console.log(`  Buffets needing migration: ${buffetsNeedingMigration.length}\n`);
  
  if (buffetsNeedingMigration.length > 0) {
    console.log('Sample of buffets needing migration:');
    buffetsNeedingMigration.slice(0, 10).forEach(b => {
      console.log(`  - ${b.name}: ${b.jsonCount} in JSON, ${b.tableCount} in table (missing ${b.missing})`);
    });
    if (buffetsNeedingMigration.length > 10) {
      console.log(`  ... and ${buffetsNeedingMigration.length - 10} more`);
    }
  } else {
    console.log('✅ All reviews have been migrated!');
  }
  
  return buffetsNeedingMigration;
}

findMissingReviews().catch(console.error);







