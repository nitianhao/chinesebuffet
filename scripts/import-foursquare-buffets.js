/*
 * Import new Chinese buffets from Foursquare into InstantDB.
 *
 * Default mode is --dry-run (safe).
 * Use --commit to write new records.
 *
 * Conservative mode behavior:
 * - source candidates from Foursquare Places Search
 * - dedupe against ALL existing buffets in InstantDB
 * - require strong Chinese + buffet confidence signals
 * - reject ambiguous matches into a review file
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { init, id } = require('@instantdb/admin');
const schema = require('../src/instant.schema.ts');
const { normalizeSearchText } = require('./lib/normalizeSearchText');

const DEFAULTS = {
  mode: 'conservative',
  citySource: 'csv',
  commit: false,
  cityLimit: 100,
  state: null,
  city: null,
  maxPerQuery: 50,
  maxOffsets: 3,
  checkpointPath: path.join(__dirname, '..', 'data', 'foursquare-import-checkpoint.json'),
  reportPath: path.join(__dirname, '..', 'data', 'foursquare-import-report.json'),
  candidatesPath: path.join(__dirname, '..', 'data', 'foursquare-candidates.json'),
  rejectedPath: path.join(__dirname, '..', 'data', 'foursquare-rejected.json'),
  csvPath: path.join(__dirname, '..', 'Research', 'us_cities_over_100k_2024_census_estimates.csv'),
  dryRun: true,
  resetCheckpoint: false,
  placesApiVersion: '2025-06-17',
};

const SEARCH_QUERIES = [
  'chinese buffet',
  'chinese all you can eat',
  'asian buffet',
];

const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR',
  California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE',
  Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID',
  Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
  Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS',
  Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK',
  Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
  Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
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
    } else if (arg === '--city-source' && next) {
      const source = next.trim().toLowerCase();
      if (source === 'csv' || source === 'db') {
        opts.citySource = source;
      }
      i += 1;
    } else if (arg === '--dry-run') {
      opts.commit = false;
      opts.dryRun = true;
    } else if (arg === '--state' && next) {
      opts.state = next.trim();
      i += 1;
    } else if (arg === '--city' && next) {
      opts.city = next.trim();
      i += 1;
    } else if (arg === '--city-limit' && next) {
      opts.cityLimit = Math.max(1, Number(next) || DEFAULTS.cityLimit);
      i += 1;
    } else if (arg === '--max-per-query' && next) {
      opts.maxPerQuery = Math.min(50, Math.max(1, Number(next) || DEFAULTS.maxPerQuery));
      i += 1;
    } else if (arg === '--max-offsets' && next) {
      opts.maxOffsets = Math.max(1, Number(next) || DEFAULTS.maxOffsets);
      i += 1;
    } else if (arg === '--checkpoint' && next) {
      opts.checkpointPath = path.resolve(next);
      i += 1;
    } else if (arg === '--report' && next) {
      opts.reportPath = path.resolve(next);
      i += 1;
    } else if (arg === '--candidates' && next) {
      opts.candidatesPath = path.resolve(next);
      i += 1;
    } else if (arg === '--rejected' && next) {
      opts.rejectedPath = path.resolve(next);
      i += 1;
    } else if (arg === '--reset-checkpoint') {
      opts.resetCheckpoint = true;
    } else if (arg === '--places-api-version' && next) {
      opts.placesApiVersion = next.trim();
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
  node scripts/import-foursquare-buffets.js [options]

Options:
  --dry-run               Run without writing to DB (default)
  --commit                Write accepted new buffets to DB
  --city-source <csv|db>  Source city list from CSV or InstantDB cities table (default: csv)
  --state <value>         Limit run to one state (name or abbreviation)
  --city <value>          Limit run to one city name (optionally with --state)
  --city-limit <n>        Number of cities to process (default: 100)
  --max-per-query <n>     Foursquare page size per call (max 50, default: 50)
  --max-offsets <n>       Offsets per query (default: 3)
  --checkpoint <path>     Checkpoint JSON path
  --report <path>         Summary report path
  --candidates <path>     Accepted candidate JSON path
  --rejected <path>       Rejected candidate JSON path
  --reset-checkpoint      Start from scratch and ignore existing checkpoint
  --places-api-version    Foursquare Places API version header (default: 2025-06-17)
  -h, --help              Show this message
`);
  process.exit(0);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function normalizeState(state) {
  if (!state) return '';
  const raw = String(state).trim();
  if (!raw) return '';
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_ABBR[raw] || raw.toUpperCase();
}

function generateSlug(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeStreet(street) {
  return normalizeSearchText(String(street || ''))
    .replace(/\b(street|st)\b/g, 'st')
    .replace(/\b(avenue|ave)\b/g, 'ave')
    .replace(/\b(road|rd)\b/g, 'rd')
    .replace(/\b(boulevard|blvd)\b/g, 'blvd')
    .replace(/\b(drive|dr)\b/g, 'dr')
    .replace(/\b(lane|ln)\b/g, 'ln')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

function normalizeDomain(website) {
  if (!website) return '';
  try {
    const parsed = new URL(website.startsWith('http') ? website : `https://${website}`);
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch (err) {
    return '';
  }
}

function normalizeAddressFingerprint({ name, street, city, stateAbbr }) {
  return [
    normalizeSearchText(name),
    normalizeStreet(street),
    normalizeSearchText(city),
    normalizeSearchText(stateAbbr),
  ].join('|');
}

function tokenize(value) {
  return normalizeSearchText(value)
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

function jaccardSimilarity(a, b) {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));

  if (!aSet.size && !bSet.size) return 1;
  if (!aSet.size || !bSet.size) return 0;

  let intersection = 0;
  for (const token of aSet) {
    if (bSet.has(token)) intersection += 1;
  }
  const union = new Set([...aSet, ...bSet]).size;
  return union ? intersection / union : 0;
}

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number' || Number.isNaN(v))) {
    return Number.POSITIVE_INFINITY;
  }

  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function loadCities(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Cities CSV not found: ${csvPath}`);
  }

  const rows = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1);
  const cities = [];

  rows.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const parts = trimmed.split(',');
    if (parts.length < 3) return;

    const rank = Number(parts[0]) || index + 1;
    const city = (parts[1] || '').trim();
    const state = (parts[2] || '').trim();

    // Handles both CSV layouts:
    // 1) rank,city,state,stateAbbr,population
    // 2) rank,city,state,population
    const fourth = (parts[3] || '').trim();
    const fifth = (parts[4] || '').trim();
    const hasStateAbbrColumn = /^[A-Za-z]{2}$/.test(fourth);
    const stateAbbr = normalizeState(hasStateAbbrColumn ? fourth : state);
    const population = Number(hasStateAbbrColumn ? fifth : fourth) || 0;

    if (!city || !stateAbbr) return;

    cities.push({
      rank,
      city,
      state,
      stateAbbr,
      population,
      key: `${normalizeSearchText(city)}|${stateAbbr}`,
    });
  });

  return cities.sort((a, b) => a.rank - b.rank);
}

function loadCitiesFromDbRows(cityRows) {
  const seen = new Set();
  const out = [];

  const sorted = [...cityRows].sort((a, b) => {
    const ar = Number(a.rank) || Number.POSITIVE_INFINITY;
    const br = Number(b.rank) || Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return String(a.city || '').localeCompare(String(b.city || ''));
  });

  for (const row of sorted) {
    const city = String(row.city || '').trim();
    const state = String(row.state || '').trim();
    const stateAbbr = normalizeState(row.stateAbbr || row.state || '');
    if (!city || !stateAbbr) continue;
    const key = `${normalizeSearchText(city)}|${stateAbbr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rank: Number(row.rank) || 9999,
      city,
      state,
      stateAbbr,
      population: Number(row.population) || 0,
      key,
    });
  }

  return out;
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
          const err = new Error(`Foursquare API error (${res.statusCode}): ${apiMsg}`);
          err.statusCode = res.statusCode;
          err.apiBody = parsed;
          reject(err);
          return;
        }

        resolve(parsed);
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function fetchFoursquarePage({ apiKey, near, query, limit, offset }) {
  const endpoint = new URL('https://api.foursquare.com/v3/places/search');
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('near', near);
  endpoint.searchParams.set('limit', String(limit));
  endpoint.searchParams.set('offset', String(offset));
  endpoint.searchParams.set(
    'fields',
    [
      'fsq_id',
      'name',
      'location',
      'geocodes',
      'categories',
      'tel',
      'website',
      'rating',
      'hours',
      'closed_bucket',
      'price',
    ].join(',')
  );

  return requestJson(endpoint.toString(), {
    Accept: 'application/json',
    Authorization: apiKey,
  });
}

async function fetchFoursquarePageNew({ serviceKey, near, query, limit, offset, placesApiVersion }) {
  const endpoint = new URL('https://places-api.foursquare.com/places/search');
  endpoint.searchParams.set('query', query);
  endpoint.searchParams.set('near', near);
  endpoint.searchParams.set('limit', String(limit));
  endpoint.searchParams.set('offset', String(offset));

  return requestJson(endpoint.toString(), {
    Accept: 'application/json',
    Authorization: `Bearer ${serviceKey}`,
    'X-Places-Api-Version': placesApiVersion,
  });
}

async function fetchFoursquareCandidates({
  apiKey,
  serviceKey,
  city,
  stateAbbr,
  maxPerQuery,
  maxOffsets,
  placesApiVersion,
}) {
  const near = `${city}, ${stateAbbr}`;
  const seen = new Set();
  const candidates = [];

  for (const query of SEARCH_QUERIES) {
    for (let offsetIndex = 0; offsetIndex < maxOffsets; offsetIndex += 1) {
      const offset = offsetIndex * maxPerQuery;
      let response;
      if (serviceKey) {
        response = await fetchFoursquarePageNew({
          serviceKey,
          near,
          query,
          limit: maxPerQuery,
          offset,
          placesApiVersion,
        });
      } else {
        response = await fetchFoursquarePage({
          apiKey,
          near,
          query,
          limit: maxPerQuery,
          offset,
        });
      }

      const results = Array.isArray(response?.results) ? response.results : [];
      if (!results.length) break;

      for (const item of results) {
        const fsqId = item?.fsq_place_id || item?.fsq_id;
        if (!fsqId || seen.has(fsqId)) continue;
        seen.add(fsqId);
        candidates.push(item);
      }

      if (results.length < maxPerQuery) break;
    }
  }

  return candidates;
}

function flattenCategoryNames(categories) {
  if (!Array.isArray(categories)) return [];
  const names = [];
  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    if (cat.name) names.push(String(cat.name));
    if (cat.short_name) names.push(String(cat.short_name));
    if (cat.plural_name) names.push(String(cat.plural_name));
  }
  return names;
}

function hasChineseSignal(name, categories) {
  const haystack = `${name || ''} ${categories.join(' ')}`.toLowerCase();
  return /\b(chinese|sichuan|szechuan|cantonese|dim sum|mandarin|asian)\b/.test(haystack);
}

function hasBuffetSignal(name, categories) {
  const haystack = `${name || ''} ${categories.join(' ')}`.toLowerCase();
  return /\b(buffet|all you can eat|all-you-can-eat|ayce)\b/.test(haystack);
}

function isLikelyClosed(item) {
  const closedBucket = String(item?.closed_bucket || '').toLowerCase();
  if (closedBucket.includes('closed')) return true;
  if (item?.date_closed) return true;

  const popular = item?.hours?.display;
  if (typeof popular === 'string' && /permanently closed/i.test(popular)) {
    return true;
  }

  return false;
}

function transformFoursquareItem(item, cityHint, stateAbbrHint) {
  const location = item?.location || {};
  const geocodes = item?.geocodes?.main || {};
  const categories = flattenCategoryNames(item?.categories || []);
  const rawPrice = item?.price;
  let normalizedPrice;
  if (typeof rawPrice === 'number' && Number.isFinite(rawPrice) && rawPrice > 0) {
    normalizedPrice = '$'.repeat(Math.max(1, Math.min(4, Math.round(rawPrice))));
  } else if (typeof rawPrice === 'string' && rawPrice.trim()) {
    normalizedPrice = rawPrice.trim();
  }

  const street =
    location.address ||
    [location.address, location.cross_street].filter(Boolean).join(' ').trim() ||
    '';

  const city = location.locality || cityHint || '';
  const stateAbbr = normalizeState(location.region || stateAbbrHint || '');
  const postalCode = location.postcode || '';

  return {
    source: 'foursquare',
    foursquareId: item?.fsq_place_id || item?.fsq_id || '',
    name: item?.name || '',
    searchName: normalizeSearchText(item?.name || ''),
    street,
    cityName: city,
    state: stateAbbr,
    stateAbbr,
    postalCode,
    address: location.formatted_address || [street, city, stateAbbr, postalCode].filter(Boolean).join(', '),
    lat: Number(item?.latitude) || Number(geocodes.latitude) || 0,
    lng: Number(item?.longitude) || Number(geocodes.longitude) || 0,
    phone: item?.tel || undefined,
    website: item?.website || undefined,
    rating: typeof item?.rating === 'number' ? item.rating : undefined,
    categories,
    categoryName: categories[0] || undefined,
    hours: item?.hours ? JSON.stringify(item.hours) : undefined,
    permanentlyClosed: false,
    temporarilyClosed: false,
    placeId: undefined,
    price: normalizedPrice,
    reviewsCount: undefined,
    neighborhood: undefined,
    imagesCount: undefined,
    scrapedAt: new Date().toISOString(),
  };
}

async function loadAllExistingBuffets(db) {
  const limit = 1000;
  let offset = 0;
  const rows = [];

  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit,
          offset,
        },
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

async function loadAllCities(db) {
  const limit = 1000;
  let offset = 0;
  const rows = [];

  while (true) {
    const result = await db.query({
      cities: {
        $: {
          limit,
          offset,
        },
      },
    });

    const batch = result?.cities || [];
    if (!batch.length) break;

    rows.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  return rows;
}

function buildExistingIndex(existingBuffets) {
  const existingPlaceIds = new Set();
  const existingSlugs = new Set();
  const existingFingerprints = new Set();
  const phoneToIds = new Map();
  const domainToIds = new Map();

  const rows = existingBuffets.map((b) => {
    const stateAbbr = normalizeState(b.stateAbbr || b.state || '');
    const row = {
      id: b.id,
      name: b.name || '',
      slug: b.slug || '',
      street: b.street || '',
      cityName: b.cityName || '',
      stateAbbr,
      lat: Number(b.lat) || 0,
      lng: Number(b.lng) || 0,
      phone: normalizePhone(b.phone || b.phoneUnformatted || ''),
      websiteDomain: normalizeDomain(b.website || ''),
      placeId: b.placeId || '',
      fingerprint: normalizeAddressFingerprint({
        name: b.name || '',
        street: b.street || '',
        city: b.cityName || '',
        stateAbbr,
      }),
    };

    if (row.placeId) existingPlaceIds.add(row.placeId);
    if (row.slug) existingSlugs.add(row.slug);
    if (row.fingerprint) existingFingerprints.add(row.fingerprint);

    if (row.phone) {
      if (!phoneToIds.has(row.phone)) phoneToIds.set(row.phone, new Set());
      phoneToIds.get(row.phone).add(row.id);
    }

    if (row.websiteDomain) {
      if (!domainToIds.has(row.websiteDomain)) domainToIds.set(row.websiteDomain, new Set());
      domainToIds.get(row.websiteDomain).add(row.id);
    }

    return row;
  });

  return {
    rows,
    existingPlaceIds,
    existingSlugs,
    existingFingerprints,
    phoneToIds,
    domainToIds,
  };
}

function conservativeQualityGate(normalized) {
  const chineseSignal = hasChineseSignal(normalized.name, normalized.categories || []);
  const buffetSignal = hasBuffetSignal(normalized.name, normalized.categories || []);

  if (isLikelyClosed(normalized._raw)) {
    return { accepted: false, reason: 'closed_or_inactive' };
  }

  if (!chineseSignal || !buffetSignal) {
    return { accepted: false, reason: 'low_confidence_not_clear_chinese_buffet' };
  }

  if (!normalized.name || !normalized.cityName || !normalized.stateAbbr) {
    return { accepted: false, reason: 'missing_core_fields' };
  }

  return { accepted: true, reason: 'high_confidence_chinese_buffet' };
}

function conservativeDedupe(normalized, index) {
  const fingerprint = normalizeAddressFingerprint({
    name: normalized.name,
    street: normalized.street,
    city: normalized.cityName,
    stateAbbr: normalized.stateAbbr,
  });

  if (fingerprint && index.existingFingerprints.has(fingerprint)) {
    return { duplicate: true, reason: 'exact_name_address_city_state_match' };
  }

  const phone = normalizePhone(normalized.phone || '');
  if (phone && index.phoneToIds.has(phone)) {
    return { duplicate: true, reason: 'phone_match_existing' };
  }

  const websiteDomain = normalizeDomain(normalized.website || '');
  if (websiteDomain && index.domainToIds.has(websiteDomain)) {
    return { duplicate: true, reason: 'website_domain_match_existing' };
  }

  const candidateHasCoords = typeof normalized.lat === 'number' && typeof normalized.lng === 'number' && normalized.lat !== 0 && normalized.lng !== 0;

  if (candidateHasCoords) {
    for (const existing of index.rows) {
      if (!existing.lat || !existing.lng) continue;

      const distanceMeters = haversineMeters(normalized.lat, normalized.lng, existing.lat, existing.lng);
      if (!Number.isFinite(distanceMeters)) continue;

      const nameSim = jaccardSimilarity(normalized.name, existing.name);

      if (distanceMeters <= 120 && nameSim >= 0.88) {
        return {
          duplicate: true,
          reason: 'geo_name_match_120m_high_similarity',
          details: { distanceMeters: Math.round(distanceMeters), nameSimilarity: Number(nameSim.toFixed(3)) },
        };
      }

      if (distanceMeters <= 60 && nameSim >= 0.75) {
        return {
          duplicate: true,
          reason: 'geo_name_match_60m_medium_similarity',
          details: { distanceMeters: Math.round(distanceMeters), nameSimilarity: Number(nameSim.toFixed(3)) },
        };
      }
    }
  }

  return { duplicate: false, reason: 'no_duplicate_signals' };
}

function buildSlug(baseName, stateAbbr, existingSlugs) {
  const base = generateSlug(baseName || 'buffet');
  const stateSuffix = generateSlug(stateAbbr || 'xx');
  let candidate = `${base}-${stateSuffix}`;

  if (!existingSlugs.has(candidate)) return candidate;

  let n = 2;
  while (existingSlugs.has(`${candidate}-${n}`)) {
    n += 1;
  }
  return `${candidate}-${n}`;
}

function findOrCreateCityTx({ db, cityStateKey, cityName, stateAbbr, cityMaps, cityTxs }) {
  if (cityMaps.cityKeyToId.has(cityStateKey)) {
    return cityMaps.cityKeyToId.get(cityStateKey);
  }

  const citySlug = `${generateSlug(cityName)}-${generateSlug(stateAbbr)}`;

  if (cityMaps.citySlugToId.has(citySlug)) {
    const cityId = cityMaps.citySlugToId.get(citySlug);
    cityMaps.cityKeyToId.set(cityStateKey, cityId);
    return cityId;
  }

  const cityId = id();
  cityMaps.citySlugToId.set(citySlug, cityId);
  cityMaps.cityKeyToId.set(cityStateKey, cityId);

  cityTxs.push(
    db.tx.cities[cityId].create({
      rank: 9999,
      city: cityName,
      state: stateAbbr,
      stateAbbr,
      population: 0,
      slug: citySlug,
      searchName: normalizeSearchText(cityName),
    })
  );

  return cityId;
}

function buildCityMaps(existingCities) {
  const citySlugToId = new Map();
  const cityKeyToId = new Map();

  for (const city of existingCities) {
    const stateAbbr = normalizeState(city.stateAbbr || city.state || '');
    const key = `${normalizeSearchText(city.city || '')}|${stateAbbr}`;
    if (city.slug) citySlugToId.set(city.slug, city.id);
    cityKeyToId.set(key, city.id);
  }

  return { citySlugToId, cityKeyToId };
}

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));

  const apiKey = process.env.FOURSQUARE_API_KEY;
  const serviceKey = process.env.FOURSQUARE_SERVICE_KEY;
  if (!apiKey && !serviceKey) {
    throw new Error('FOURSQUARE_SERVICE_KEY or FOURSQUARE_API_KEY is required in .env.local or environment.');
  }

  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required in .env.local or environment.');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });

  const checkpoint = opts.resetCheckpoint
    ? { processedCityKeys: [] }
    : readJson(opts.checkpointPath, { processedCityKeys: [] });
  const processed = new Set(checkpoint.processedCityKeys || []);

  const [existingBuffets, existingCities] = await Promise.all([
    loadAllExistingBuffets(db),
    loadAllCities(db),
  ]);

  const sourceCities = opts.citySource === 'db'
    ? loadCitiesFromDbRows(existingCities)
    : loadCities(opts.csvPath);

  const cities = sourceCities
    .filter((c) => {
      if (opts.state) {
        const wantedState = normalizeState(opts.state);
        if (c.stateAbbr !== wantedState && normalizeSearchText(c.state) !== normalizeSearchText(opts.state)) {
          return false;
        }
      }
      if (opts.city && normalizeSearchText(c.city) !== normalizeSearchText(opts.city)) {
        return false;
      }
      return true;
    })
    .slice(0, opts.cityLimit);

  console.log(`Mode: ${opts.mode}`);
  console.log(`Write mode: ${opts.commit ? 'COMMIT' : 'DRY-RUN'}`);
  console.log(`Foursquare auth mode: ${serviceKey ? 'service_key (new API)' : 'api_key (legacy v3 API)'}`);
  console.log(`City source: ${opts.citySource}`);
  console.log(`Cities selected: ${cities.length}`);

  const index = buildExistingIndex(existingBuffets);
  const cityMaps = buildCityMaps(existingCities);

  console.log(`Loaded existing buffets from DB: ${existingBuffets.length}`);
  console.log(`Loaded existing cities from DB: ${existingCities.length}`);

  const accepted = [];
  const rejected = [];
  const skippedDuplicates = [];
  const fetchedRawCountByCity = [];

  for (const city of cities) {
    const cityKey = city.key;

    if (processed.has(cityKey)) {
      console.log(`Skipping already processed city: ${city.city}, ${city.stateAbbr}`);
      continue;
    }

    console.log(`\nFetching Foursquare candidates for ${city.city}, ${city.stateAbbr}...`);

    let raw;
    try {
      raw = await fetchFoursquareCandidates({
        apiKey,
        serviceKey,
        city: city.city,
        stateAbbr: city.stateAbbr,
        maxPerQuery: opts.maxPerQuery,
        maxOffsets: opts.maxOffsets,
        placesApiVersion: opts.placesApiVersion,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!serviceKey && err?.statusCode === 410) {
        console.error('  Legacy V3 endpoint is unsupported for this key.');
        console.error('  Add FOURSQUARE_SERVICE_KEY to .env.local and rerun (new Places API).');
      }
      console.error(`  Error fetching city ${city.city}, ${city.stateAbbr}: ${message}`);
      rejected.push({
        city: city.city,
        stateAbbr: city.stateAbbr,
        reason: !serviceKey && err?.statusCode === 410
          ? 'legacy_endpoint_unsupported_needs_service_key'
          : 'api_error',
        details: message,
      });
      continue;
    }

    fetchedRawCountByCity.push({ city: city.city, stateAbbr: city.stateAbbr, fetched: raw.length });
    console.log(`  Fetched raw candidates: ${raw.length}`);

    for (const item of raw) {
      const normalized = transformFoursquareItem(item, city.city, city.stateAbbr);
      normalized._raw = item;

      const quality = conservativeQualityGate(normalized);
      if (!quality.accepted) {
        rejected.push({
          source: 'foursquare',
          foursquareId: normalized.foursquareId,
          name: normalized.name,
          cityName: normalized.cityName,
          stateAbbr: normalized.stateAbbr,
          reason: quality.reason,
        });
        continue;
      }

      const dedupe = conservativeDedupe(normalized, index);
      if (dedupe.duplicate) {
        skippedDuplicates.push({
          source: 'foursquare',
          foursquareId: normalized.foursquareId,
          name: normalized.name,
          cityName: normalized.cityName,
          stateAbbr: normalized.stateAbbr,
          reason: dedupe.reason,
          details: dedupe.details || null,
        });
        continue;
      }

      accepted.push({
        source: 'foursquare',
        foursquareId: normalized.foursquareId,
        name: normalized.name,
        cityName: normalized.cityName,
        stateAbbr: normalized.stateAbbr,
        street: normalized.street,
        postalCode: normalized.postalCode,
        address: normalized.address,
        lat: normalized.lat,
        lng: normalized.lng,
        phone: normalized.phone,
        website: normalized.website,
        rating: normalized.rating,
        price: normalized.price,
        categoryName: normalized.categoryName,
        categories: normalized.categories,
        hours: normalized.hours,
        scrapedAt: normalized.scrapedAt,
      });

      const candidateFingerprint = normalizeAddressFingerprint({
        name: normalized.name,
        street: normalized.street,
        city: normalized.cityName,
        stateAbbr: normalized.stateAbbr,
      });
      if (candidateFingerprint) index.existingFingerprints.add(candidateFingerprint);

      const phone = normalizePhone(normalized.phone || '');
      if (phone) {
        if (!index.phoneToIds.has(phone)) index.phoneToIds.set(phone, new Set());
        index.phoneToIds.get(phone).add(`candidate:${normalized.foursquareId}`);
      }

      const domain = normalizeDomain(normalized.website || '');
      if (domain) {
        if (!index.domainToIds.has(domain)) index.domainToIds.set(domain, new Set());
        index.domainToIds.get(domain).add(`candidate:${normalized.foursquareId}`);
      }

      index.rows.push({
        id: `candidate:${normalized.foursquareId}`,
        name: normalized.name,
        slug: '',
        street: normalized.street,
        cityName: normalized.cityName,
        stateAbbr: normalized.stateAbbr,
        lat: normalized.lat,
        lng: normalized.lng,
        phone,
        websiteDomain: domain,
        placeId: '',
        fingerprint: candidateFingerprint,
      });
    }

    processed.add(cityKey);
    writeJson(opts.checkpointPath, {
      processedCityKeys: Array.from(processed),
      updatedAt: new Date().toISOString(),
      cityLimit: opts.cityLimit,
      mode: opts.mode,
    });

    console.log(`  Accepted so far: ${accepted.length}`);
    console.log(`  Skipped duplicates so far: ${skippedDuplicates.length}`);
    console.log(`  Rejected low-confidence so far: ${rejected.length}`);
  }

  let inserted = 0;
  let insertErrors = 0;

  if (opts.commit && accepted.length > 0) {
    console.log(`\nCommitting ${accepted.length} new buffets to InstantDB...`);

    const cityTxs = [];
    const buffetTxs = [];

    for (const candidate of accepted) {
      const cityKey = `${normalizeSearchText(candidate.cityName)}|${candidate.stateAbbr}`;
      const cityId = findOrCreateCityTx({
        db,
        cityStateKey: cityKey,
        cityName: candidate.cityName,
        stateAbbr: candidate.stateAbbr,
        cityMaps,
        cityTxs,
      });

      const slug = buildSlug(candidate.name, candidate.stateAbbr, index.existingSlugs);
      index.existingSlugs.add(slug);

      const buffetId = id();
      const buffetData = {
        name: candidate.name,
        searchName: normalizeSearchText(candidate.name),
        slug,
        street: candidate.street || '',
        cityName: candidate.cityName || '',
        state: candidate.stateAbbr,
        stateAbbr: candidate.stateAbbr,
        postalCode: candidate.postalCode || '',
        address: candidate.address || [candidate.street, candidate.cityName, candidate.stateAbbr, candidate.postalCode].filter(Boolean).join(', '),
        lat: Number(candidate.lat) || 0,
        lng: Number(candidate.lng) || 0,
        permanentlyClosed: false,
        temporarilyClosed: false,
        phone: candidate.phone || undefined,
        website: candidate.website || undefined,
        rating: typeof candidate.rating === 'number' ? candidate.rating : undefined,
        price: candidate.price || undefined,
        categoryName: candidate.categoryName || undefined,
        categories: JSON.stringify(candidate.categories || []),
        hours: candidate.hours || undefined,
        primaryType: 'foursquare_places',
        placeId: `fsq:${candidate.foursquareId}`,
        scrapedAt: candidate.scrapedAt,
        description: 'Imported from Foursquare Places API (conservative dedupe mode).',
      };

      Object.keys(buffetData).forEach((k) => {
        if (buffetData[k] === undefined) delete buffetData[k];
      });

      buffetTxs.push(db.tx.buffets[buffetId].create(buffetData).link({ city: cityId }));
    }

    if (cityTxs.length) {
      try {
        await db.transact(cityTxs);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`City creation transaction failed: ${msg}`);
      }
    }

    const batchSize = 100;
    for (let i = 0; i < buffetTxs.length; i += batchSize) {
      const batch = buffetTxs.slice(i, i + batchSize);
      try {
        await db.transact(batch);
        inserted += batch.length;
      } catch (err) {
        insertErrors += batch.length;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Buffet transaction batch failed (${i}..${i + batch.length - 1}): ${msg}`);
      }
    }
  }

  writeJson(opts.candidatesPath, accepted);
  writeJson(opts.rejectedPath, {
    rejectedLowConfidenceOrInvalid: rejected,
    skippedDuplicates,
  });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    dryRun: opts.dryRun,
    commit: opts.commit,
    dedupeScope: 'all_buffets_in_db',
    totals: {
      citiesSelected: cities.length,
      citiesProcessedThisRun: fetchedRawCountByCity.length,
      rawFetched: fetchedRawCountByCity.reduce((sum, c) => sum + c.fetched, 0),
      acceptedCandidates: accepted.length,
      skippedDuplicate: skippedDuplicates.length,
      rejectedLowConfidenceOrInvalid: rejected.length,
      inserted,
      insertErrors,
    },
    cityFetchStats: fetchedRawCountByCity,
    files: {
      checkpoint: opts.checkpointPath,
      report: opts.reportPath,
      candidates: opts.candidatesPath,
      rejected: opts.rejectedPath,
    },
  };

  writeJson(opts.reportPath, report);

  console.log('\nRun complete.');
  console.log(`  Dry-run: ${opts.dryRun ? 'yes' : 'no'}`);
  console.log(`  Accepted candidates: ${accepted.length}`);
  console.log(`  Skipped duplicates: ${skippedDuplicates.length}`);
  console.log(`  Rejected low-confidence/invalid: ${rejected.length}`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Insert errors: ${insertErrors}`);
  console.log(`  Report: ${opts.reportPath}`);
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error: ${message}`);
  process.exit(1);
});
