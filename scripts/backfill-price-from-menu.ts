/**
 * Backfill buffet "price" from menu items (average - maximum).
 *
 * For each buffet that has a menu section, collects all menu item prices,
 * computes average and maximum, and stores in buffet.price as "[average] - [maximum]".
 *
 * Usage:
 *   npx tsx scripts/backfill-price-from-menu.ts              # Run full backfill
 *   npx tsx scripts/backfill-price-from-menu.ts --dry-run    # Preview only, no writes
 *   npx tsx scripts/backfill-price-from-menu.ts --limit 100  # Process only 100 buffets
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

const BUFFET_BATCH_SIZE = 200;
const UPDATE_BATCH_SIZE = 50;
const LOG_EVERY = 1; // Log every buffet for progress

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface BuffetRow {
  id: string;
  name?: string | null;
  placeId?: string | null;
}

interface MenuItemRow {
  id: string;
  name?: string | null;
  price?: string | null;
  priceNumber?: number | null;
}

interface MenuRow {
  id: string;
  placeId: string;
  scrapedAt?: string | null;
  menuItems?: MenuItemRow[];
}

// -----------------------------------------------------------------------------
// DB
// -----------------------------------------------------------------------------

function getAdminDb() {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN environment variable is required');
  }
  return init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });
}

// -----------------------------------------------------------------------------
// Price extraction
// -----------------------------------------------------------------------------

/** Parse a price string (e.g. "$12.99") to a number, or return null. */
function parsePriceValue(price: string | null | undefined): number | null {
  if (price == null || price === '') return null;
  const cleaned = String(price).replace(/[^0-9.]/g, '');
  if (cleaned === '') return null;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num < 0 || num > 1000) return null;
  return num;
}

/** Get numeric price from menu item (priceNumber or parsed price string). */
function getItemPriceNum(item: MenuItemRow): number | null {
  if (item.priceNumber != null && !Number.isNaN(item.priceNumber) && item.priceNumber >= 0 && item.priceNumber <= 1000) {
    return item.priceNumber;
  }
  return parsePriceValue(item.price);
}

/** Collect all numeric prices from a menu (categories + flat items). */
function collectPrices(menu: MenuRow): number[] {
  const nums: number[] = [];
  const items = menu.menuItems || [];
  for (const item of items) {
    const n = getItemPriceNum(item);
    if (n != null) nums.push(n);
  }
  return nums;
}

/** Format price range as "[average] - [maximum]" with 2 decimals. */
function formatPriceRange(average: number, maximum: number): string {
  const a = Math.round(average * 100) / 100;
  const m = Math.round(maximum * 100) / 100;
  return `${a.toFixed(2)} - ${m.toFixed(2)}`;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const limitArg = argv.indexOf('--limit');
  const limit = limitArg >= 0 && argv[limitArg + 1]
    ? Math.max(0, parseInt(argv[limitArg + 1], 10) || 0)
    : 0;

  console.log('');
  console.log('Backfill buffet price from menu (average - maximum)');
  console.log('Options:', { dryRun, limit: limit || 'unlimited' });
  console.log('');

  const db = getAdminDb();

  // 1) Fetch all menus with menuItems (one query, then group by placeId)
  console.log('Fetching menus with menuItems...');
  const menusResult = await db.query({
    menus: {
      $: { limit: 10000 },
      menuItems: {},
    },
  });
  const allMenus = (menusResult.menus || []) as MenuRow[];
  const menusByPlaceId = new Map<string, MenuRow>();
  for (const menu of allMenus) {
    if (!menu.placeId) continue;
    const items = menu.menuItems || [];
    if (items.length === 0) continue;
    const existing = menusByPlaceId.get(menu.placeId);
    if (!existing || (menu.scrapedAt && (!existing.scrapedAt || menu.scrapedAt > existing.scrapedAt))) {
      menusByPlaceId.set(menu.placeId, menu);
    }
  }
  console.log(`Menus with items: ${menusByPlaceId.size} (by placeId)`);
  console.log('');

  // 2) Iterate buffets in batches
  let offset = 0;
  let total = 0;
  let updated = 0;
  let skippedNoPlace = 0;
  let skippedNoMenu = 0;
  let skippedNoPrices = 0;
  let errors = 0;
  const txs: ReturnType<typeof db.tx.buffets[string]['update']>[] = [];

  while (true) {
    const batchSize = limit > 0 ? Math.min(BUFFET_BATCH_SIZE, limit - total) : BUFFET_BATCH_SIZE;
    if (limit > 0 && batchSize <= 0) break;

    const result = await db.query({
      buffets: {
        $: { limit: batchSize, offset },
      },
    });
    const buffets = (result.buffets || []) as BuffetRow[];
    if (buffets.length === 0) break;

    for (let i = 0; i < buffets.length; i++) {
      const buffet = buffets[i];
      const current = total + i + 1;
      const name = (buffet.name || buffet.id).slice(0, 40);
      const progress = limit > 0 ? `[ ${current} / ${limit} ]` : `[ ${current} ]`;

      try {
        if (!buffet.placeId) {
          skippedNoPlace++;
          if (LOG_EVERY > 0) console.log(`${progress} ${name} — skipped (no placeId)`);
          continue;
        }

        const menu = menusByPlaceId.get(buffet.placeId);
        if (!menu) {
          skippedNoMenu++;
          if (LOG_EVERY > 0) console.log(`${progress} ${name} — skipped (no menu)`);
          continue;
        }

        const prices = collectPrices(menu);
        if (prices.length === 0) {
          skippedNoPrices++;
          if (LOG_EVERY > 0) console.log(`${progress} ${name} — skipped (no prices in menu)`);
          continue;
        }

        const sum = prices.reduce((a, b) => a + b, 0);
        const avg = sum / prices.length;
        const max = Math.max(...prices);
        const formatted = formatPriceRange(avg, max);

        if (!dryRun) {
          txs.push(db.tx.buffets[buffet.id].update({ price: formatted }));
        }
        updated++;
        if (LOG_EVERY > 0) {
          console.log(`${progress} ${name} — price set to ${formatted} (${prices.length} items)`);
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${progress} ${name} — error: ${msg}`);
      }
    }

    total += buffets.length;

    // Flush updates in batches
    while (txs.length >= UPDATE_BATCH_SIZE && !dryRun) {
      const batch = txs.splice(0, UPDATE_BATCH_SIZE);
      try {
        await db.transact(batch);
      } catch (err) {
        console.error('Batch update failed:', err instanceof Error ? err.message : err);
        errors += batch.length;
      }
    }

    if (limit > 0 && total >= limit) break;
    offset += buffets.length;
    if (buffets.length < batchSize) break;
  }

  // Remaining updates
  if (txs.length > 0 && !dryRun) {
    try {
      await db.transact(txs);
    } catch (err) {
      console.error('Final batch update failed:', err instanceof Error ? err.message : err);
      errors += txs.length;
    }
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`Total buffets processed: ${total}`);
  console.log(`Updated (price set):     ${updated}`);
  console.log(`Skipped (no placeId):    ${skippedNoPlace}`);
  console.log(`Skipped (no menu):       ${skippedNoMenu}`);
  console.log(`Skipped (no prices):     ${skippedNoPrices}`);
  console.log(`Errors:                  ${errors}`);
  if (dryRun && updated > 0) {
    console.log('');
    console.log('[DRY RUN] No changes written. Run without --dry-run to apply.');
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
