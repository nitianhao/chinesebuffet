// Backfill poiRecords.group for fsq-linked buffets only.
// Uses per-buffet linked poiRecords traversal (avoids scanning whole poiRecords table).
//
// Examples:
//   node scripts/backfill-fsq-poi-groups.js
//   node scripts/backfill-fsq-poi-groups.js --commit
//   node scripts/backfill-fsq-poi-groups.js --commit --max-buffets=200

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');
const { getGroupFromCategory } = require('./label-poi-groups.js');

try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
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

const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function getArgValue(name) {
  const direct = args.find(arg => arg.startsWith(`${name}=`));
  if (direct) return direct.split('=').slice(1).join('=');
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return args[idx + 1];
  return null;
}

async function fetchAllFsqBuffets(prefix) {
  const out = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset },
      },
    });
    const rows = result.buffets || [];
    for (const b of rows) {
      const pid = typeof b.placeId === 'string' ? b.placeId.trim().toLowerCase() : '';
      if (pid.startsWith(prefix)) out.push(b);
    }
    if (rows.length < limit) break;
    offset += limit;
  }
  return out;
}

async function fetchAllPoiRecordsForBuffet(buffetId) {
  const result = await db.query({
    buffets: {
      $: { where: { id: buffetId }, limit: 1 },
      poiRecords: {},
    },
  });
  return result.buffets?.[0]?.poiRecords || [];
}

async function main() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const commit = hasFlag('--commit');
  const dryRun = !commit;
  const prefix = (getArgValue('--place-id-prefix') || 'fsq').trim().toLowerCase();
  const maxBuffetsArg = getArgValue('--max-buffets');
  const maxBuffets = maxBuffetsArg ? Number.parseInt(maxBuffetsArg, 10) : null;

  console.log('='.repeat(70));
  console.log('Backfill fsq poiRecords.group');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'COMMIT'}`);
  console.log(`PlaceId prefix: ${prefix}`);
  console.log(`Safety cap: ${Number.isFinite(maxBuffets) && maxBuffets > 0 ? maxBuffets : 'none'}`);
  console.log('');

  let buffets = await fetchAllFsqBuffets(prefix);
  if (Number.isFinite(maxBuffets) && maxBuffets > 0 && buffets.length > maxBuffets) {
    buffets = buffets.slice(0, maxBuffets);
  }
  console.log(`FSQ buffets selected: ${buffets.length}`);

  let scannedBuffets = 0;
  let scannedPoi = 0;
  let alreadyLabeled = 0;
  let prepared = 0;
  let updated = 0;
  let errors = 0;
  const txBuffer = [];
  const TX_BATCH = 200;

  for (const buffet of buffets) {
    scannedBuffets += 1;
    try {
      const records = await fetchAllPoiRecordsForBuffet(buffet.id);
      if (!records.length) continue;

      for (const record of records) {
        scannedPoi += 1;
        const currentGroup = typeof record.group === 'string' ? record.group.trim() : '';
        if (currentGroup) {
          alreadyLabeled += 1;
          continue;
        }
        const targetGroup = getGroupFromCategory(record.category);
        prepared += 1;

        if (!dryRun) {
          txBuffer.push(db.tx.poiRecords[record.id].update({ group: targetGroup }));
          if (txBuffer.length >= TX_BATCH) {
            const batch = txBuffer.splice(0, TX_BATCH);
            await db.transact(batch);
            updated += batch.length;
            console.log(`  Updated ${updated} poiRecords...`);
          }
        }
      }

      if (scannedBuffets % 100 === 0) {
        console.log(`[${scannedBuffets}/${buffets.length}] scannedPoi=${scannedPoi}, prepared=${prepared}, alreadyLabeled=${alreadyLabeled}`);
      }
    } catch (error) {
      errors += 1;
      console.log(`Error buffet ${buffet.id} (${buffet.name}): ${error.message}`);
    }
  }

  if (!dryRun && txBuffer.length > 0) {
    await db.transact(txBuffer);
    updated += txBuffer.length;
    console.log(`  Updated ${updated} poiRecords...`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Backfill summary');
  console.log('='.repeat(70));
  console.log(`Buffets scanned: ${scannedBuffets}`);
  console.log(`POI records scanned: ${scannedPoi}`);
  console.log(`Already labeled: ${alreadyLabeled}`);
  console.log(`Prepared unlabeled: ${prepared}`);
  console.log(`Updated: ${dryRun ? 0 : updated}`);
  console.log(`Errors: ${errors}`);
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
