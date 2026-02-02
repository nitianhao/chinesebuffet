// Backfill searchName for buffets (one-time script)
// Run with: node scripts/backfill-search-name.js

const { init } = require('@instantdb/admin');
const path = require('path');
const fs = require('fs');
const { normalizeSearchText } = require('./lib/normalizeSearchText');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId:
    process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
    process.env.INSTANT_APP_ID ||
    '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const PAGE_SIZE = 500;
const LOG_EVERY = 500;

async function backfillSearchName() {
  let offset = 0;
  let processed = 0;
  let updated = 0;

  console.log('Starting searchName backfill...');

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit: PAGE_SIZE, offset },
      },
    });

    const buffets = result.buffets || [];
    if (buffets.length === 0) break;

    const txs = [];
    for (const buffet of buffets) {
      if (!buffet?.id || !buffet?.name) continue;
      const normalized = normalizeSearchText(buffet.name);
      if (!normalized) continue;
      if (buffet.searchName === normalized) continue;
      txs.push(db.tx.buffets[buffet.id].update({ searchName: normalized }));
    }

    if (txs.length > 0) {
      await db.transact(txs);
      updated += txs.length;
    }

    processed += buffets.length;
    if (processed % LOG_EVERY === 0) {
      console.log(`Processed ${processed} buffets (${updated} updated)`);
    }

    offset += PAGE_SIZE;
  }

  console.log(`Done. Processed ${processed} buffets, updated ${updated}.`);
}

backfillSearchName().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
