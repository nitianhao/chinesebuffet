/**
 * Backfill Neighborhoods Entity
 * 
 * This script extracts unique neighborhoods from buffets and creates
 * searchable neighborhood records.
 * 
 * Usage: npx tsx scripts/backfillNeighborhoods.ts
 */

import { init, tx, id } from '@instantdb/admin';
import schema from '../src/instant.schema';

// Initialize InstantDB
const db = init({
  appId: process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  schema,
});

// Normalize text for search index (same as cities/buffets)
function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate URL-safe slug
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

interface NeighborhoodData {
  neighborhood: string;
  slug: string;
  fullSlug: string;
  searchName: string;
  citySlug: string;
  cityName: string;
  stateAbbr: string;
  buffetCount: number;
  avgRating: number | null;
}

async function main() {
  console.log('🏘️ Starting neighborhoods backfill...\n');

  // 1. Fetch all buffets with their city data in batches
  console.log('📥 Fetching buffets with neighborhoods (in batches)...');
  const FETCH_BATCH_SIZE = 500;
  let allBuffets: any[] = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { buffets: batch } = await db.query({
      buffets: {
        $: { 
          limit: FETCH_BATCH_SIZE,
          offset,
        },
        city: {},
      },
    });
    
    if (!batch || batch.length === 0) {
      hasMore = false;
    } else {
      allBuffets = allBuffets.concat(batch);
      offset += batch.length;
      process.stdout.write(`  Fetched ${allBuffets.length} buffets...\r`);
      
      if (batch.length < FETCH_BATCH_SIZE) {
        hasMore = false;
      }
    }
  }
  
  console.log(`\nFetched ${allBuffets.length} total buffets\n`);
  
  const buffets = allBuffets;

  if (!buffets || buffets.length === 0) {
    console.log('❌ No buffets found');
    return;
  }

  // 2. Group buffets by neighborhood within each city
  const neighborhoodMap = new Map<string, {
    neighborhood: string;
    citySlug: string;
    cityName: string;
    stateAbbr: string;
    ratings: number[];
    count: number;
  }>();

  let buffetsWithNeighborhood = 0;
  
  for (const buffet of buffets) {
    const neighborhood = (buffet as any).neighborhood;
    if (!neighborhood || typeof neighborhood !== 'string' || !neighborhood.trim()) {
      continue;
    }

    const city = (buffet as any).city;
    const citySlug = city?.slug || '';
    const cityName = city?.city || (buffet as any).cityName || '';
    const stateAbbr = city?.stateAbbr || (buffet as any).stateAbbr || '';

    if (!citySlug) {
      continue;
    }

    const neighborhoodSlug = generateSlug(neighborhood);
    const fullSlug = `${citySlug}/${neighborhoodSlug}`;

    buffetsWithNeighborhood++;

    const existing = neighborhoodMap.get(fullSlug);
    if (existing) {
      existing.count++;
      const rating = (buffet as any).rating;
      if (typeof rating === 'number' && rating > 0) {
        existing.ratings.push(rating);
      }
    } else {
      const rating = (buffet as any).rating;
      neighborhoodMap.set(fullSlug, {
        neighborhood: neighborhood.trim(),
        citySlug,
        cityName,
        stateAbbr,
        ratings: typeof rating === 'number' && rating > 0 ? [rating] : [],
        count: 1,
      });
    }
  }

  console.log(`Found ${buffetsWithNeighborhood} buffets with neighborhoods`);
  console.log(`Found ${neighborhoodMap.size} unique neighborhoods\n`);

  // 3. Build neighborhood records
  const neighborhoods: NeighborhoodData[] = [];

  for (const [fullSlug, data] of neighborhoodMap) {
    const neighborhoodSlug = generateSlug(data.neighborhood);
    const searchName = normalizeForSearch(`${data.neighborhood} ${data.cityName} ${data.stateAbbr}`);
    
    const avgRating = data.ratings.length > 0
      ? Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 10) / 10
      : null;

    neighborhoods.push({
      neighborhood: data.neighborhood,
      slug: neighborhoodSlug,
      fullSlug,
      searchName,
      citySlug: data.citySlug,
      cityName: data.cityName,
      stateAbbr: data.stateAbbr,
      buffetCount: data.count,
      avgRating,
    });
  }

  // Sort by buffet count descending
  neighborhoods.sort((a, b) => b.buffetCount - a.buffetCount);

  console.log(`Top 10 neighborhoods by buffet count:`);
  neighborhoods.slice(0, 10).forEach((n, i) => {
    console.log(`  ${i + 1}. ${n.neighborhood}, ${n.cityName}, ${n.stateAbbr} (${n.buffetCount} buffets)`);
  });
  console.log('');

  // 4. Clear existing neighborhoods
  console.log('🗑️ Clearing existing neighborhood records...');
  const { neighborhoods: existingNeighborhoods } = await db.query({
    neighborhoods: { $: { limit: 10000 } },
  });

  if (existingNeighborhoods && existingNeighborhoods.length > 0) {
    const deleteTxs = existingNeighborhoods.map((n: any) => tx.neighborhoods[n.id].delete());
    const BATCH_SIZE = 100;
    for (let i = 0; i < deleteTxs.length; i += BATCH_SIZE) {
      const batch = deleteTxs.slice(i, i + BATCH_SIZE);
      await db.transact(batch);
      process.stdout.write(`  Deleted ${Math.min(i + BATCH_SIZE, deleteTxs.length)}/${deleteTxs.length}\r`);
    }
    console.log(`  Deleted ${existingNeighborhoods.length} existing records\n`);
  }

  // 5. Insert new neighborhoods
  console.log('📤 Inserting neighborhood records...');
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < neighborhoods.length; i += BATCH_SIZE) {
    const batch = neighborhoods.slice(i, i + BATCH_SIZE);
    const txs = batch.map((n) =>
      tx.neighborhoods[id()].update({
        neighborhood: n.neighborhood,
        slug: n.slug,
        fullSlug: n.fullSlug,
        searchName: n.searchName,
        citySlug: n.citySlug,
        cityName: n.cityName,
        stateAbbr: n.stateAbbr,
        buffetCount: n.buffetCount,
        avgRating: n.avgRating,
      })
    );
    await db.transact(txs);
    inserted += batch.length;
    process.stdout.write(`  Inserted ${inserted}/${neighborhoods.length}\r`);
  }

  console.log(`\n\n✅ Backfill complete!`);
  console.log(`   Total neighborhoods: ${neighborhoods.length}`);
  console.log(`   Total buffets with neighborhoods: ${buffetsWithNeighborhood}`);
}

main().catch(console.error);
