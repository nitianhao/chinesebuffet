#!/usr/bin/env node
// Fetch all menu records from InstantDB that have rawText but no cuisineType yet.
// Writes them to data/menus-for-analysis.json for Claude to analyze.
//
// Usage:
//   node scripts/fetch-menus-for-analysis.js
//   node scripts/fetch-menus-for-analysis.js --all   (include already-analyzed ones)

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
const includeAll = args.includes('--all');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllMenus() {
  console.log('Fetching menus from InstantDB...');

  // InstantDB doesn't support server-side filtering on optional fields well,
  // so we fetch all menus and filter client-side.
  let allMenus = [];
  let cursor = null;
  let page = 0;

  // Fetch in chunks using limit/offset pagination via query slicing
  // InstantDB admin query returns all records - just fetch everything
  const [menusResult, buffetsResult] = await Promise.all([
    db.query({ menus: {} }),
    db.query({ buffets: { $: { fields: ['placeId', 'name'] } } }),
  ]);

  allMenus = menusResult.menus || [];
  console.log(`Fetched ${allMenus.length} total menu records`);

  // Build placeId -> buffet name map
  const buffetNameByPlaceId = new Map();
  for (const b of (buffetsResult.buffets || [])) {
    if (b.placeId) buffetNameByPlaceId.set(b.placeId, b.name);
  }

  // Filter to those with rawText
  const withRawText = allMenus.filter(m => m.rawText && m.rawText.trim().length > 50);
  console.log(`  ${withRawText.length} have rawText`);

  // Filter to those not yet analyzed (unless --all)
  const toAnalyze = includeAll
    ? withRawText
    : withRawText.filter(m => !m.cuisineType);
  console.log(`  ${toAnalyze.length} need analysis${includeAll ? '' : ' (no cuisineType yet)'}`);

  // Shape the output - keep only what we need for analysis
  const output = toAnalyze.map(m => ({
    menuId: m.id,
    placeId: m.placeId,
    buffetName: buffetNameByPlaceId.get(m.placeId) || '(unknown)',
    rawText: m.rawText,
    // Include existing analysis fields if present
    cuisineType: m.cuisineType || null,
    cuisineAnalyzedAt: m.cuisineAnalyzedAt || null,
  }));

  const outPath = path.join(__dirname, '../data/menus-for-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\nWrote ${output.length} menus to data/menus-for-analysis.json`);
  console.log('Sample names:');
  output.slice(0, 5).forEach(m => console.log(`  - ${m.buffetName} (${m.placeId})`));
}

fetchAllMenus().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
