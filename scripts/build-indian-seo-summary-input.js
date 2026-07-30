#!/usr/bin/env node

/**
 * Build the input JSONL for the LLM SEO summary generator, for INDIAN buffets.
 *
 * Emits rows of shape { sampleSet, source: {...grounded fields...} } that
 * generate-llm-seo-summary-drafts.py consumes. `source.url` is the live
 * /indian-buffets/ pathname used to key the final map.
 *
 * Usage:
 *   node scripts/build-indian-seo-summary-input.js --limit 5   # small sample
 *   node scripts/build-indian-seo-summary-input.js             # all eligible
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { init } = require('@instantdb/admin');

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;
const argv = process.argv.slice(2);
const LIMIT = argv.includes('--limit') ? parseInt(argv[argv.indexOf('--limit') + 1] || '0', 10) : 0;
const OUT = path.resolve(process.cwd(), argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : 'scripts/output/indian-seo-summary-input.jsonl');
const BASE = 'https://buffetlocator.com';

if (!ADMIN_TOKEN) { console.error('ERROR: INSTANT_ADMIN_TOKEN not set'); process.exit(1); }
const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

function parseJson(v, fb = null) { if (!v) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } }

async function main() {
  const FIELDS = ['id','name','slug','cityName','state','stateAbbr','address','rating','reviewsCount','hours','website','phone','serviceOptions','imagesCount','neighborhood','price','cuisineType'];
  let all = [], off = 0;
  while (true) {
    const r = await db.query({ buffets: { $: { where: { cuisineType: 'indian' }, limit: 500, offset: off, fields: FIELDS } } });
    all.push(...r.buffets); if (r.buffets.length < 500) break; off += 500;
  }

  // Build citySlug lookup so the url matches the live route (city-state slug)
  const cr = await db.query({ cities: { $: { fields: ['city','stateAbbr','slug'] } } });
  const citySlug = new Map((cr.cities || []).map(c => [`${c.city}|||${c.stateAbbr}`, c.slug]));

  let rows = all
    .map(b => {
      const cs = citySlug.get(`${b.cityName}|||${b.stateAbbr}`);
      if (!cs || !b.slug) return null;
      const so = parseJson(b.serviceOptions, null);
      const source = {
        url: `${BASE}/indian-buffets/${cs}/${b.slug}`,
        name: b.name,
        category: 'Indian buffet',
        city: b.cityName || null,
        state: b.state || b.stateAbbr || null,
        address: b.address || null,
        rating: typeof b.rating === 'number' ? b.rating : null,
        reviewsCount: typeof b.reviewsCount === 'number' ? b.reviewsCount : null,
        neighborhood: b.neighborhood || null,
        hasHours: !!(b.hours && String(b.hours).length > 2),
        hasWebsite: !!b.website,
        hasPhone: !!(b.phone),
        serviceOptions: so || null,
        priceRange: b.price || null,
      };
      // strip null/empty so the model isn't fed blank fields
      Object.keys(source).forEach(k => { const v = source[k]; if (v === null || v === '' || (Array.isArray(v) && !v.length)) delete source[k]; });
      return { sampleSet: 'indian', source };
    })
    .filter(Boolean);

  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  console.log(`Wrote ${rows.length} rows -> ${OUT}`);
  console.log('Sample source[0]:', JSON.stringify(rows[0]?.source, null, 1));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
