/**
 * Backfill cities.searchName
 * 
 * Populates the searchName field for all cities using normalized "city stateabbr"
 * (e.g., "Sunrise FL" -> "sunrise fl")
 * 
 * Usage:
 *   npx tsx scripts/backfill-city-search-name.ts
 *   npx tsx scripts/backfill-city-search-name.ts --dry-run
 */

import { init } from '@instantdb/admin';
import dotenv from 'dotenv';
import path from 'path';
import { normalizeSearchText } from '../lib/normalizeSearchText';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const BATCH_SIZE = 100;

function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }
  return init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');

  console.log('Backfill cities.searchName');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}\n`);

  const db = getAdminDb();

  let offset = 0;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  while (true) {
    // Fetch batch of cities
    const result = await db.query({
      cities: {
        $: { limit: BATCH_SIZE, offset },
      },
    });

    const cities = (result.cities || []) as Array<{
      id: string;
      city: string;
      stateAbbr: string;
      searchName?: string;
    }>;

    if (cities.length === 0) break;

    const updates: Array<{ id: string; searchName: string }> = [];

    for (const city of cities) {
      const expectedSearchName = normalizeSearchText(`${city.city} ${city.stateAbbr}`);
      
      // Skip if already set correctly
      if (city.searchName === expectedSearchName) {
        totalSkipped++;
        continue;
      }

      updates.push({ id: city.id, searchName: expectedSearchName });

      if (updates.length <= 3 || updates.length === cities.length) {
        console.log(`  ${city.city}, ${city.stateAbbr} -> "${expectedSearchName}"`);
      } else if (updates.length === 4) {
        console.log(`  ...`);
      }
    }

    if (updates.length > 0 && !dryRun) {
      // Batch update
      const ops = updates.map((u) =>
        db.tx.cities[u.id].update({ searchName: u.searchName })
      );
      await db.transact(ops);
      totalUpdated += updates.length;
    } else if (updates.length > 0) {
      totalUpdated += updates.length;
    }

    totalProcessed += cities.length;
    offset += BATCH_SIZE;

    console.log(`Processed ${totalProcessed} cities (${totalUpdated} updated, ${totalSkipped} skipped)`);

    if (cities.length < BATCH_SIZE) break;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done!`);
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Total updated: ${totalUpdated}`);
  console.log(`Total skipped: ${totalSkipped}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'WRITE'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
