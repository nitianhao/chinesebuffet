/**
 * Houston buffet safety composite classifier.
 *
 * Default mode: DRY RUN (no DB writes).
 * Optional mode: --write (writes only SAFE / SOME_INFRACTIONS records to DB).
 *
 * Usage:
 *   node scripts/health-inspection/houston-safety-composite.js --limit 20
 *   node scripts/health-inspection/houston-safety-composite.js --limit 20 --write
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');

const CKAN_URL = 'https://data.houstontx.gov/api/3/action/datastore_search';
const REQUEST_TIMEOUT_MS = 20000;
const API_SLEEP_MS = 500;
const QUERY_LIMIT = 200;

const INSPECTION_DATASETS = {
  FY11: 'd1d9a226-6510-4d61-9002-dd664aac4ef3',
  FY12: '7ee330a8-22ac-4300-b163-8a5ef72e3157',
  FY13: '1404eb3f-2352-48d5-923c-4fbfe2fe171b',
  FY14: '055109a9-c0f4-4ef7-bc4b-d2cb3d7e9268',
  FY15: '4f71fb49-2e0f-4e3d-99f9-9fa741bc6ab4',
};

const VIOLATION_DATASETS = {
  VFY12: '325af233-636a-4906-920f-d8c68da8bcb7',
  VFY13: '8a97258b-478e-46c3-bc79-2199ef90edfd',
  VFY14: '5c7f919b-d102-4b2b-8351-c1840524fd64',
};
const LAST_FACILITY_DATASET = '1587d382-4eb4-441f-a77a-d2eef9d7b208';

const SUFFIX_MAP = {
  STREET: 'ST',
  ST: 'ST',
  AVENUE: 'AVE',
  AVE: 'AVE',
  BOULEVARD: 'BLVD',
  BLVD: 'BLVD',
  ROAD: 'RD',
  RD: 'RD',
  HIGHWAY: 'HWY',
  HWY: 'HWY',
  DRIVE: 'DR',
  DR: 'DR',
  LANE: 'LN',
  LN: 'LN',
};

const WRITE_STATUSES = new Set(['SAFE', 'SOME_INFRACTIONS']);
const FOOD_HINT_TOKENS = [
  'BUFFET',
  'RESTAURANT',
  'CAFE',
  'GRILL',
  'KITCHEN',
  'FOOD',
  'SUSHI',
  'CHINESE',
  'SEAFOOD',
  'HOT POT',
  'BBQ',
  'NOODLE',
  'DINER',
  'TAQUERIA',
  'PIZZA',
  'WOK',
  'HUT',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '../../.env.local');
    if (!fs.existsSync(envPath)) return;
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    });
  } catch (error) {
    console.warn('Warning: failed to load .env.local:', error.message);
  }
}

function stripAccents(value) {
  return (value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeText(value) {
  const upper = stripAccents(value).toUpperCase().replace(/[^\w\s]/g, ' ');
  const tokens = upper.split(/\s+/).filter(Boolean).map((token) => SUFFIX_MAP[token] || token);
  return tokens.join(' ');
}

function parseAddress(fullAddress) {
  const normalized = normalizeText(fullAddress);
  const tokens = normalized.split(' ').filter(Boolean);
  const number = tokens[0] && /^\d+[A-Z]?$/.test(tokens[0]) ? tokens[0] : '';
  const core = [];
  for (let i = number ? 1 : 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (['SUITE', 'STE', 'UNIT', 'APT'].includes(token)) break;
    if (/^[A-Z]?\d+[A-Z]*$/.test(token) && core.length > 0) break;
    if (['ST', 'AVE', 'BLVD', 'RD', 'HWY', 'DR', 'LN'].includes(token)) break;
    core.push(token);
  }
  return { number, core: core.join(' '), coreTokens: core };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 20;
  return { write, limit: Number.isFinite(limit) && limit > 0 ? limit : 20 };
}

function ckanRequest(resourceId, q) {
  return new Promise((resolve, reject) => {
    const requestUrl = new URL(CKAN_URL);
    requestUrl.searchParams.set('resource_id', resourceId);
    requestUrl.searchParams.set('q', q);
    requestUrl.searchParams.set('limit', String(QUERY_LIMIT));

    const req = https.get(
      requestUrl,
      { timeout: REQUEST_TIMEOUT_MS },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.success) {
              reject(new Error(`CKAN success=false for query "${q}"`));
              return;
            }
            resolve(parsed.result?.records || []);
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${error.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

function strictAddressMatch(record, buffetAddress) {
  const recordNum = String(record.FacilityStreetNumber || '').trim();
  const recordStreet = normalizeText(record.FacilityStreet || record.FacilityFullStreetAddress || '');
  if (!buffetAddress.number || !recordNum || buffetAddress.number !== recordNum) return false;
  if (buffetAddress.coreTokens.length === 0) return false;
  return buffetAddress.coreTokens.slice(0, 2).every((token) => recordStreet.includes(token));
}

function strictViolationAddressMatch(record, buffetAddress) {
  const address = normalizeText(record.ADDRESS || '');
  if (!buffetAddress.number || !address.includes(buffetAddress.number)) return false;
  if (buffetAddress.coreTokens.length === 0) return false;
  return buffetAddress.coreTokens.slice(0, 2).every((token) => address.includes(token));
}

function looksFoodRelated(name, facilityType) {
  const haystack = `${normalizeText(name)} ${normalizeText(facilityType)}`;
  return FOOD_HINT_TOKENS.some((token) => haystack.includes(token));
}

function parseDate(value) {
  return value ? new Date(value).getTime() : 0;
}

function classifyComposite(primaryFacility, violationCount) {
  if (!primaryFacility) {
    return {
      status: 'INSUFFICIENT_DATA',
      comment: 'No strict same-address Houston inspection records found in FY11-FY15 datasets.',
    };
  }

  const latestStatus = String(primaryFacility.latestStatus || '').toUpperCase();
  const scoreNum = Number(primaryFacility.latestScore);
  const score = Number.isFinite(scoreNum) ? scoreNum : null;

  if (latestStatus !== 'PASS') {
    return {
      status: 'WOULDNT_RECOMMEND',
      comment: `Latest same-address inspection is ${latestStatus || 'UNKNOWN'} at ${primaryFacility.latestDate || 'unknown date'}.`,
    };
  }

  if (score === 1 && violationCount <= 20) {
    return {
      status: 'SAFE',
      comment: `Latest same-address inspection PASS with score 1 (${primaryFacility.latestDate || 'unknown date'}); low historical violations (${violationCount}) in FY12-FY14.`,
    };
  }

  if ((score === 1 || score === 2) && violationCount <= 60) {
    return {
      status: 'SOME_INFRACTIONS',
      comment: `Latest same-address inspection PASS with score ${score ?? 'unknown'} (${primaryFacility.latestDate || 'unknown date'}); notable historical violations (${violationCount}) in FY12-FY14.`,
    };
  }

  return {
    status: 'WOULDNT_RECOMMEND',
    comment: `Latest same-address inspection PASS with score ${score ?? 'unknown'} but high violation history (${violationCount}) in FY12-FY14.`,
  };
}

async function gatherInspectionFacilities(buffet) {
  const queries = new Set();
  const parsed = parseAddress(buffet.address.full || buffet.address.street || '');
  const firstCore = parsed.coreTokens[0] || '';
  queries.add(buffet.name);
  if (buffet.name.split(/\s+/)[0]) queries.add(buffet.name.split(/\s+/)[0]);
  if (parsed.number && firstCore) queries.add(`${parsed.number} ${firstCore}`);

  const agg = new Map();
  const errors = [];

  for (const query of queries) {
    for (const [dataset, resourceId] of Object.entries(INSPECTION_DATASETS)) {
      try {
        const records = await ckanRequest(resourceId, query);
        for (const record of records) {
          if (!strictAddressMatch(record, parsed)) continue;
          const zip = String(record.FacilityZip || '').trim();
          if (buffet.address.postalCode && zip && zip !== buffet.address.postalCode) continue;

          const name = String(record.FacilityName || '').trim().toUpperCase();
          if (!looksFoodRelated(name, `${record.Cuisine || ''} ${record.EstablishmentType || ''}`)) continue;
          const address = String(record.FacilityFullStreetAddress || '').trim().toUpperCase();
          const key = `${name}||${address}||${zip}`;
          const existing = agg.get(key) || {
            name,
            address,
            zip,
            records: 0,
            latestDate: '',
            latestStatus: '',
            latestScore: '',
            datasets: new Set(),
          };
          existing.records += 1;
          existing.datasets.add(dataset);
          const date = String(record.InspectionDate || '');
          if (parseDate(date) >= parseDate(existing.latestDate)) {
            existing.latestDate = date;
            existing.latestStatus = String(record.InspectionStatus || '');
            existing.latestScore = String(record.InspectionScore || '');
          }
          agg.set(key, existing);
        }
      } catch (error) {
        errors.push(`${dataset}/${query}: ${error.message}`);
      }
      await sleep(API_SLEEP_MS);
    }
  }

  const facilities = Array.from(agg.values()).sort((a, b) => {
    const dateDiff = parseDate(b.latestDate) - parseDate(a.latestDate);
    if (dateDiff !== 0) return dateDiff;
    return b.records - a.records;
  });
  return { facilities, errors };
}

async function gatherLastFacilityFallback(buffet) {
  const parsed = parseAddress(buffet.address.full || buffet.address.street || '');
  const firstCore = parsed.coreTokens[0] || '';
  const query = `${parsed.number} ${firstCore}`.trim();
  if (!query) return { facilities: [], errors: [] };

  const agg = new Map();
  const errors = [];
  try {
    const records = await ckanRequest(LAST_FACILITY_DATASET, query);
    for (const record of records) {
      const recNum = String(record['ST. NUM.'] || '').trim();
      const recStreet = normalizeText(record['ST. NAME'] || '');
      if (!parsed.number || recNum !== parsed.number) continue;
      if (!parsed.coreTokens.slice(0, 2).every((tok) => recStreet.includes(tok))) continue;

      const zip = String(record.ZIP || '').trim();
      if (buffet.address.postalCode && zip && zip !== buffet.address.postalCode) continue;

      const name = String(record.NAME || '').trim().toUpperCase();
      const facilityType = String(record['FACILITY TYPE'] || '').trim();
      if (!looksFoodRelated(name, facilityType)) continue;
      const address = `${record['ST. NUM.'] || ''} ${record['ST. NAME'] || ''}`.trim().toUpperCase();
      const key = `${name}||${address}||${zip}`;
      const existing = agg.get(key) || {
        name,
        address,
        zip,
        records: 0,
        latestDate: '',
        latestStatus: '',
        latestScore: '',
        datasets: new Set(),
      };
      existing.records += 1;
      existing.datasets.add('LAST_2015');
      const date = String(record['INSPECTION DATE'] || '');
      if (parseDate(date) >= parseDate(existing.latestDate)) {
        existing.latestDate = date;
        existing.latestScore = String(record.SCORE || '');
        const score = Number(record.SCORE);
        if (Number.isFinite(score)) existing.latestStatus = score <= 2 ? 'PASS' : 'REVIEW';
      }
      agg.set(key, existing);
    }
  } catch (error) {
    errors.push(`LAST_2015/${query}: ${error.message}`);
  }
  await sleep(API_SLEEP_MS);

  const facilities = Array.from(agg.values()).sort((a, b) => {
    const dateDiff = parseDate(b.latestDate) - parseDate(a.latestDate);
    if (dateDiff !== 0) return dateDiff;
    return b.records - a.records;
  });
  return { facilities, errors };
}

async function gatherViolationStats(buffet) {
  const parsed = parseAddress(buffet.address.full || buffet.address.street || '');
  const firstCore = parsed.coreTokens[0] || '';
  const query = `${parsed.number} ${firstCore}`.trim();
  if (!query) return { count: 0, latestDate: '', samples: [], errors: [] };

  let count = 0;
  let latestDate = '';
  const samples = [];
  const errors = [];

  for (const [dataset, resourceId] of Object.entries(VIOLATION_DATASETS)) {
    try {
      const records = await ckanRequest(resourceId, query);
      for (const record of records) {
        if (!strictViolationAddressMatch(record, parsed)) continue;
        count += 1;
        const inspectionDate = String(record['INSPECTION DATE'] || '');
        if (parseDate(inspectionDate) >= parseDate(latestDate)) latestDate = inspectionDate;
        if (samples.length < 2) {
          samples.push({
            dataset,
            date: inspectionDate,
            facilityName: String(record['FACILITY NAME'] || ''),
            code: String(record['VIOLATION CODE'] || ''),
            comment: String(record['VIOLATION COMMENTS'] || '').slice(0, 120),
          });
        }
      }
    } catch (error) {
      errors.push(`${dataset}/${query}: ${error.message}`);
    }
    await sleep(API_SLEEP_MS);
  }

  return { count, latestDate, samples, errors };
}

function getHoustonBuffets(limit) {
  const byCityPath = path.join(__dirname, '../../data/buffets-by-city.json');
  const cityData = JSON.parse(fs.readFileSync(byCityPath, 'utf8'));
  const houston = cityData['houston-tx'];
  if (!houston || !Array.isArray(houston.buffets)) {
    throw new Error('Houston buffets not found in data/buffets-by-city.json');
  }
  return houston.buffets.slice(0, limit);
}

function createDbClient() {
  loadEnv();
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) throw new Error('INSTANT_ADMIN_TOKEN is required for --write mode');
  return init({ appId, adminToken, schema: schema.default || schema });
}

function updateBuffetDirectAPI(buffetId, healthPayload) {
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      type: 'tx',
      steps: [
        {
          type: 'update',
          entity: 'buffets',
          id: buffetId,
          attrs: {
            healthInspection: JSON.stringify(healthPayload),
          },
        },
      ],
    });
    const req = https.request(
      {
        hostname: 'api.instantdb.com',
        path: '/admin/tx',
        method: 'POST',
        headers: {
          'app-id': appId,
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode === 200) resolve();
          else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function writePassedToDb(results) {
  const db = createDbClient();
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const result of results) {
    if (!WRITE_STATUSES.has(result.status)) {
      skipped += 1;
      continue;
    }
    try {
      const queryResult = await db.query({
        buffets: {
          $: {
            where: { placeId: result.placeId },
            limit: 1,
          },
        },
      });
      const buffet = queryResult.buffets?.[0];
      if (!buffet) {
        console.log(`  - DB skip (not found): ${result.name}`);
        skipped += 1;
        continue;
      }

      const payload = {
        dataSource: 'Houston CKAN FY11-FY15 + Violations FY12-FY14',
        generatedAt: new Date().toISOString(),
        safetyComposite: result.status,
        safetyComment: result.comment,
        matchedFacility: result.primaryFacility ? {
          name: result.primaryFacility.name,
          address: result.primaryFacility.address,
          zip: result.primaryFacility.zip,
          latestDate: result.primaryFacility.latestDate,
          latestStatus: result.primaryFacility.latestStatus,
          latestScore: result.primaryFacility.latestScore,
          datasets: Array.from(result.primaryFacility.datasets || []),
          records: result.primaryFacility.records,
        } : null,
        violationSummary: {
          countFY12toFY14: result.violationsCount,
          latestDate: result.violationsLatestDate,
          samples: result.violationSamples,
        },
      };

      await updateBuffetDirectAPI(buffet.id, payload);
      updated += 1;
      console.log(`  - DB updated: ${result.name} (${result.status})`);
    } catch (error) {
      errors += 1;
      console.log(`  - DB error: ${result.name}: ${error.message}`);
    }
  }

  return { updated, skipped, errors };
}

async function main() {
  const { write, limit } = parseArgs();
  const mode = write ? 'WRITE' : 'DRY_RUN';

  console.log('='.repeat(90));
  console.log(`Houston Safety Composite | Mode: ${mode} | Limit: ${limit}`);
  console.log('='.repeat(90));

  const buffets = getHoustonBuffets(limit);
  console.log(`Loaded ${buffets.length} Houston buffets.\n`);

  const results = [];

  for (const buffet of buffets) {
    const parsed = parseAddress(buffet.address.full || buffet.address.street || '');
    process.stdout.write(`Processing: ${buffet.name} ... `);

    const inspections = await gatherInspectionFacilities(buffet);
    const fallback = inspections.facilities.length === 0
      ? await gatherLastFacilityFallback(buffet)
      : { facilities: [], errors: [] };
    const violations = await gatherViolationStats(buffet);
    const primaryFacility = inspections.facilities[0] || fallback.facilities[0] || null;
    const classification = classifyComposite(primaryFacility, violations.count);

    const result = {
      id: buffet.id,
      placeId: buffet.placeId || buffet.id,
      name: buffet.name,
      address: buffet.address.full,
      parsedAddress: parsed,
      status: classification.status,
      comment: classification.comment,
      primaryFacility,
      violationsCount: violations.count,
      violationsLatestDate: violations.latestDate,
      violationSamples: violations.samples,
      apiErrors: [...inspections.errors, ...fallback.errors, ...violations.errors],
    };
    results.push(result);
    console.log(`${result.status}`);
  }

  const passed = results.filter((r) => WRITE_STATUSES.has(r.status));
  const safe = results.filter((r) => r.status === 'SAFE').length;
  const some = results.filter((r) => r.status === 'SOME_INFRACTIONS').length;
  const reject = results.filter((r) => r.status === 'WOULDNT_RECOMMEND').length;
  const noData = results.filter((r) => r.status === 'INSUFFICIENT_DATA').length;

  console.log('\n' + '-'.repeat(90));
  console.log('Dry-Run Summary');
  console.log('-'.repeat(90));
  console.log(`SAFE: ${safe}`);
  console.log(`SOME_INFRACTIONS: ${some}`);
  console.log(`WOULDNT_RECOMMEND: ${reject}`);
  console.log(`INSUFFICIENT_DATA: ${noData}`);
  console.log(`PASS FILTER (safe + some): ${passed.length}/${results.length}`);

  console.log('\nPassed Buffets (eligible for DB write):');
  if (passed.length === 0) {
    console.log('  (none)');
  } else {
    passed.forEach((r, idx) => {
      console.log(
        `  ${idx + 1}. ${r.name} | ${r.status} | ${r.primaryFacility?.name || 'N/A'} | violations=${r.violationsCount}`
      );
      console.log(`     ${r.comment}`);
    });
  }

  if (write) {
    console.log('\nWriting eligible records to DB...');
    const dbResult = await writePassedToDb(results);
    console.log(`DB updated=${dbResult.updated}, skipped=${dbResult.skipped}, errors=${dbResult.errors}`);
  } else {
    console.log('\nDB write skipped (dry run). Use --write to persist SAFE/SOME_INFRACTIONS records.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
