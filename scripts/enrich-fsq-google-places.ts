/**
 * Enrich FSQ buffet records using Google Places API (New, v1).
 *
 * For each FSQ buffet (placeId starts with "fsq:"):
 *   1. Search Google Places by name + address with lat/lng bias
 *   2. Fetch: rating, reviewsCount, hours, price, phone, website, photos,
 *             description, dineIn, takeout, delivery, reservable, amenity flags
 *   3. Dry-run by default — use --commit to write to InstantDB
 *   4. After writing, rebuilds facetIndex for each enriched record
 *
 * Usage:
 *   npx tsx scripts/enrich-fsq-google-places.ts               # dry-run, all FSQ records
 *   npx tsx scripts/enrich-fsq-google-places.ts --limit 100   # first 100
 *   npx tsx scripts/enrich-fsq-google-places.ts --commit       # write to DB
 *   npx tsx scripts/enrich-fsq-google-places.ts --ids <id1,id2>
 *   npx tsx scripts/enrich-fsq-google-places.ts --offset 100 --limit 100
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { init } from '@instantdb/admin';
import { buildFacetIndex } from '../lib/facets/buildFacetIndex';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

// No schema passed — avoids client-side validation against a stale cached schema object.
// The remote DB schema is the source of truth after sync.
const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
}) as any;

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

// Fields we request — covers Preferred tier (photos, reviews booleans, etc.)
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.currentOpeningHours',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.photos',
  'places.editorialSummary',
  'places.takeout',
  'places.delivery',
  'places.dineIn',
  'places.reservable',
  'places.outdoorSeating',
  'places.servesBeer',
  'places.servesWine',
  'places.servesVegetarianFood',
  'places.goodForChildren',
  'places.accessibilityOptions',
  'places.parkingOptions',
  'places.paymentOptions',
].join(',');

// Price level mapping: Google enum → $ symbols
const PRICE_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: '$',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

// Day index mapping (Google uses 0=Sunday...6=Saturday, same as our app)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseArgs(argv: string[]) {
  const opts = { commit: false, limit: 0, offset: 0, ids: [] as string[], all: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--commit') opts.commit = true;
    else if (argv[i] === '--all') opts.all = true;
    else if (argv[i] === '--limit' && argv[i + 1]) opts.limit = parseInt(argv[++i], 10);
    else if (argv[i] === '--offset' && argv[i + 1]) opts.offset = parseInt(argv[++i], 10);
    else if (argv[i] === '--ids' && argv[i + 1]) opts.ids = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
  }
  return opts;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Parse Google's currentOpeningHours.weekdayDescriptions into app hours format.
 *  Input: ["Monday: 11:00 AM – 9:00 PM", "Tuesday: Closed", ...]
 *  Output: [{ day: "Monday", hours: "11:00 AM - 9:00 PM" }, ...]  (Closed days omitted)
 */
function parseGoogleHours(weekdayDescriptions: string[]): Array<{ day: string; hours: string }> | null {
  if (!weekdayDescriptions?.length) return null;
  const result: Array<{ day: string; hours: string }> = [];
  for (const line of weekdayDescriptions) {
    // Format: "Monday: 11:00 AM – 9:00 PM" or "Monday: Closed"
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const day = line.slice(0, colonIdx).trim();
    const hours = line.slice(colonIdx + 1).trim()
      // Replace narrow no-break space + en-dash variants with plain " - "
      .replace(/[\u2009\u202f\u00a0]/g, ' ')
      .replace(/\u2013/g, '-')
      .replace(/\s*-\s*/g, ' - ')
      .trim();
    if (hours.toLowerCase() === 'closed') continue;
    if (DAY_NAMES.includes(day)) {
      result.push({ day, hours });
    }
  }
  return result.length > 0 ? result : null;
}

interface GooglePlace {
  id?: string;
  displayName?: { text: string };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  editorialSummary?: { text: string };
  currentOpeningHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
  };
  photos?: Array<{ name: string; widthPx?: number; heightPx?: number }>;
  takeout?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  reservable?: boolean;
  outdoorSeating?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesVegetarianFood?: boolean;
  goodForChildren?: boolean;
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  parkingOptions?: {
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    freeGarageParking?: boolean;
    paidGarageParking?: boolean;
  };
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
}

/** Simple token overlap similarity — returns 0.0–1.0.
 *  Strips common noise words and checks what fraction of buffet name tokens appear in place name. */
function nameSimilarity(buffetName: string, placeName: string): number {
  const NOISE = new Set(['buffet', 'chinese', 'restaurant', 'grill', 'super', 'grand', 'the', 'and', '&', 'asian', 'express']);
  const tokenize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !NOISE.has(t));
  const buffetTokens = tokenize(buffetName);
  if (buffetTokens.length === 0) return 1; // no meaningful tokens → can't reject
  const placeTokens = new Set(tokenize(placeName));
  const matches = buffetTokens.filter(t => placeTokens.has(t)).length;
  return matches / buffetTokens.length;
}

async function searchPlace(buffet: {
  name: string;
  address: string;
  lat?: number;
  lng?: number;
}): Promise<GooglePlace | null> {
  const body: Record<string, unknown> = {
    textQuery: `${buffet.name} ${buffet.address}`,
    maxResultCount: 1,
  };

  if (buffet.lat != null && buffet.lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: buffet.lat, longitude: buffet.lng },
        radius: 200,
      },
    };
  }

  const res = await fetch(PLACES_SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Places API ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { places?: GooglePlace[] };
  return data.places?.[0] ?? null;
}

/** Build the serviceOptions + amenities payload that buildFacetIndex reads */
function buildServiceOptions(place: GooglePlace): Record<string, unknown> {
  const opts: Record<string, unknown> = {};

  if (place.takeout != null) opts.takeout = place.takeout;
  if (place.delivery != null) opts.delivery = place.delivery;
  if (place.dineIn != null) opts.dineIn = place.dineIn;
  if (place.reservable != null) opts.reservable = place.reservable;
  if (place.outdoorSeating != null) opts.outdoorSeating = place.outdoorSeating;
  if (place.goodForChildren != null) opts.kidsFriendly = place.goodForChildren;
  if (place.servesBeer != null || place.servesWine != null) {
    opts.alcohol = !!(place.servesBeer || place.servesWine);
  }

  if (place.accessibilityOptions) {
    opts.wheelchairAccessible = !!(
      place.accessibilityOptions.wheelchairAccessibleEntrance ||
      place.accessibilityOptions.wheelchairAccessibleSeating
    );
  }

  if (place.parkingOptions) {
    opts.parking = !!(
      place.parkingOptions.freeParkingLot ||
      place.parkingOptions.paidParkingLot ||
      place.parkingOptions.freeStreetParking
    );
  }

  if (place.paymentOptions) {
    opts.creditCards = !!(
      place.paymentOptions.acceptsCreditCards ||
      place.paymentOptions.acceptsDebitCards
    );
  }

  return opts;
}

/** Build the patch object for a buffet record from a Google place result */
function buildPatch(place: GooglePlace, existing: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (place.rating != null) patch.rating = place.rating;
  if (place.userRatingCount != null) patch.reviewsCount = place.userRatingCount;

  if (place.priceLevel && PRICE_MAP[place.priceLevel]) {
    patch.price = PRICE_MAP[place.priceLevel];
  }

  if (place.nationalPhoneNumber && !existing.phone) {
    patch.phone = place.nationalPhoneNumber;
  }
  if (place.websiteUri && !existing.website) {
    patch.website = place.websiteUri;
  }

  // Description — only fill if empty
  if (place.editorialSummary?.text && !existing.description) {
    patch.description = place.editorialSummary.text;
  }

  // Hours — parse from weekdayDescriptions
  const parsedHours = parseGoogleHours(
    place.currentOpeningHours?.weekdayDescriptions ?? []
  );
  if (parsedHours) {
    patch.hours = JSON.stringify(parsedHours);
  }

  // Images — store photo name references (up to 10)
  if (place.photos?.length) {
    const images = place.photos.slice(0, 10).map(p => ({
      photoReference: p.name,
      widthPx: p.widthPx,
      heightPx: p.heightPx,
    }));
    patch.images = JSON.stringify(images);
    patch.imagesCount = place.photos.length;
  }

  // serviceOptions — amenity/dine flags read by buildFacetIndex
  const serviceOptions = buildServiceOptions(place);
  if (Object.keys(serviceOptions).length > 0) {
    patch.serviceOptions = JSON.stringify(serviceOptions);
  }

  return patch;
}

async function loadAllFsqBuffets() {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const result = await db.query({ buffets: { $: { limit: 1000, offset } } }) as any;
    const batch: Record<string, unknown>[] = result?.buffets || [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows.filter(b => typeof b.placeId === 'string' && b.placeId.startsWith('fsq:'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!GOOGLE_API_KEY) throw new Error('GOOGLE_MAPS_API_KEY is required in .env.local');

  console.log(`Mode: ${opts.commit ? 'COMMIT' : 'DRY RUN'}`);

  let targets = await loadAllFsqBuffets();
  console.log(`Total FSQ records: ${targets.length}`);

  // Filter to missing data unless --all
  if (!opts.all) {
    targets = targets.filter(b => !b.hours || !b.price || !b.rating);
  }

  // Filter by explicit IDs
  if (opts.ids.length > 0) {
    targets = targets.filter(b => opts.ids.includes(b.id as string));
  } else {
    // Apply offset + limit
    targets = targets.slice(opts.offset, opts.limit > 0 ? opts.offset + opts.limit : undefined);
  }

  console.log(`Processing: ${targets.length} records`);

  const OUT_JSON = path.join(process.cwd(), 'data', 'google-places-enrich-results.json');
  const results: Array<{ id: string; name: string; status: string; fields?: string[]; googlePlaceId?: string; similarity?: number; error?: string }> = [];

  let matched = 0;
  let noResult = 0;
  let failed = 0;

  for (const buffet of targets) {
    const { id, name, address, lat, lng } = buffet as any;
    process.stdout.write(`\n${name} (${address?.slice(0, 50)})`);

    try {
      await sleep(100); // ~10 req/sec, well within Google's limits

      const place = await searchPlace({ name, address, lat, lng });

      if (!place) {
        process.stdout.write(' → no result');
        noResult++;
        results.push({ id, name, status: 'no_result' });
        continue;
      }

      const placeName = place.displayName?.text ?? '';
      const sim = nameSimilarity(name, placeName);
      process.stdout.write(` → ${placeName} (sim=${sim.toFixed(2)})`);

      // Reject clearly wrong matches (e.g. Chick-fil-A for a buffet query)
      if (sim < 0.25) {
        process.stdout.write(' → name mismatch, skipping');
        noResult++;
        results.push({ id, name, status: 'name_mismatch', googlePlaceId: place.id });
        continue;
      }

      const patch = buildPatch(place, buffet);

      if (Object.keys(patch).length === 0) {
        process.stdout.write(' → no new fields');
        results.push({ id, name, status: 'no_new_fields', googlePlaceId: place.id });
        continue;
      }

      const fieldNames = Object.keys(patch);
      process.stdout.write(` → [${fieldNames.join(', ')}]`);

      if (opts.commit) {
        // Build updated buffet for facetIndex rebuild
        const updatedBuffet = { ...buffet, ...patch };

        // Parse JSON fields back for facetIndex
        if (typeof updatedBuffet.serviceOptions === 'string') {
          try { updatedBuffet.serviceOptions = JSON.parse(updatedBuffet.serviceOptions); } catch {}
        }
        if (typeof updatedBuffet.hours === 'string') {
          try { updatedBuffet.hours = JSON.parse(updatedBuffet.hours); } catch {}
        }

        const facetIndex = buildFacetIndex(updatedBuffet as any);
        const finalPatch = { ...patch, facetIndex: JSON.stringify(facetIndex) };

        await db.transact([db.tx.buffets[id].update(finalPatch)]);
        process.stdout.write(' ✓ written');
      }

      matched++;
      results.push({ id, name, status: 'enriched', fields: fieldNames, googlePlaceId: place.id });

    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` → ERROR: ${msg.slice(0, 100)}`);
      results.push({ id, name, status: 'error', error: msg });
    }
  }

  console.log('\n');

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: opts.commit ? 'commit' : 'dry_run',
    totals: {
      processed: results.length,
      enriched: matched,
      no_result: noResult,
      failed,
    },
    results,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));

  console.log('Summary:', summary.totals);
  console.log(`Output: ${OUT_JSON}`);
}

main().catch(err => { console.error(err); process.exit(1); });
