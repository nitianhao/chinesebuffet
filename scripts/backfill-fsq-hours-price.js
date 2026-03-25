/*
 * Backfill `price` and `hours` for existing FSQ-linked buffets using
 * place details by FSQ ID (not city search).
 *
 * Default mode is --dry-run (safe). Use --commit to write.
 *
 * Usage examples:
 *   node scripts/backfill-fsq-hours-price.js --limit 20
 *   node scripts/backfill-fsq-hours-price.js --ids 4e4e4fb6bd4101d0d7a76f95,67d355a3a1563c170ec83878
 *   node scripts/backfill-fsq-hours-price.js --commit --limit 50
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { init } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');

const DEFAULTS = {
  commit: false,
  dryRun: true,
  limit: 50,
  offset: 0,
  onlyMissing: true,
  ids: [],
  placesApiVersion: '2025-06-17',
  retries: 4,
  requestDelayMs: 500,
};

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) return;

    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function parseArgs(argv) {
  const opts = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--commit') {
      opts.commit = true;
      opts.dryRun = false;
    } else if (arg === '--dry-run') {
      opts.commit = false;
      opts.dryRun = true;
    } else if (arg === '--limit' && next) {
      opts.limit = Math.max(1, Number(next) || DEFAULTS.limit);
      i += 1;
    } else if (arg === '--offset' && next) {
      opts.offset = Math.max(0, Number(next) || DEFAULTS.offset);
      i += 1;
    } else if (arg === '--ids' && next) {
      opts.ids = String(next)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => v.replace(/^fsq:/i, ''));
      i += 1;
    } else if (arg === '--all') {
      opts.onlyMissing = false;
    } else if (arg === '--places-api-version' && next) {
      opts.placesApiVersion = next.trim();
      i += 1;
    } else if (arg === '--retries' && next) {
      opts.retries = Math.max(1, Number(next) || DEFAULTS.retries);
      i += 1;
    } else if (arg === '--request-delay-ms' && next) {
      opts.requestDelayMs = Math.max(0, Number(next) || DEFAULTS.requestDelayMs);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelpAndExit();
    }
  }

  return opts;
}

function printHelpAndExit() {
  console.log(`
Usage:
  node scripts/backfill-fsq-hours-price.js [options]

Options:
  --dry-run               Run without writing to DB (default)
  --commit                Write updates to DB
  --limit <n>             Number of FSQ buffets to process (default: 50)
  --offset <n>            Pagination offset over eligible FSQ buffets (default: 0)
  --ids <csv>             Explicit FSQ ids (or fsq: ids), comma-separated
  --all                   Update even when buffet already has price/hours (default updates only missing)
  --places-api-version    Foursquare Places API version header (default: 2025-06-17)
  --retries <n>           Retries per FSQ details request (default: 4)
  --request-delay-ms <n>  Delay between requests to reduce 429s (default: 500)
  -h, --help              Show this message
`);
  process.exit(0);
}

function requestJson(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (err) {
          reject(new Error(`Failed to parse JSON response: ${err.message}`));
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          const apiMsg = parsed?.message || parsed?.error || `HTTP ${res.statusCode}`;
          const error = new Error(`Foursquare API error (${res.statusCode}): ${apiMsg}`);
          error.statusCode = res.statusCode;
          error.apiBody = parsed;
          reject(error);
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function fetchPlaceDetails({ fsqId, serviceKey, apiKey, placesApiVersion }) {
  if (serviceKey) {
    const endpoint = new URL(`https://places-api.foursquare.com/places/${encodeURIComponent(fsqId)}`);
    endpoint.searchParams.set('fields', 'fsq_place_id,price,hours');
    return requestJson(endpoint.toString(), {
      Accept: 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      'X-Places-Api-Version': placesApiVersion,
    });
  }

  const endpoint = new URL(`https://api.foursquare.com/v3/places/${encodeURIComponent(fsqId)}`);
  endpoint.searchParams.set('fields', 'hours,price');
  return requestJson(endpoint.toString(), {
    Accept: 'application/json',
    Authorization: apiKey,
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPlaceDetailsWithRetry({ fsqId, serviceKey, apiKey, placesApiVersion, retries }) {
  let lastErr;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchPlaceDetails({ fsqId, serviceKey, apiKey, placesApiVersion });
    } catch (err) {
      lastErr = err;
      const statusCode = err?.statusCode || 0;
      const retryable = statusCode === 429 || (statusCode >= 500 && statusCode < 600);
      if (!retryable || attempt >= retries) {
        throw err;
      }
      const backoffMs = attempt * 3000;
      await wait(backoffMs);
    }
  }

  throw lastErr;
}

function normalizePrice(rawPrice) {
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0) {
    return '$'.repeat(Math.max(1, Math.min(4, Math.round(rawPrice))));
  }
  if (typeof rawPrice === 'string' && rawPrice.trim()) {
    return rawPrice.trim();
  }
  return undefined;
}

function hasValue(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function extractFsqId(placeId) {
  if (!placeId || typeof placeId !== 'string') return '';
  const trimmed = placeId.trim();
  if (!trimmed) return '';
  if (/^fsq:/i.test(trimmed)) return trimmed.replace(/^fsq:/i, '');
  return '';
}

async function loadAllBuffets(db) {
  const rows = [];
  const limit = 1000;
  let offset = 0;

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset },
      },
    });

    const batch = result?.buffets || [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return rows;
}

function pickTargets(buffets, opts) {
  const byFsqId = new Map();
  const selected = [];

  for (const buffet of buffets) {
    const fsqId = extractFsqId(buffet.placeId);
    if (!fsqId) continue;
    if (byFsqId.has(fsqId)) continue;
    byFsqId.set(fsqId, buffet);
  }

  if (opts.ids.length > 0) {
    for (const fsqId of opts.ids) {
      const buffet = byFsqId.get(fsqId);
      if (buffet) {
        selected.push(buffet);
      }
    }
    return selected;
  }

  const eligible = [];
  for (const buffet of byFsqId.values()) {
    if (!opts.onlyMissing) {
      eligible.push(buffet);
      continue;
    }

    const missingPrice = !hasValue(buffet.price);
    const missingHours = !hasValue(buffet.hours);
    if (missingPrice || missingHours) {
      eligible.push(buffet);
    }
  }

  return eligible.slice(opts.offset, opts.offset + opts.limit);
}

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));

  const serviceKey = process.env.FOURSQUARE_SERVICE_KEY;
  const apiKey = process.env.FOURSQUARE_API_KEY;
  if (!serviceKey && !apiKey) {
    throw new Error('FOURSQUARE_SERVICE_KEY or FOURSQUARE_API_KEY is required in .env.local or environment.');
  }

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required in .env.local or environment.');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'COMMIT'}`);
  console.log(`Auth mode: ${serviceKey ? 'service_key (new API)' : 'api_key (legacy v3 API)'}`);

  const allBuffets = await loadAllBuffets(db);
  const targets = pickTargets(allBuffets, opts);
  console.log(`FSQ targets selected: ${targets.length}`);

  let fetched = 0;
  let updated = 0;
  let skippedNoData = 0;
  let failed = 0;

  const txs = [];

  for (const buffet of targets) {
    const fsqId = extractFsqId(buffet.placeId);
    if (!fsqId) continue;

    try {
      const details = await fetchPlaceDetailsWithRetry({
        fsqId,
        serviceKey,
        apiKey,
        placesApiVersion: opts.placesApiVersion,
        retries: opts.retries,
      });
      fetched += 1;

      const nextPrice = normalizePrice(details?.price);
      const nextHours = details?.hours ? JSON.stringify(details.hours) : undefined;

      if (opts.requestDelayMs > 0) {
        await wait(opts.requestDelayMs);
      }

      const payload = {};
      if (hasValue(nextPrice)) payload.price = nextPrice;
      if (hasValue(nextHours)) payload.hours = nextHours;

      if (Object.keys(payload).length === 0) {
        skippedNoData += 1;
        continue;
      }

      if (opts.onlyMissing) {
        if (hasValue(buffet.price)) delete payload.price;
        if (hasValue(buffet.hours)) delete payload.hours;
      }

      if (Object.keys(payload).length === 0) {
        continue;
      }

      console.log(`- ${buffet.name} (${buffet.placeId}) -> ${Object.keys(payload).join(', ')}`);

      if (opts.commit) {
        txs.push(db.tx.buffets[buffet.id].update(payload));
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`! Failed ${buffet.name} (${buffet.placeId}): ${msg}`);
    }
  }

  if (opts.commit && txs.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < txs.length; i += batchSize) {
      await db.transact(txs.slice(i, i + batchSize));
    }
  }

  console.log('\nSummary');
  console.log(`Fetched details: ${fetched}`);
  console.log(`Updated candidates: ${updated}`);
  console.log(`Skipped (no hours/price in API response): ${skippedNoData}`);
  console.log(`Failed: ${failed}`);
  console.log(`Committed: ${opts.commit ? updated : 0}`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error: ${msg}`);
  process.exit(1);
});
