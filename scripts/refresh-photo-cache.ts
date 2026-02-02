/**
 * Out-of-band script to refresh photo cache
 *
 * Warms the photo cache by fetching images for buffets from the DB
 * and hitting the API endpoints (which populate the cache).
 *
 * Run with: npx tsx scripts/refresh-photo-cache.ts
 * Or: BASE_URL=https://yoursite.com npx tsx scripts/refresh-photo-cache.ts
 *
 * For cron: Run against production URL to pre-warm cache before traffic.
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const BASE_URL = process.env.BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface ImageRef {
  photoReference?: string;
  photoUrl?: string;
  widthPx?: number;
  heightPx?: number;
}

function parseImages(buffet: any): ImageRef[] {
  const raw = buffet.images;
  if (!raw) return [];
  let arr: any[] = [];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else {
    return [];
  }
  const refs: ImageRef[] = [];
  for (const img of arr) {
    if (typeof img === 'string') {
      refs.push({ photoUrl: img });
      continue;
    }
    if (typeof img === 'object' && img) {
      if (img.photoReference) {
        refs.push({
          photoReference: img.photoReference,
          widthPx: img.widthPx,
          heightPx: img.heightPx,
        });
      } else if (img.photoUrl) {
        refs.push({
          photoUrl: img.photoUrl,
          widthPx: img.widthPx,
          heightPx: img.heightPx,
        });
      }
    }
  }
  return refs;
}

async function warmPlacePhoto(photoReference: string, maxWidthPx: number): Promise<boolean> {
  const url = `${BASE_URL}/api/place-photo?photoReference=${encodeURIComponent(photoReference)}&maxWidthPx=${maxWidthPx}`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (e) {
    console.error(`  [place-photo] ${photoReference.slice(0, 50)}... failed:`, e);
    return false;
  }
}

async function warmExternalPhoto(photoUrl: string, maxWidthPx: number): Promise<boolean> {
  const url = `${BASE_URL}/api/photo?url=${encodeURIComponent(photoUrl)}&maxWidthPx=${maxWidthPx}`;
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (e) {
    console.error(`  [photo] ${photoUrl.slice(0, 50)}... failed:`, e);
    return false;
  }
}

async function main() {
  const { init } = await import('@instantdb/admin');
  const schemaModule = await import('../src/instant.schema');
  const schema = schemaModule.default ?? schemaModule;

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;

  if (!adminToken) {
    console.error('INSTANT_ADMIN_TOKEN required');
    process.exit(1);
  }

  const db = init({ appId, adminToken, schema });

  console.log('Fetching buffets with images...');
  const result = await db.query({
    buffets: {
      $: {
        where: { imagesCount: { $gt: 0 } },
        limit: 5000,
      },
    },
  });

  const buffets = result.buffets || [];
  console.log(`Found ${buffets.length} buffets with images`);

  const seenPlace = new Set<string>();
  const seenUrl = new Set<string>();
  let placeOk = 0;
  let placeFail = 0;
  let urlOk = 0;
  let urlFail = 0;

  const BATCH_DELAY = 50; // ms between requests to avoid hammering
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < buffets.length; i++) {
    const buffet = buffets[i];
    const images = parseImages(buffet);
    if (images.length === 0) continue;

    for (const img of images.slice(0, 6)) {
      const maxWidthPx = img.widthPx ? Math.min(1200, img.widthPx) : 800;
      if (img.photoReference) {
        const key = `${img.photoReference}:${maxWidthPx}`;
        if (seenPlace.has(key)) continue;
        seenPlace.add(key);
        const ok = await warmPlacePhoto(img.photoReference, maxWidthPx);
        if (ok) placeOk++;
        else placeFail++;
        await sleep(BATCH_DELAY);
      } else if (img.photoUrl) {
        const key = `${img.photoUrl}:${maxWidthPx}`;
        if (seenUrl.has(key)) continue;
        seenUrl.add(key);
        const ok = await warmExternalPhoto(img.photoUrl, maxWidthPx);
        if (ok) urlOk++;
        else urlFail++;
        await sleep(BATCH_DELAY);
      }
    }

    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${buffets.length} buffets, ${placeOk + urlOk} photos warmed`);
    }
  }

  console.log('\nDone.');
  console.log(`Place photos: ${placeOk} ok, ${placeFail} failed`);
  console.log(`External photos: ${urlOk} ok, ${urlFail} failed`);
  console.log(`Total unique photos warmed: ${seenPlace.size + seenUrl.size}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
