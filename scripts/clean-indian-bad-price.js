#!/usr/bin/env node

/**
 * Clean invalid `price` values on INDIAN buffets.
 *
 * The Indian import mis-mapped a source field into `price`, leaving garbage
 * ("Dogs allowed", "Brunch", editorial snippets) that surfaces as the price on
 * pages and in Restaurant JSON-LD (priceRange). A valid price starts with "$"
 * or is a Google price-level word. Everything else is nulled out.
 *
 * Usage:
 *   node scripts/clean-indian-bad-price.js            # dry run (list only)
 *   node scripts/clean-indian-bad-price.js --commit   # write nulls to DB
 */

require('dotenv').config({ path: '.env.local' });
const { init, tx } = require('@instantdb/admin');

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;
const COMMIT = process.argv.includes('--commit');

if (!ADMIN_TOKEN) { console.error('ERROR: INSTANT_ADMIN_TOKEN not set'); process.exit(1); }
const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN });

const isValidPrice = (p) =>
  typeof p === 'string' &&
  (/^\$/.test(p.trim()) || /^(inexpensive|moderate|expensive|very expensive)$/i.test(p.trim()));

async function main() {
  console.log(`\n=== Clean invalid Indian buffet prices ${COMMIT ? '(COMMIT)' : '(DRY RUN)'} ===\n`);
  let all = [], off = 0;
  while (true) {
    const r = await db.query({ buffets: { $: { where: { cuisineType: 'indian' }, limit: 500, offset: off } } });
    all.push(...r.buffets);
    if (r.buffets.length < 500) break;
    off += 500;
  }

  const bad = all.filter((b) => b.price && !isValidPrice(b.price));
  console.log(`Indian buffets: ${all.length} | invalid price to null: ${bad.length}\n`);
  bad.slice(0, 30).forEach((b) => console.log(`  ${b.name} — "${b.price}"`));
  if (bad.length > 30) console.log(`  … and ${bad.length - 30} more`);

  if (!COMMIT) {
    console.log('\n[DRY RUN] Re-run with --commit to null these price values.');
    return;
  }

  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < bad.length; i += BATCH) {
    const chunk = bad.slice(i, i + BATCH);
    await db.transact(chunk.map((b) => tx.buffets[b.id].update({ price: null })));
    done += chunk.length;
    console.log(`  nulled ${done}/${bad.length}`);
  }
  console.log(`\n✅ Nulled price on ${done} Indian buffets.`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
