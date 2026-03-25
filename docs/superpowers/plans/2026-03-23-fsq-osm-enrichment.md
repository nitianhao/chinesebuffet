# FSQ OSM Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich ~15 Foursquare-imported buffet records with opening hours, cuisine type, and amenity flags using only free OSM APIs (Overpass + Nominatim) — no paid API keys required.

**Architecture:** Three sequential phases: (1) apply already-computed OSM patches for 3 strong-matched records; (2) parse `rawOpeningHours` OSM strings into the `hours` JSON array the app uses; (3) use Nominatim address geocoding as a fallback matcher for the 11 records that Overpass name-search couldn't find. After all patches land, rebuild `facetIndex` for affected records.

**Tech Stack:** TypeScript, `npx tsx` (runner), `@instantdb/admin` (DB), Overpass API (free), Nominatim API (free, 1 req/sec), existing `lib/overpass-api.ts`, existing `lib/facets/buildFacetIndex.ts`

---

## Current State

- `data/foursquare-osm-match-dry-run.json` — 15 FSQ records; 3 strong_match, 1 weak_match, 11 no_match
- `data/osm-strong-match-enrichment-dry-run.json` — enrichment patches for 3 strong matches
- `data/osm-strong-match-patch-plan.json` — planned field-level actions for those 3 records
- All three pipeline scripts exist and work; the apply step just needs `--apply` flag

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/plan-apply-osm-strong-match-patches.ts` | Run only (no changes) | Apply 3 existing strong-match patches |
| `scripts/backfill-osm-opening-hours.ts` | **Create** | Parse `rawOpeningHours` → `hours` JSON for DB |
| `lib/osm-opening-hours.ts` | **Create** | Pure parser: OSM `opening_hours` string → `hours` array format |
| `lib/__tests__/osm-opening-hours.test.ts` | **Create** | Unit tests for the parser |
| `scripts/nominatim-enrich-fsq-no-matches.ts` | **Create** | Nominatim address lookup + Overpass tag fetch + DB write |
| `scripts/backfillFacetIndex.ts` | Run only (no changes) | Rebuild facetIndex for enriched records |

---

## Task 1: Apply Existing Strong-Match Patches

The patch plan for 3 records is already computed and sitting in `data/`. Just run the apply phase.

**Files:** `scripts/plan-apply-osm-strong-match-patches.ts` (no changes)

- [ ] **Step 1: Dry-run to confirm 3 records planned**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet"
npx tsx scripts/plan-apply-osm-strong-match-patches.ts
```

Expected output: summary showing 3 records with `fieldsToApply` non-empty (website, phone, cuisineType, amenity flags).

- [ ] **Step 2: Apply patches to DB**

```bash
npx tsx scripts/plan-apply-osm-strong-match-patches.ts --apply
```

Expected: `recordsApplied: 3` in report. Check `data/osm-strong-match-apply-report.json` for `status: "applied"` on all 3.

- [ ] **Step 3: Commit**

```bash
git add data/osm-strong-match-apply-report.json data/osm-strong-match-apply-report.csv data/osm-strong-match-apply-rollback.json
git commit -m "chore: apply OSM strong-match enrichment patches to 3 FSQ records"
```

---

## Task 2: OSM Opening Hours Parser (Pure Library)

The existing `plan-apply-osm-strong-match-patches.ts` stores `rawOpeningHours` (e.g. `"Mo-Sa 10:00-21:00; Su 11:00-20:00"`) in the DB but never converts it to the `hours` JSON format that `buildFacetIndex.ts` → `parseBusinessHours()` understands.

The app's `parseBusinessHours` handles Format 1: `[{ day: "Monday", hours: "10:00 AM - 9:00 PM" }]`. We'll convert OSM format to this shape.

**Files:**
- Create: `lib/osm-opening-hours.ts`
- Create: `lib/__tests__/osm-opening-hours.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/osm-opening-hours.test.ts`:

```typescript
/**
 * Tests for OSM opening_hours string parser
 * Run with: npx tsx lib/__tests__/osm-opening-hours.test.ts
 */
import { parseOsmOpeningHours, osmHoursToAppFormat } from '../osm-opening-hours';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  PASS: ${message}`);
}

// parseOsmOpeningHours
{
  const r1 = parseOsmOpeningHours('Mo-Sa 10:00-21:00');
  assert(r1.length === 6, 'Mo-Sa produces 6 day entries');
  assert(r1[0].dayIndex === 1, 'Monday = day index 1');
  assert(r1[0].open === 600, 'Mo 10:00 = 600 min');
  assert(r1[0].close === 1260, 'Mo 21:00 = 1260 min');

  const r2 = parseOsmOpeningHours('Mo-Sa 10:00-21:00; Su 11:00-20:00');
  assert(r2.length === 7, 'Mo-Sa + Su = 7 entries');
  const su = r2.find(e => e.dayIndex === 0);
  assert(su?.open === 660, 'Su 11:00 = 660 min');
  assert(su?.close === 1200, 'Su 20:00 = 1200 min');

  const r3 = parseOsmOpeningHours('Mo-Fr 06:00-22:00; Sa-Su 07:00-22:00');
  assert(r3.length === 7, 'Mo-Fr + Sa-Su = 7 entries');

  const r4 = parseOsmOpeningHours('24/7');
  assert(r4.length === 7, '24/7 = 7 entries');
  assert(r4[0].open === 0, '24/7 open = 0');
  assert(r4[0].close === 1440, '24/7 close = 1440');

  const r5 = parseOsmOpeningHours('');
  assert(r5.length === 0, 'empty string = 0 entries');
}

// osmHoursToAppFormat
{
  const app = osmHoursToAppFormat('Mo-Sa 10:00-21:00; Su 11:00-20:00');
  assert(Array.isArray(app), 'returns array');
  // Day 0 = Sunday
  const suEntry = app.find((e: { day: string }) => e.day === 'Sunday');
  assert(suEntry !== undefined, 'has Sunday entry');
  assert(suEntry.hours === '11:00 - 20:00', 'Sunday hours string formatted correctly');
  // Monday
  const moEntry = app.find((e: { day: string }) => e.day === 'Monday');
  assert(moEntry?.hours === '10:00 - 21:00', 'Monday hours string');

  const nullResult = osmHoursToAppFormat(null);
  assert(nullResult === null, 'null input returns null');
}

console.log('\nAll tests passed!');
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet"
npx tsx lib/__tests__/osm-opening-hours.test.ts
```

Expected: error like `Cannot find module '../osm-opening-hours'`

- [ ] **Step 3: Implement the parser**

Create `lib/osm-opening-hours.ts`:

```typescript
/**
 * Parser for OSM opening_hours strings.
 *
 * OSM format reference: https://wiki.openstreetmap.org/wiki/Key:opening_hours
 * Examples:
 *   "Mo-Sa 10:00-21:00"
 *   "Mo-Sa 10:00-21:00; Su 11:00-20:00"
 *   "Mo-Fr 06:00-22:00; Sa-Su 07:00-22:00"
 *   "24/7"
 */

// Day abbreviations used in OSM opening_hours
const OSM_DAY_ABBRS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
// Full day names, aligned with OSM_DAY_ABBRS (0 = Sunday)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dayAbbrToIndex(abbr: string): number | null {
  const idx = OSM_DAY_ABBRS.indexOf(abbr);
  return idx === -1 ? null : idx;
}

/** Expand a day range like "Mo-Fr" to an array of day indices */
function expandDayRange(rangeStr: string): number[] {
  const trimmed = rangeStr.trim();
  if (trimmed.includes('-')) {
    const [startAbbr, endAbbr] = trimmed.split('-').map(s => s.trim());
    const start = dayAbbrToIndex(startAbbr);
    const end = dayAbbrToIndex(endAbbr);
    if (start === null || end === null) return [];
    const indices: number[] = [];
    // Handle wrapping (e.g. Sa-Su across week boundary — uncommon but possible)
    if (end >= start) {
      for (let i = start; i <= end; i++) indices.push(i);
    } else {
      for (let i = start; i <= 6; i++) indices.push(i);
      for (let i = 0; i <= end; i++) indices.push(i);
    }
    return indices;
  }
  const single = dayAbbrToIndex(trimmed);
  return single !== null ? [single] : [];
}

/** Parse "10:00" or "10:00-21:00" time parts to minutes from midnight */
function timeStrToMinutes(t: string): number | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export interface OsmHoursEntry {
  dayIndex: number; // 0 = Sunday
  open: number;     // minutes from midnight
  close: number;    // minutes from midnight (may be > 1439 for overnight)
}

/**
 * Parse an OSM opening_hours string into flat day/time entries.
 * Returns [] if the string is empty or unparseable.
 */
export function parseOsmOpeningHours(raw: string | null | undefined): OsmHoursEntry[] {
  if (!raw) return [];

  const trimmed = raw.trim();

  // Special case: 24/7
  if (trimmed === '24/7') {
    return DAY_NAMES.map((_, i) => ({ dayIndex: i, open: 0, close: 1440 }));
  }

  const entries: OsmHoursEntry[] = [];

  // Split by semicolon into rule segments
  const segments = trimmed.split(';').map(s => s.trim()).filter(Boolean);

  for (const segment of segments) {
    // Each segment: "<day-spec> <time-range>" e.g. "Mo-Sa 10:00-21:00"
    // day-spec can be "Mo-Sa", "Mo,We,Fr", "PH" (public holidays — skip)
    const spaceIdx = segment.search(/\s/);
    if (spaceIdx === -1) continue; // no time range

    const dayPart = segment.slice(0, spaceIdx).trim();
    const timePart = segment.slice(spaceIdx + 1).trim();

    // Skip public holiday rules
    if (dayPart === 'PH' || dayPart === 'SH') continue;

    // Parse time range e.g. "10:00-21:00"
    const timeMatch = timePart.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
    if (!timeMatch) continue;

    const open = timeStrToMinutes(timeMatch[1]);
    let close = timeStrToMinutes(timeMatch[2]);
    if (open === null || close === null) continue;

    // Handle overnight (close before open = next day)
    if (close < open) close += 1440;

    // Expand day ranges and comma-separated lists
    const dayGroups = dayPart.split(',');
    for (const group of dayGroups) {
      const dayIndices = expandDayRange(group.trim());
      for (const dayIndex of dayIndices) {
        entries.push({ dayIndex, open, close });
      }
    }
  }

  return entries;
}

/** Format minutes-from-midnight as "HH:MM" */
function minutesToTimeStr(minutes: number): string {
  const m = minutes % 1440; // normalize past midnight
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const min = (m % 60).toString().padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * Convert an OSM opening_hours string to the app's hours array format:
 * [{ day: "Monday", hours: "10:00 - 21:00" }, ...]
 *
 * This is Format 1 understood by buildFacetIndex.ts → parseBusinessHours().
 * Returns null if parsing yields no entries.
 */
export function osmHoursToAppFormat(
  raw: string | null | undefined
): Array<{ day: string; hours: string }> | null {
  const entries = parseOsmOpeningHours(raw);
  if (entries.length === 0) return null;

  // Deduplicate: one entry per day (first entry wins if multiple segments hit same day)
  const seen = new Set<number>();
  const result: Array<{ day: string; hours: string }> = [];
  for (const entry of entries) {
    if (seen.has(entry.dayIndex)) continue;
    seen.add(entry.dayIndex);
    result.push({
      day: DAY_NAMES[entry.dayIndex],
      hours: `${minutesToTimeStr(entry.open)} - ${minutesToTimeStr(entry.close)}`,
    });
  }

  // Sort Sunday first (index 0)
  result.sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day));
  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx tsx lib/__tests__/osm-opening-hours.test.ts
```

Expected: `All tests passed!`

- [ ] **Step 5: Commit**

```bash
git add lib/osm-opening-hours.ts lib/__tests__/osm-opening-hours.test.ts
git commit -m "feat: add OSM opening_hours string parser"
```

---

## Task 3: Backfill Script — rawOpeningHours → hours

Creates a script that reads FSQ buffets with `rawOpeningHours` set but `hours` missing, converts using the new parser, and writes back to DB.

**Files:**
- Create: `scripts/backfill-osm-opening-hours.ts`

- [ ] **Step 1: Create the script**

Create `scripts/backfill-osm-opening-hours.ts`:

```typescript
/**
 * Backfill `hours` from `rawOpeningHours` for OSM-matched FSQ buffets.
 *
 * Reads buffets where rawOpeningHours is set but hours is null/empty,
 * converts using the OSM opening_hours parser, and writes hours back.
 *
 * Usage:
 *   npx tsx scripts/backfill-osm-opening-hours.ts                # dry-run
 *   npx tsx scripts/backfill-osm-opening-hours.ts --commit       # write to DB
 *   npx tsx scripts/backfill-osm-opening-hours.ts --limit 5      # limit records
 *   npx tsx scripts/backfill-osm-opening-hours.ts --ids id1,id2  # specific IDs
 */

import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';
import { osmHoursToAppFormat } from '../lib/osm-opening-hours';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const db = init({ appId: process.env.INSTANT_APP_ID!, adminToken: process.env.INSTANT_ADMIN_TOKEN!, schema });

function parseArgs(argv: string[]) {
  const opts = { commit: false, limit: 0, ids: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--commit') opts.commit = true;
    else if (argv[i] === '--limit' && argv[i + 1]) opts.limit = parseInt(argv[++i], 10);
    else if (argv[i] === '--ids' && argv[i + 1]) opts.ids = argv[++i].split(',').map(s => s.trim());
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${opts.commit ? 'COMMIT' : 'DRY RUN'}`);

  // Query FSQ buffets that have rawOpeningHours but no hours
  const { data } = await db.query({
    buffets: {
      $: {
        where: opts.ids.length > 0
          ? { id: { $in: opts.ids } }
          : { placeId: { $like: 'fsq:%' } },
        limit: opts.limit > 0 ? opts.limit : undefined,
      },
    },
  });

  const buffets = (data?.buffets ?? []) as Array<{
    id: string;
    name?: string;
    placeId?: string;
    rawOpeningHours?: string | null;
    hours?: string | null;
  }>;

  // Filter to those with rawOpeningHours set and hours missing
  const candidates = buffets.filter(b =>
    b.rawOpeningHours && (!b.hours || b.hours === 'null' || b.hours === '[]')
  );

  console.log(`Found ${buffets.length} FSQ buffets, ${candidates.length} need hours backfill`);

  let updated = 0;
  let skipped = 0;

  for (const buffet of candidates) {
    const parsed = osmHoursToAppFormat(buffet.rawOpeningHours);

    if (!parsed) {
      console.log(`  SKIP [no parse] ${buffet.name} — rawOpeningHours: "${buffet.rawOpeningHours}"`);
      skipped++;
      continue;
    }

    const hoursJson = JSON.stringify(parsed);
    console.log(`  ${opts.commit ? 'WRITE' : 'WOULD WRITE'} ${buffet.name}: ${parsed.length} days`);

    if (opts.commit) {
      await db.transact([db.tx.buffets[buffet.id].update({ hours: hoursJson })]);
    }
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (unparseable): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Dry-run the script**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet"
npx tsx scripts/backfill-osm-opening-hours.ts
```

Expected: lists FSQ buffets with `rawOpeningHours` set, shows `WOULD WRITE` lines. If 0 candidates, `rawOpeningHours` wasn't applied yet — run Task 1 first.

- [ ] **Step 3: Commit and apply**

```bash
npx tsx scripts/backfill-osm-opening-hours.ts --commit
git add scripts/backfill-osm-opening-hours.ts
git commit -m "feat: add backfill-osm-opening-hours script"
```

---

## Task 4: Nominatim Fallback Enrichment for No-Match Records

For 11 records where Overpass name-proximity search returned no match, try address-based geocoding via Nominatim to find the OSM node, then fetch its tags.

**Files:**
- Create: `scripts/nominatim-enrich-fsq-no-matches.ts`

- [ ] **Step 1: Create the script**

Create `scripts/nominatim-enrich-fsq-no-matches.ts`:

```typescript
/**
 * Nominatim address-based fallback enrichment for FSQ records with no OSM name-match.
 *
 * Strategy:
 *   1. Load no_match records from data/foursquare-osm-match-dry-run.json
 *   2. For each: query Nominatim /search with street+city+postalcode
 *   3. Accept result if within 100m of buffet lat/lng
 *   4. Fetch full OSM tags from Overpass using the OSM node/way ID
 *   5. Extract hours, cuisine, phone, website, amenity flags
 *   6. Write results to data/nominatim-enrich-results.json + CSV review
 *   7. --commit flag applies to InstantDB
 *
 * Rate limits:
 *   Nominatim ToS: max 1 req/sec + User-Agent header required
 *   Overpass: ~1 req/sec polite limit
 *
 * Usage:
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts          # dry-run
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts --commit # write to DB
 *   npx tsx scripts/nominatim-enrich-fsq-no-matches.ts --limit 5
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
const USER_AGENT = 'chinese-buffet-enrichment/1.0 (contact: enrichment-bot@example.com)';
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

async function nominatimSearch(street: string, city: string, postalCode: string, stateAbbr: string) {
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
  if (!res.ok) throw new Error(`Nominatim ${res.status}: ${url}`);
  return res.json() as Promise<Array<{ lat: string; lon: string; osm_type: string; osm_id: number; display_name: string }>>;
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
  const bool = (v: string | undefined) =>
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
    alcohol: bool(tags['alcohol']),
    delivery: bool(tags['delivery']),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${opts.commit ? 'COMMIT' : 'DRY RUN'}`);

  const matchData = JSON.parse(fs.readFileSync(MATCH_FILE, 'utf8'));
  let noMatchRecords: Array<{
    source: { id: string; name?: string; street?: string; cityName?: string; postalCode?: string; stateAbbr?: string; lat?: number; lng?: number };
  }> = (matchData.records ?? []).filter((r: { finalClass: string }) => r.finalClass === 'no_match');

  if (opts.limit > 0) noMatchRecords = noMatchRecords.slice(0, opts.limit);
  console.log(`Processing ${noMatchRecords.length} no-match records`);

  const results: Array<{
    sourceId: string;
    sourceName: string;
    status: 'matched' | 'no_nominatim_result' | 'too_far' | 'no_tags';
    distanceM?: number;
    osmType?: string;
    osmId?: number;
    patch?: ReturnType<typeof extractPatch>;
  }> = [];

  for (const record of noMatchRecords) {
    const { id, name, street, cityName, postalCode, stateAbbr, lat, lng } = record.source;
    console.log(`\nProcessing: ${name} — ${street}, ${cityName}`);

    if (!street || !cityName || !postalCode) {
      console.log('  SKIP: missing address fields');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    await sleep(1100); // Nominatim ToS: 1 req/sec

    let nominatimResults;
    try {
      nominatimResults = await nominatimSearch(street, cityName, postalCode, stateAbbr ?? '');
    } catch (err) {
      console.log(`  ERROR: Nominatim failed — ${err}`);
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    if (!nominatimResults.length) {
      console.log('  No Nominatim results');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_nominatim_result' });
      continue;
    }

    // Find closest result within MAX_DISTANCE_M
    let bestResult = null;
    let bestDist = Infinity;
    for (const r of nominatimResults) {
      if (!lat || !lng) continue;
      const dist = haversineM(lat, lng, parseFloat(r.lat), parseFloat(r.lon));
      if (dist < bestDist) { bestDist = dist; bestResult = r; }
    }

    if (!bestResult || bestDist > MAX_DISTANCE_M) {
      console.log(`  Too far: closest=${bestDist.toFixed(0)}m > ${MAX_DISTANCE_M}m`);
      results.push({ sourceId: id, sourceName: name ?? '', status: 'too_far', distanceM: bestDist });
      continue;
    }

    console.log(`  Nominatim match at ${bestDist.toFixed(0)}m: ${bestResult.display_name}`);

    await sleep(1000); // Overpass rate limit

    const tags = await fetchOsmTags(bestResult.osm_type, bestResult.osm_id);
    if (!Object.keys(tags).length) {
      console.log('  No OSM tags found');
      results.push({ sourceId: id, sourceName: name ?? '', status: 'no_tags', distanceM: bestDist, osmType: bestResult.osm_type, osmId: bestResult.osm_id });
      continue;
    }

    const patch = extractPatch(tags);
    console.log(`  Tags: opening_hours="${patch.rawOpeningHours}", cuisine="${patch.cuisineType}"`);

    results.push({
      sourceId: id,
      sourceName: name ?? '',
      status: 'matched',
      distanceM: bestDist,
      osmType: bestResult.osm_type,
      osmId: bestResult.osm_id,
      patch,
    });

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

  // Write outputs
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
  console.log(`Review: ${OUT_CSV}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Dry-run the script**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet"
npx tsx scripts/nominatim-enrich-fsq-no-matches.ts
```

Expected: processes 11 records (may take ~25s due to rate limits), writes `data/nominatim-enrich-results.json`. Review the CSV to see which got matched.

- [ ] **Step 3: Inspect results**

```bash
cat data/nominatim-enrich-results.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d['totals'], indent=2))"
```

Review `data/nominatim-enrich-review.csv` to validate matches before committing.

- [ ] **Step 4: Commit changes (if matches look good)**

```bash
npx tsx scripts/nominatim-enrich-fsq-no-matches.ts --commit
git add scripts/nominatim-enrich-fsq-no-matches.ts data/nominatim-enrich-results.json data/nominatim-enrich-review.csv
git commit -m "feat: add Nominatim fallback enrichment for FSQ no-match records"
```

---

## Task 5: Rebuild facetIndex for Enriched FSQ Records

After hours and amenity data is written to the DB, the `facetIndex` on each affected record is stale. The existing `backfillFacetIndex.ts` handles this.

**Files:** `scripts/backfillFacetIndex.ts` (no changes)

- [ ] **Step 1: Collect IDs of enriched records**

From the apply report and nominatim results, collect the IDs of records that were actually updated. You can pass them directly:

```bash
# Get IDs from apply report
node -e "
const d = require('./data/osm-strong-match-apply-report.json');
const applied = d.records.filter(r => r.status === 'applied').map(r => r.sourceId);
console.log(applied.join(','));
"
```

- [ ] **Step 2: Rebuild facetIndex for those IDs**

```bash
cd "/Users/michalpekarcik/Cursor/Chinese Buffet"
# Replace <ids> with comma-separated IDs from step above
npx tsx scripts/backfillFacetIndex.ts --buffet-id <id1>
# Repeat for each ID, or use --force with --limit to cover all FSQ records:
# npx tsx scripts/backfillFacetIndex.ts --force --limit 20
```

Expected: each record shows `Updated facetIndex` in output.

- [ ] **Step 3: Verify a buffet listing page**

Open a FSQ buffet's listing page in the browser (e.g. `/buffets/<slug>`). Confirm:
- Hours section shows opening hours (not empty)
- Filter bar: relevant amenity chips are active (wheelchair, takeout, etc.)
- Cuisine type shows in the listing metadata

- [ ] **Step 4: Commit**

```bash
git add -p  # stage any incidental changes
git commit -m "chore: rebuild facetIndex for OSM-enriched FSQ records"
```

---

## Verification Checklist

- [ ] `data/osm-strong-match-apply-report.json` shows `recordsApplied: 3`
- [ ] At least 1 FSQ buffet has `hours` JSON written to DB (check via InstantDB dashboard or query)
- [ ] `data/nominatim-enrich-results.json` shows results for all 11 no-match records
- [ ] `npx tsx lib/__tests__/osm-opening-hours.test.ts` passes
- [ ] A FSQ buffet listing page shows hours and/or cuisine type
