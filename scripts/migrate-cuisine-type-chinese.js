/**
 * One-off migration: set cuisineType='chinese' on all existing buffet records
 * that don't have a cuisineType set.
 *
 * Usage: node scripts/migrate-cuisine-type-chinese.js
 *
 * This is safe to re-run — it only updates records where cuisineType is null/missing.
 */

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=#\s]+)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function migrate() {
  console.log('Fetching all buffets to check cuisineType...');

  // Fetch all buffet IDs + cuisineType
  const result = await db.query({
    buffets: {
      $: {
        fields: ['id', 'cuisineType'],
        limit: 10000,
      },
    },
  });

  const buffets = result.buffets || [];
  console.log(`Found ${buffets.length} total buffets`);

  const needMigration = buffets.filter(b => !b.cuisineType);
  console.log(`${needMigration.length} buffets need cuisineType='chinese' set`);

  if (needMigration.length === 0) {
    console.log('Nothing to do. All buffets already have cuisineType set.');
    return;
  }

  // Batch update in groups of 500
  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < needMigration.length; i += BATCH_SIZE) {
    const batch = needMigration.slice(i, i + BATCH_SIZE);
    const txs = batch.map(b => db.tx.buffets[b.id].update({ cuisineType: 'chinese' }));

    try {
      await db.transact(txs);
      updated += batch.length;
      console.log(`  Updated ${updated}/${needMigration.length}...`);
    } catch (err) {
      console.error(`  Error updating batch starting at ${i}:`, err.message);
      // Try individual updates as fallback
      for (const b of batch) {
        try {
          await db.transact([db.tx.buffets[b.id].update({ cuisineType: 'chinese' })]);
          updated++;
        } catch (e) {
          console.error(`  Failed to update ${b.id}:`, e.message);
        }
      }
    }
  }

  console.log(`\n✅ Done. Set cuisineType='chinese' on ${updated} buffets.`);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
