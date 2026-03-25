#!/usr/bin/env node
/**
 * Backfill cuisineType (and related cuisine fields) into each buffet's facetIndex.
 *
 * Why this is needed:
 *   cuisineType lives on the `menus` table (joined by placeId).
 *   The facet/rollup pipeline reads facetIndex from `buffets`.
 *   This script joins the two and updates each buffet's facetIndex
 *   with the cuisine data so it flows through the rollup pipeline.
 *
 * Usage:
 *   node scripts/backfillCuisineIntoFacetIndex.js           # dry run
 *   node scripts/backfillCuisineIntoFacetIndex.js --write   # write to DB
 *
 * After running with --write, rebuild rollups:
 *   node scripts/rebuildRollups.js --city-facets-only
 */

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load .env.local
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
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.warn('Warning: Could not load .env.local:', e.message);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN is required');
  process.exit(1);
}

const schema = require('../src/instant.schema.ts');
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

const args = process.argv.slice(2);
const shouldWrite = args.includes('--write');

async function main() {
  console.log(`Mode: ${shouldWrite ? 'WRITE' : 'DRY RUN'}`);
  console.log('Fetching menus with cuisineType...');

  // Fetch all menus that have cuisine data (High/Medium confidence)
  const menusResult = await db.query({ menus: {} });
  const menus = menusResult.menus || [];
  console.log(`  Total menus: ${menus.length}`);

  // Build placeId -> cuisine info map (skip Low confidence)
  const cuisineByPlaceId = new Map();
  for (const m of menus) {
    if (m.cuisineType && m.placeId && m.cuisineConfidence !== 'Low') {
      cuisineByPlaceId.set(m.placeId, {
        cuisineType: m.cuisineType,
      });
    }
  }
  console.log(`  Menus with cuisineType (non-Low confidence): ${cuisineByPlaceId.size}`);

  console.log('\nFetching buffets...');
  const buffetsResult = await db.query({ buffets: {} });
  const buffets = buffetsResult.buffets || [];
  console.log(`  Total buffets: ${buffets.length}`);

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;
  let noFacetIndex = 0;
  const txs = [];

  for (const b of buffets) {
    const cuisineInfo = cuisineByPlaceId.get(b.placeId);
    if (!cuisineInfo) {
      noMatch++;
      continue;
    }

    if (!b.facetIndex) {
      noFacetIndex++;
      continue;
    }

    // Parse existing facetIndex
    let facetData;
    try {
      facetData = JSON.parse(b.facetIndex);
    } catch {
      skipped++;
      continue;
    }

    // Check if already up to date
    if (facetData.cuisineType === cuisineInfo.cuisineType) {
      skipped++;
      continue;
    }

    // Update facetIndex with cuisine data
    facetData.cuisineType = cuisineInfo.cuisineType;

    txs.push(db.tx.buffets[b.id].update({
      facetIndex: JSON.stringify(facetData),
    }));
    updated++;
  }

  console.log(`\nResults:`);
  console.log(`  Would update: ${updated}`);
  console.log(`  Already up to date (skipped): ${skipped}`);
  console.log(`  No cuisine match: ${noMatch}`);
  console.log(`  No facetIndex to update: ${noFacetIndex}`);

  if (!shouldWrite) {
    console.log('\nDry run — pass --write to apply changes.');
    return;
  }

  if (txs.length === 0) {
    console.log('\nNothing to write.');
    return;
  }

  // Write in batches of 200 to avoid payload limits
  const BATCH_SIZE = 200;
  let written = 0;
  for (let i = 0; i < txs.length; i += BATCH_SIZE) {
    const batch = txs.slice(i, i + BATCH_SIZE);
    await db.transact(batch);
    written += batch.length;
    console.log(`  Wrote ${written}/${txs.length}...`);
  }

  console.log(`\nDone. Updated ${written} buffet facetIndex records.`);
  console.log('\nNext step: rebuild city facets rollups:');
  console.log('  node scripts/rebuildRollups.js --city-facets-only');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
