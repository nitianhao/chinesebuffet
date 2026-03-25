#!/usr/bin/env node
// Script to write cuisine analysis results to the menus table in InstantDB.
//
// The analysis results come from data/cuisine-analysis-results.json.
// This script reads that file and writes the cuisine fields to the matching
// menu records (matched by placeId).
//
// Usage:
//   node scripts/analyze-menu-cuisine.js            # dry run - shows what would be written
//   node scripts/analyze-menu-cuisine.js --write    # write results to DB

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
const writeMode = args.includes('--write');

const RESULTS_FILE = path.join(__dirname, '../data/cuisine-analysis-results.json');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(80));
  console.log('Cuisine Analysis → InstantDB Writer');
  console.log('='.repeat(80));
  console.log(`Mode: ${writeMode ? 'WRITE' : 'DRY RUN (add --write to save to DB)'}`);
  console.log();

  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`Results file not found: ${RESULTS_FILE}`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  console.log(`Loaded ${results.length} analysis results from ${RESULTS_FILE}\n`);

  // Print summary
  for (const r of results) {
    const mixed = r.analysis.isMixedCuisine
      ? ` [MIXED: ${r.analysis.mixedCuisineTypes.join(', ')}]`
      : '';
    console.log(`  ${r.name}`);
    console.log(`    cuisineType: ${r.analysis.cuisineType}`);
    console.log(`    prevalentDishType: ${r.analysis.prevalentDishType}${mixed}`);
    console.log(`    confidence: ${r.analysis.cuisineConfidence}`);
    console.log();
  }

  if (!writeMode) {
    console.log('DRY RUN complete. Run with --write to save to DB.');
    return;
  }

  // Look up menu records by placeId
  console.log('Fetching menu records from InstantDB...');
  const placeIds = results.map(r => r.placeId);
  let allMenus = [];

  for (let i = 0; i < placeIds.length; i += 100) {
    const batch = placeIds.slice(i, i + 100);
    try {
      const result = await db.query({
        menus: { $: { where: { placeId: { $in: batch } } } }
      });
      allMenus = allMenus.concat(result.menus || []);
    } catch (e) {
      console.error(`Error fetching batch: ${e.message}`);
      for (const placeId of batch) {
        try {
          const result = await db.query({ menus: { $: { where: { placeId } } } });
          allMenus = allMenus.concat(result.menus || []);
        } catch (err) {
          console.error(`  Error for ${placeId}: ${err.message}`);
        }
        await sleep(200);
      }
    }
    await sleep(500);
  }

  console.log(`Found ${allMenus.length} menu records in DB\n`);

  // Build placeId -> most recent menu map
  const menuByPlaceId = new Map();
  for (const menu of allMenus) {
    const existing = menuByPlaceId.get(menu.placeId);
    if (!existing || (menu.scrapedAt || '') > (existing.scrapedAt || '')) {
      menuByPlaceId.set(menu.placeId, menu);
    }
  }

  // Build updates
  const updates = [];
  for (const { placeId, name, analysis } of results) {
    const menu = menuByPlaceId.get(placeId);
    if (!menu) {
      console.warn(`  ⚠ No menu record found for ${name} (${placeId})`);
      continue;
    }
    updates.push({
      menuId: menu.id,
      name,
      placeId,
      data: {
        cuisineType: analysis.cuisineType,
        prevalentDishType: analysis.prevalentDishType,
        isMixedCuisine: analysis.isMixedCuisine,
        mixedCuisineTypes: JSON.stringify(analysis.mixedCuisineTypes || []),
        cuisineConfidence: analysis.cuisineConfidence,
        cuisineAnalyzedAt: new Date().toISOString(),
      }
    });
  }

  console.log(`Prepared ${updates.length} updates\n`);

  let written = 0;
  let writeErrors = 0;
  const batchSize = 50;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    try {
      const txs = batch.map(u => db.tx.menus[u.menuId].update(u.data));
      await db.transact(txs);
      for (const u of batch) {
        console.log(`  ✓ ${u.name} → ${u.data.cuisineType}`);
        written++;
      }
    } catch (e) {
      console.error(`  Batch error: ${e.message} — trying individually`);
      for (const u of batch) {
        try {
          await db.transact([db.tx.menus[u.menuId].update(u.data)]);
          console.log(`  ✓ ${u.name} (individual)`);
          written++;
        } catch (err) {
          console.error(`  ✗ Failed ${u.name}: ${err.message}`);
          writeErrors++;
        }
      }
    }
    await sleep(1000);
  }

  console.log();
  console.log('='.repeat(80));
  console.log(`Done: ${written} written, ${writeErrors} errors`);
  console.log('='.repeat(80));
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
