import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import { getCuisineBasePath } from '../lib/cuisine';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'chinese-buffets/.env') });
dotenv.config();

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANT_APP_ADMIN_TOKEN;
const OUT = path.resolve(process.cwd(), 'lib/generated/llm-good-to-know.json');
const SUMMARY_OUT = path.resolve(process.cwd(), 'scripts/output/good-to-know-summary.json');

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: (schema as any).default || schema,
});

function parseJson(value: unknown, fallback: any = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hasFaqs(value: unknown) {
  if (!value || typeof value !== 'string' || value.trim().length === 0) return false;
  const parsed = parseJson(value, null);
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (Array.isArray(parsed?.items)) return parsed.items.length > 0;
  return true;
}

function hasHours(value: unknown) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) && parsed.length > 0;
}

function parseServiceOptions(value: unknown) {
  const data = parseJson(value, {});
  if (!data || typeof data !== 'object') return new Set<string>();
  return new Set(
    Object.entries(data)
      .filter(([, raw]) => raw === true || raw === 'true')
      .map(([key]) => key.toLowerCase())
  );
}

function pushUnique(items: string[], value: string) {
  if (!items.includes(value)) items.push(value);
}

function buildBullets(buffet: any) {
  const bullets: string[] = [];
  const name = buffet.name || 'This buffet';
  const location = [buffet.cityName, buffet.stateAbbr || buffet.state].filter(Boolean).join(', ');
  const services = parseServiceOptions(buffet.serviceOptions);

  if (buffet.address && location) {
    pushUnique(bullets, `${name} has a listed address in ${location}, so visitors can confirm the exact location before going.`);
  } else if (location) {
    pushUnique(bullets, `${name} is listed in ${location}; check the page details before planning a visit.`);
  }

  if (typeof buffet.rating === 'number' && typeof buffet.reviewsCount === 'number' && buffet.reviewsCount > 0) {
    pushUnique(bullets, `The page includes a ${buffet.rating.toFixed(1)}-star rating from ${buffet.reviewsCount.toLocaleString('en-US')} reviews.`);
  } else if (typeof buffet.reviewsCount === 'number' && buffet.reviewsCount > 0) {
    pushUnique(bullets, `Review count is listed on the page, giving visitors another signal for comparing nearby options.`);
  }

  if (hasHours(buffet.hours)) {
    pushUnique(bullets, `Hours are listed on the page; verify current hours before making a special trip.`);
  }

  if (buffet.website && buffet.phone) {
    pushUnique(bullets, `Website and phone details are available for checking current menu, hours, or availability.`);
  } else if (buffet.website) {
    pushUnique(bullets, `A website is listed for checking current details before visiting.`);
  } else if (buffet.phone) {
    pushUnique(bullets, `A phone number is listed for confirming current details before visiting.`);
  }

  const serviceSignals = [
    services.has('takeout') ? 'takeout' : null,
    services.has('delivery') ? 'delivery' : null,
    services.has('dinein') || services.has('dine in') ? 'dine-in' : null,
    services.has('reservations') ? 'reservations' : null,
  ].filter(Boolean);
  if (serviceSignals.length) {
    pushUnique(bullets, `Service details include ${serviceSignals.slice(0, 3).join(', ')}.`);
  }

  if (buffet.imagesCount && Number(buffet.imagesCount) > 0) {
    pushUnique(bullets, `Photos are available on the page to help preview the restaurant before visiting.`);
  }

  if (hasFaqs(buffet.questionsAndAnswers)) {
    pushUnique(bullets, `The FAQ section includes additional answers about this location.`);
  }

  if (!bullets.length) {
    pushUnique(bullets, `${name} has a dedicated page with available location details for visitors comparing buffet options.`);
  }

  return bullets.slice(0, 5);
}

async function main() {
  const cityResult: any = await db.query({
    cities: { $: { fields: ['city', 'stateAbbr', 'slug'] } },
  });
  const citySlugByNameState = new Map<string, string>();
  for (const city of cityResult.cities || []) {
    citySlugByNameState.set(`${city.city}|||${city.stateAbbr}`, city.slug);
  }

  const output: Record<string, { items: string[]; generatedAt: string; sourceMethod: string }> = {};
  const missingCitySlug: Array<{ id: string; name: string; cityName: string; stateAbbr: string }> = [];
  const bucketCounts: Record<string, number> = {};
  const batchSize = 500;
  let offset = 0;
  let scanned = 0;

  while (true) {
    const result: any = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
          fields: [
            'id', 'name', 'slug', 'cityName', 'state', 'stateAbbr', 'address', 'rating',
            'reviewsCount', 'hours', 'website', 'phone', 'serviceOptions', 'imagesCount',
            'questionsAndAnswers', 'cuisineType',
          ],
        },
      },
    });
    const buffets = result.buffets || [];
    if (!buffets.length) break;

    for (const buffet of buffets) {
      scanned += 1;
      const citySlug = citySlugByNameState.get(`${buffet.cityName}|||${buffet.stateAbbr}`);
      if (!citySlug || !buffet.slug) {
        missingCitySlug.push({
          id: buffet.id,
          name: buffet.name,
          cityName: buffet.cityName,
          stateAbbr: buffet.stateAbbr,
        });
        continue;
      }
      const items = buildBullets(buffet);
      const pathname = `${getCuisineBasePath(buffet.cuisineType)}/${citySlug}/${buffet.slug}`;
      output[pathname] = {
        items,
        generatedAt: new Date().toISOString(),
        sourceMethod: 'deterministic_structured_facts',
      };
      const bucket = `${items.length}`;
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    }

    console.log(`Scanned ${scanned} buffets`);
    if (buffets.length < batchSize) break;
    offset += batchSize;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.mkdirSync(path.dirname(SUMMARY_OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(dictSorted(output), null, 2) + '\n');
  const summary = {
    generatedAt: new Date().toISOString(),
    scanned,
    written: Object.keys(output).length,
    missingCitySlug: missingCitySlug.length,
    bucketCounts,
    files: { json: OUT, summary: SUMMARY_OUT },
  };
  fs.writeFileSync(SUMMARY_OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

function dictSorted<T>(value: Record<string, T>) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
