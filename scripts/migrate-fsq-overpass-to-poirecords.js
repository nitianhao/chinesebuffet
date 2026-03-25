// Migrate buffets.overpassPOIs JSON into linked poiRecords (conservative defaults).
// Default behavior is DRY RUN and FSQ-ONLY unless flags override.
//
// Examples:
//   node scripts/migrate-fsq-overpass-to-poirecords.js
//   node scripts/migrate-fsq-overpass-to-poirecords.js --commit
//   node scripts/migrate-fsq-overpass-to-poirecords.js --commit --max-buffets=100
//   node scripts/migrate-fsq-overpass-to-poirecords.js --place-id-prefix=fsq:

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

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

function parseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePoisArray(overpassPOIs) {
  const parsed = parseJson(overpassPOIs);
  if (!parsed) return [];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.pois)) return parsed.pois;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.results)) return parsed.results;
  const anyArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
  if (anyArrayKey) return parsed[anyArrayKey];
  return [];
}

function roundFeetFromMeters(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return null;
  return Math.round(meters * 3.28084);
}

function buildPoiRecord(poi, order) {
  const meters = typeof poi.distance === 'number' ? poi.distance : 0;
  const tagsValue = poi.tags && typeof poi.tags === 'object' ? JSON.stringify(poi.tags) : null;
  return {
    osmId: Number(poi.id || poi.osmId || 0),
    type: poi.type || 'node',
    name: poi.name || null,
    category: poi.category || null,
    group: null,
    distance: Math.round(meters),
    distanceFt: roundFeetFromMeters(meters),
    lat: Number(poi.lat || 0),
    lon: Number(poi.lon || 0),
    tags: tagsValue,
    order,
  };
}

async function hasAnyPoiRecords(buffetId) {
  const result = await db.query({
    buffets: {
      $: { where: { id: buffetId }, limit: 1 },
      poiRecords: {
        $: { limit: 1 },
      },
    },
  });
  const buffet = result.buffets?.[0];
  return Boolean(buffet?.poiRecords?.length);
}

async function fetchAllBuffets() {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset },
      },
    });
    const rows = result.buffets || [];
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function main() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const commit = hasFlag('--commit');
  const dryRun = !commit;
  const fsqOnly = hasFlag('--fsq-only') || !hasFlag('--all-place-ids');
  const placeIdPrefix = getArgValue('--place-id-prefix') || (fsqOnly ? 'fsq' : '');
  const maxBuffetsRaw = getArgValue('--max-buffets');
  const maxBuffets = maxBuffetsRaw ? Number.parseInt(maxBuffetsRaw, 10) : null;

  console.log('='.repeat(70));
  console.log('Overpass JSON -> poiRecords migration');
  console.log('='.repeat(70));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'COMMIT (writes enabled)'}`);
  console.log(`PlaceId filter: ${placeIdPrefix ? `startsWith("${placeIdPrefix}")` : 'none'}`);
  console.log(`Safety cap: ${Number.isFinite(maxBuffets) && maxBuffets > 0 ? maxBuffets : 'none'}`);
  console.log('');

  const allBuffets = await fetchAllBuffets();
  console.log(`Fetched buffets: ${allBuffets.length}`);

  let candidates = allBuffets;

  if (placeIdPrefix) {
    const normalizedPrefix = placeIdPrefix.toLowerCase();
    candidates = candidates.filter(b => {
      const placeId = typeof b.placeId === 'string' ? b.placeId.trim().toLowerCase() : '';
      return placeId.startsWith(normalizedPrefix);
    });
  }
  console.log(`After placeId filter: ${candidates.length}`);

  candidates = candidates.filter(b => typeof b.overpassPOIs === 'string' && b.overpassPOIs.trim().length > 0);
  console.log(`With overpassPOIs JSON present: ${candidates.length}`);

  const withParsablePois = [];
  for (const buffet of candidates) {
    const pois = parsePoisArray(buffet.overpassPOIs);
    if (Array.isArray(pois) && pois.length > 0) {
      withParsablePois.push({ buffet, pois });
    }
  }
  console.log(`With parsable non-empty POI arrays: ${withParsablePois.length}`);

  let workset = withParsablePois;
  if (Number.isFinite(maxBuffets) && maxBuffets > 0 && workset.length > maxBuffets) {
    workset = workset.slice(0, maxBuffets);
  }
  console.log(`Selected for this run: ${workset.length}`);
  console.log('');

  let scanned = 0;
  let skippedAlreadyMigrated = 0;
  let skippedNoValidPois = 0;
  let buffetsPrepared = 0;
  let poiPrepared = 0;
  let poiWritten = 0;
  let errors = 0;
  const BATCH_TX_SIZE = 200;
  const txBuffer = [];

  for (const { buffet, pois } of workset) {
    scanned += 1;
    const progress = `[${scanned}/${workset.length}]`;

    try {
      const alreadyMigrated = await hasAnyPoiRecords(buffet.id);
      if (alreadyMigrated) {
        skippedAlreadyMigrated += 1;
        console.log(`${progress} Skip ${buffet.name}: poiRecords already exist`);
        continue;
      }

      const dedupe = new Map();
      for (const poi of pois) {
        const lat = Number(poi.lat || 0);
        const lon = Number(poi.lon || 0);
        const osm = Number(poi.id || poi.osmId || 0);
        if (!lat || !lon || !osm) continue;
        const key = `${osm}_${lat}_${lon}`;
        const dist = typeof poi.distance === 'number' ? poi.distance : Number.MAX_SAFE_INTEGER;
        const existing = dedupe.get(key);
        if (!existing || dist < existing.distance) {
          dedupe.set(key, poi);
        }
      }

      const uniquePois = [...dedupe.values()].sort((a, b) => {
        const da = typeof a.distance === 'number' ? a.distance : Number.MAX_SAFE_INTEGER;
        const db = typeof b.distance === 'number' ? b.distance : Number.MAX_SAFE_INTEGER;
        return da - db;
      });

      if (uniquePois.length === 0) {
        skippedNoValidPois += 1;
        console.log(`${progress} Skip ${buffet.name}: no valid POIs after dedupe`);
        continue;
      }

      buffetsPrepared += 1;
      poiPrepared += uniquePois.length;

      for (let i = 0; i < uniquePois.length; i += 1) {
        const poiData = buildPoiRecord(uniquePois[i], i);
        const poiId = id();
        txBuffer.push(
          db.tx.poiRecords[poiId]
            .create(poiData)
            .link({ buffet: buffet.id })
        );
      }

      console.log(`${progress} Prepared ${buffet.name}: ${uniquePois.length} POIs`);

      if (!dryRun && txBuffer.length >= BATCH_TX_SIZE) {
        const batch = txBuffer.splice(0, BATCH_TX_SIZE);
        await db.transact(batch);
        poiWritten += batch.length;
        console.log(`  💾 Committed batch: ${batch.length} POI records`);
      }
    } catch (error) {
      errors += 1;
      console.log(`${progress} Error ${buffet.name}: ${error.message}`);
    }
  }

  if (!dryRun && txBuffer.length > 0) {
    await db.transact(txBuffer);
    poiWritten += txBuffer.length;
    console.log(`  💾 Committed final batch: ${txBuffer.length} POI records`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('Migration summary');
  console.log('='.repeat(70));
  console.log(`Scanned: ${scanned}`);
  console.log(`Skipped (already migrated): ${skippedAlreadyMigrated}`);
  console.log(`Skipped (no valid POIs): ${skippedNoValidPois}`);
  console.log(`Buffets prepared: ${buffetsPrepared}`);
  console.log(`POIs prepared: ${poiPrepared}`);
  console.log(`POIs written: ${dryRun ? 0 : poiWritten}`);
  console.log(`Errors: ${errors}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'COMMIT'}`);
  console.log('='.repeat(70));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

