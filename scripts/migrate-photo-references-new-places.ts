import { init } from '@instantdb/admin';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const DRY_RUN = process.env.DRY_RUN !== '0';
const BATCH_SIZE = 50;
const MAX_PHOTOS = 20;
const SLEEP_MS = 150;
const PROGRESS_EVERY = 50;

function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }
  return init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseImages(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractPlaceId(buffet: any, images: any[]): string | null {
  if (buffet?.placeId && typeof buffet.placeId === 'string') {
    return buffet.placeId;
  }
  const firstRef = images.find((img) => typeof img?.photoReference === 'string')?.photoReference;
  if (typeof firstRef === 'string' && firstRef.startsWith('places/')) {
    return firstRef.split('/')[1] || null;
  }
  return null;
}

function prefix(value: string | undefined | null, length: number = 50): string {
  if (!value) return 'none';
  return value.slice(0, length);
}

function isNewPhotoReference(value: unknown): boolean {
  return typeof value === 'string' && value.includes('/photos/AcnlKN');
}

function hasOnlyNewPhotoReferences(images: any[]): boolean {
  if (images.length === 0) return false;
  return images.every((img) => isNewPhotoReference(img?.photoReference));
}

async function main() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_MAPS_API_KEY is required');
  }

  console.log('Migrate buffet photoReference to Places API (New) names');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'WRITE'}`);
  console.log(`Batch size: ${BATCH_SIZE}, max photos: ${MAX_PHOTOS}\n`);

  const db = getAdminDb();

  let totalBuffets = 0;
  let totalWithPhotos = 0;
  let countOffset = 0;
  while (true) {
    const countResult = await db.query({
      buffets: {
        $: { limit: BATCH_SIZE, offset: countOffset },
      },
    });
    const countBatch = (countResult.buffets || []) as any[];
    if (countBatch.length === 0) break;
    totalBuffets += countBatch.length;
    for (const buffet of countBatch) {
      const images = parseImages(buffet.images);
      if (images.length > 0) totalWithPhotos += 1;
    }
    countOffset += BATCH_SIZE;
    if (countBatch.length < BATCH_SIZE) break;
  }

  console.log(`Total buffets: ${totalBuffets}`);
  console.log(`Total with photos: ${totalWithPhotos}\n`);

  let offset = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit: BATCH_SIZE, offset },
      },
    });

    const buffets = (result.buffets || []) as any[];
    if (buffets.length === 0) break;

    for (const buffet of buffets) {
      processed += 1;

      const images = parseImages(buffet.images);
      if (images.length === 0) {
        skipped += 1;
        continue;
      }

      if (hasOnlyNewPhotoReferences(images)) {
        console.log(
          `[skip] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> already migrated`
        );
        skipped += 1;
        continue;
      }

      const placeId = extractPlaceId(buffet, images);
      if (!placeId) {
        console.log(
          `[skip] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> missing placeId`
        );
        skipped += 1;
        continue;
      }

      const oldFirst = images[0]?.photoReference;
      const placesBase = 'https://places.' + 'googleapis.com/v1';
      const url = `${placesBase}/places/${placeId}?fields=photos`;

      try {
        const res = await fetch(url, {
          headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'photos',
          },
          cache: 'no-store',
        });

        const text = await res.text();
        if (!res.ok) {
          console.log(
            `[error] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> ${res.status}`
          );
          failed += 1;
          await sleep(SLEEP_MS);
          continue;
        }

        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          console.log(
            `[error] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> non-JSON`
          );
          failed += 1;
          await sleep(SLEEP_MS);
          continue;
        }

        const photos = Array.isArray(json?.photos) ? json.photos : [];
        if (photos.length === 0) {
          console.log(
            `[skip] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> no photos`
          );
          skipped += 1;
          await sleep(SLEEP_MS);
          continue;
        }

        const newPhotos = photos.slice(0, MAX_PHOTOS).map((p: any) => ({
          photoReference: p?.name,
        }));
        const newFirst = newPhotos[0]?.photoReference;

        console.log(
          `[buffet] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} | oldFirst=${prefix(
            oldFirst
          )} | newFirst=${prefix(newFirst)} | oldCount=${images.length} | newCount=${
            newPhotos.length
          }`
        );

        if (!DRY_RUN) {
          const updateValue =
            typeof buffet.images === 'string' ? JSON.stringify(newPhotos) : newPhotos;
          await db.transact([db.tx.buffets[buffet.id].update({ images: updateValue })]);
        }

        updated += 1;
      } catch (err: any) {
        console.log(
          `[error] ${buffet.id} ${buffet.slug || ''} ${buffet.name || ''} -> ${String(
            err?.message ?? err
          )}`
        );
        failed += 1;
      }

      await sleep(SLEEP_MS);

      if (processed % PROGRESS_EVERY === 0) {
        const remaining = Math.max(totalBuffets - processed, 0);
        console.log(
          `[progress] processed=${processed}/${totalBuffets} remaining=${remaining} updated=${updated} skipped=${skipped} failed=${failed}`
        );
      }
    }

    offset += BATCH_SIZE;
    if (buffets.length < BATCH_SIZE) break;
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Done.`);
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'WRITE'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
