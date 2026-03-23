/**
 * Nominatim address-based fallback enrichment for FSQ records with no OSM name-match.
 *
 * For each no_match record from the Overpass matching pipeline:
 *   1. Query Nominatim /search by address (street + city + postalcode)
 *   2. Accept if within 100m of buffet lat/lng
 *   3. Fetch OSM tags from Overpass using the matched node/way ID
 *   4. Extract hours, cuisine, phone, website, amenity flags
 *   5. Write to data/nominatim-enrich-results.json + CSV
 *   6. --commit flag writes fields to InstantDB
 *
 * Usage:
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts           # dry-run (default)
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts --commit  # write to DB
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts --limit 3
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import { osmHoursToAppFormat } from '../lib/osm-opening-hours';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const db = init({ appId: process.env.INSTANT_APP_ID!, adminToken: process.env.INSTANT_ADMIN_TOKEN!, schema });

const MATCH_FILE = path.join(process.cwd(), 'data', 'foursquare-osm-match-dry-run.json');
const OUT_JSON = path.join(process.cwd(), 'data', 'nominatim-enrich-results.json');
const OUT_CSV = path.join(process.cwd(), 'data', 'nominatim-enrich-review.csv');
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'chinese-buffet-enrichment/1.0 (open-source directory project)';
const MAX_DISTANCE_M = 100;

function parseArgs(argv: string[]) {
  const opts = { commit: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--commit') opts.commit = true;
    else if (argv[i] === '--limit' && argv[i + 1]) opts.limit = parseInt(argv[++i], 10);
  }
  return opts;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface NominatimResult {
  lat: string;
  lon: string;
  osm_type: string;
  osm_id: number;
  display_name: string;
}

async function nominatimSearch(street: string, city: string, postalCode: string): Promise<NominatimResult[]> {
  const params = new URLSearchParams({
    street,
    city,
    postalcode: postalCode,
    countrycodes: 'us',
    format: 'json',
    limit: '3',
    addressdetails: '1',
  });
  const url = `${NOMINATIM_BASE}?${params}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json() as Promise<NominatimResult[]>;
}

async function fetchOsmTags(osmType: string, osmId: number): Promise<Record<string, string>> {
  const typeChar = osmType === 'way' ? 'w' : osmType === 'relation' ? 'r' : 'n';
  const query = `${typeChar}(${osmId}); out tags;`;
  const body = `[out:json][timeout:15];${query}`;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) continue;
      const data = await res.json() as { elements: Array<{ tags?: Record<string, string> }> };
      return data.elements[0]?.tags ?? {};
    } catch {
      continue;
    }
  }
  return {};
}

function extractPatch(tags: Record<string, string>) {
  const bool = (v: string | undefined): boolean | null =>
    v === 'yes' || v === 'true' || v === '1' ? true :
    v === 'no' || v === 'false' || v === '0' ? false : null;
  return {
    rawOpeningHours: tags['opening_hours'] || null,
    cuisineType: tags['cuisine'] || null,
    phone: tags['phone'] || tags['contact:phone'] || null,
    website: tags['website'] || tags['contact:website'] || null,
    wheelchairAccessible: bool(tags['wheelchair']),
    takeout: bool(tags['takeaway']),
    outdoorSeating: bool(tags['outdoor_seating']),
    wifi: bool(tags['internet_access']),
    delivery: bool(tags['delivery']),
  };
}

type ResultStatus = 'matched' | 'no_nominatim_result' | 'too_far' | 'no_tags';

interface EnrichResult {
  sourceId: string;
  sourceName: string;
  status: ResultStatus;
  distanceM?: number;
  osmType?: string;
  osmId?: number;
  patch?: ReturnType<typeof extractPatch>;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${opts.commit ? 'COMMIT' : 'DRY RUN'}`);

  const matchData = JSON.parse(fs.readFileSync(MATCH_FILE, 'utf8'));
  let noMatchRecords = (matchData.records ?? []).filter((r: { finalClass: string }) => r.finalClass === 'no_match') as Array<{
    source: { id: string; name?: string; street?: string; cityName?: string; postalCode?: string; stateAbbr?: string; lat?: number; lng?: number };
  }>;

  if (opts.limit > 0) noMatchRecords = noMatchRecords.slice(0, opts.limit);
  console.log(`Processing ${noMatchRecords.length} no-match records`);

  const results: EnrichResult[] = [];

  for (const record of noMatchRecords) {
    const { id, name, street, cityName, postalCode, lat, lng } = record.source;
    console.log(`\nProcessing: ${name} — ${street}, ${cityName}`);

    if (!street || !cityName || !postalCode) {
      console.log('  SKIP: missing address fields');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    await sleep(1100); // Nominatim ToS: 1 req/sec

    let nominatimResults: NominatimResult[];
    try {
      nominatimResults = await nominatimSearch(street, cityName, postalCode);
    } catch (err) {
      console.log(`  ERROR Nominatim: ${err}`);
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    if (!nominatimResults.length) {
      console.log('  No Nominatim results');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    // Find closest result within MAX_DISTANCE_M
    let bestResult: NominatimResult | null = null;
    let bestDist = Infinity;
    for (const r of nominatimResults) {
      if (lat == null || lng == null) continue;
      const dist = haversineM(lat, lng, parseFloat(r.lat), parseFloat(r.lon));
      if (dist < bestDist) { bestDist = dist; bestResult = r; }
    }

    if (!bestResult || bestDist > MAX_DISTANCE_M) {
      console.log(`  Too far: closest=${bestDist === Infinity ? 'N/A' : bestDist.toFixed(0)}m`);
      results.push({ sourceId: id, sourceName: name ?? '', status: 'too_far', distanceM: bestDist === Infinity ? undefined : bestDist });
      continue;
    }

    console.log(`  Match at ${bestDist.toFixed(0)}m: ${bestResult.display_name.slice(0, 80)}`);

    await sleep(1000); // Overpass rate limit

    const tags = await fetchOsmTags(bestResult.osm_type, bestResult.osm_id);
    if (!Object.keys(tags).length) {
      console.log('  No OSM tags found');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_tags', distanceM: bestDist, osmType: bestResult.osm_type, osmId: bestResult.osm_id });
      continue;
    }

    const patch = extractPatch(tags);
    console.log(`  hours="${patch.rawOpeningHours ?? 'none'}" cuisine="${patch.cuisineType ?? 'none'}"`);

    results.push({ sourceId: id, sourceName: name ?? '', status: 'matched', distanceM: bestDist, osmType: bestResult.osm_type, osmId: bestResult.osm_id, patch });

    if (opts.commit) {
      const update: Record<string, unknown> = {};
      if (patch.rawOpeningHours) {
        update.rawOpeningHours = patch.rawOpeningHours;
        const hoursArr = osmHoursToAppFormat(patch.rawOpeningHours);
        if (hoursArr) update.hours = JSON.stringify(hoursArr);
      }
      if (patch.cuisineType) update.cuisineType = patch.cuisineType;
      if (patch.phone) update.phone = patch.phone;
      if (patch.website) update.website = patch.website;
      if (Object.keys(update).length > 0) {
        await db.transact([db.tx.buffets[id].update(update)]);
        console.log(`  WROTE: ${Object.keys(update).join(', ')}`);
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: opts.commit ? 'commit' : 'dry_run',
    totals: {
      processed: results.length,
      matched: results.filter(r => r.status === 'matched').length,
      no_nominatim_result: results.filter(r => r.status === 'no_nominatim_result').length,
      too_far: results.filter(r => r.status === 'too_far').length,
      no_tags: results.filter(r => r.status === 'no_tags').length,
    },
    results,
  };

  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
  const csvLines = [
    'sourceId,sourceName,status,distanceM,osmType,osmId,opening_hours,cuisine',
    ...results.map(r =>
      [r.sourceId, `"${r.sourceName}"`, r.status, r.distanceM?.toFixed(0) ?? '',
       r.osmType ?? '', r.osmId ?? '',
       `"${r.patch?.rawOpeningHours ?? ''}"`, `"${r.patch?.cuisineType ?? ''}"`].join(',')
    ),
  ];
  fs.writeFileSync(OUT_CSV, csvLines.join('\n'));

  console.log(`\nSummary:`, summary.totals);
  console.log(`Output: ${OUT_JSON}`);
}

main().catch(err => { console.error(err); process.exit(1); });
