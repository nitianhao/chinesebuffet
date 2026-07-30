#!/usr/bin/env node

/**
 * Import Google Places reviews (up to 5) for INDIAN buffets, in BATCHES.
 *
 * Google Places API v1 Place Details returns a maximum of 5 reviews per place.
 * Reviews are stored as `reviews` entity records linked to the buffet via the
 * `buffet` link (reverse label `reviewRecords`), matching import-apify-reviews.js.
 *
 * BATCHING: Processes up to BATCH_SIZE buffets per run (default 100 = 100 API
 * calls). A checkpoint file records every buffet attempted (success, no-reviews,
 * or error) so subsequent runs advance to NEW buffets and never re-charge.
 * Buffets that already have reviewRecords are also skipped.
 *
 * Usage:
 *   node scripts/import-google-reviews-indian.js            # next 100 buffets
 *   node scripts/import-google-reviews-indian.js --batch 50 # next 50 buffets
 *   node scripts/import-google-reviews-indian.js --dry-run  # select only, no API/writes
 */

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { init, id } = require('@instantdb/admin');

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const argv = process.argv.slice(2);
const BATCH_SIZE = argv.includes('--batch') ? parseInt(argv[argv.indexOf('--batch') + 1] || '100', 10) : 100;
const DRY_RUN = argv.includes('--dry-run');
const REQUEST_DELAY_MS = 150; // gentle pacing between Places API calls

const CHECKPOINT_DIR = path.join(__dirname, 'checkpoints');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'google-reviews-indian.checkpoint.json');

if (!ADMIN_TOKEN) { console.error('ERROR: INSTANT_ADMIN_TOKEN not set'); process.exit(1); }
if (!GOOGLE_API_KEY) { console.error('ERROR: GOOGLE_MAPS_API_KEY not set'); process.exit(1); }

// Cost guard: this script makes billable Google Places (Atmosphere) calls.
// When DISABLE_GOOGLE_APIS=1 is set (dev default), refuse to run unless the
// operator explicitly opts in with --allow-cost.
if (process.env.DISABLE_GOOGLE_APIS === '1' && !DRY_RUN && !process.argv.includes('--allow-cost')) {
  console.error('BLOCKED: DISABLE_GOOGLE_APIS=1 is set (cost guard). This script makes billable');
  console.error('Google Places API calls. Re-run with --allow-cost to intentionally spend, e.g.:');
  console.error('  node scripts/import-google-reviews-indian.js --batch 100 --allow-cost');
  process.exit(1);
}

const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

function loadCheckpoint() {
  try {
    const raw = fs.readFileSync(CHECKPOINT_FILE, 'utf8');
    const j = JSON.parse(raw);
    return { processedIds: new Set(j.processedIds || []), stats: j.stats || {} };
  } catch {
    return { processedIds: new Set(), stats: {} };
  }
}

function saveCheckpoint(processedIds, stats) {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({
    processedIds: [...processedIds],
    stats,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

// Map a Places API v1 review object to the `reviews` entity shape.
function mapReview(r) {
  const author = r.authorAttribution || {};
  const publishTime = r.publishTime || null;
  const text = (r.text && r.text.text) || (r.originalText && r.originalText.text) || '';
  const lang = (r.text && r.text.languageCode) || (r.originalText && r.originalText.languageCode) || null;
  return {
    reviewerId: null,
    reviewerUrl: author.uri || null,
    name: author.displayName || 'Google user',
    reviewerNumberOfReviews: null,
    isLocalGuide: null,
    reviewerPhotoUrl: author.photoUri || null,
    text,
    textTranslated: null,
    publishAt: publishTime || '',
    publishedAtDate: publishTime || null,
    likesCount: null,
    reviewId: r.name || null,
    reviewUrl: r.googleMapsUri || null,
    reviewOrigin: 'google',
    stars: typeof r.rating === 'number' ? r.rating : 0,
    rating: typeof r.rating === 'number' ? r.rating : null,
    responseFromOwnerDate: null,
    responseFromOwnerText: null,
    reviewImageUrls: null,
    reviewContext: null,
    reviewDetailedRating: null,
    visitedIn: null,
    originalLanguage: lang,
    translatedLanguage: null,
    author: author.displayName || null,
    time: publishTime || null,
    relativeTime: r.relativePublishTimeDescription || null,
  };
}

async function fetchPlaceReviews(placeId) {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'id,displayName,reviews',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchIndianBuffets() {
  // Paginate to avoid response-size limits; include reviewRecords to detect existing.
  const all = [];
  const pageSize = 200;
  let offset = 0;
  while (true) {
    const r = await db.query({
      buffets: {
        $: { where: { cuisineType: 'indian' }, limit: pageSize, offset, order: { serverCreatedAt: 'asc' } },
        reviewRecords: {},
      },
    });
    const page = r.buffets || [];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  console.log(`\n=== Google reviews import for INDIAN buffets — batch of ${BATCH_SIZE}${DRY_RUN ? ' (DRY RUN)' : ''} ===\n`);

  const { processedIds } = loadCheckpoint();
  console.log(`Checkpoint: ${processedIds.size} buffet(s) already attempted in prior batches.`);

  console.log('Fetching Indian buffets...');
  const buffets = await fetchIndianBuffets();
  console.log(`Fetched ${buffets.length} Indian buffets.`);

  const eligible = buffets.filter(b =>
    typeof b.placeId === 'string' &&
    b.placeId.startsWith('ChIJ') &&
    (b.reviewRecords || []).length === 0 &&
    !processedIds.has(b.id)
  );
  console.log(`Eligible (ChIJ placeId, no reviews yet, not in checkpoint): ${eligible.length}`);

  const batch = eligible.slice(0, BATCH_SIZE);
  console.log(`Processing this batch: ${batch.length}\n`);

  if (DRY_RUN) {
    batch.slice(0, 10).forEach((b, i) => console.log(`  [${i + 1}] ${b.name} (${b.cityName}, ${b.state}) — ${b.placeId}`));
    console.log(`\n[DRY RUN] Would make ${batch.length} API calls. No writes.`);
    return;
  }

  let apiCalls = 0, buffetsWithReviews = 0, reviewsSaved = 0, noReviews = 0, errors = 0;

  for (let i = 0; i < batch.length; i++) {
    const b = batch[i];
    process.stdout.write(`[${i + 1}/${batch.length}] ${b.name} (${b.cityName}, ${b.state}) ... `);
    try {
      apiCalls++;
      const place = await fetchPlaceReviews(b.placeId);
      const reviews = (place.reviews || []).slice(0, 5);
      if (reviews.length > 0) {
        const txs = reviews.map(r => db.tx.reviews[id()].create(mapReview(r)).link({ buffet: b.id }));
        await db.transact(txs);
        buffetsWithReviews++;
        reviewsSaved += txs.length;
        console.log(`saved ${txs.length}`);
      } else {
        noReviews++;
        console.log('no reviews');
      }
    } catch (e) {
      errors++;
      console.log(`ERROR: ${e.message}`);
    }
    processedIds.add(b.id);
    // Persist checkpoint incrementally so an interrupted run never re-charges.
    if (i % 10 === 0) saveCheckpoint(processedIds, { lastRun: new Date().toISOString() });
    if (i < batch.length - 1) await new Promise(res => setTimeout(res, REQUEST_DELAY_MS));
  }

  saveCheckpoint(processedIds, { lastRun: new Date().toISOString() });

  console.log('\n' + '='.repeat(50));
  console.log('BATCH COMPLETE');
  console.log('='.repeat(50));
  console.log(`API calls made:        ${apiCalls}`);
  console.log(`Buffets with reviews:  ${buffetsWithReviews}`);
  console.log(`Reviews saved:         ${reviewsSaved}`);
  console.log(`Buffets w/ no reviews: ${noReviews}`);
  console.log(`Errors:                ${errors}`);
  console.log(`Checkpoint total:      ${processedIds.size}`);
  console.log('='.repeat(50));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
