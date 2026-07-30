import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'chinese-buffets/.env') });
dotenv.config();

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANT_APP_ADMIN_TOKEN;
const OUT = path.resolve(process.cwd(), 'lib/generated/llm-customer-highlights.json');
const SUMMARY_OUT = path.resolve(process.cwd(), 'scripts/output/customer-highlights-summary.json');

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: (schema as any).default || schema,
});

const NEGATIVE_TERMS = [
  'bad', 'cold', 'dirty', 'gross', 'rude', 'slow', 'stale', 'terrible', 'worst',
  'awful', 'complaint', 'overpriced', 'bland', 'disappointed', 'bathroom',
];

const THEME_PATTERNS: Array<[string, RegExp]> = [
  ['sushi', /\bsushi\b/i],
  ['seafood', /\bseafood\b/i],
  ['crab', /\bcrab\b/i],
  ['shrimp', /\bshrimp\b/i],
  ['hibachi', /\bhibachi\b/i],
  ['mongolian grill', /\bmongolian\b/i],
  ['buffet selection', /\b(selection|variety|options)\b/i],
  ['dessert options', /\bdesserts?\b/i],
  ['fresh food', /\bfresh\b/i],
  ['service', /\b(service|staff|server|employees?)\b/i],
  ['cleanliness', /\bclean\b/i],
  ['value', /\b(value|price|worth)\b/i],
  ['family visits', /\b(kids|children|family)\b/i],
  ['takeout', /\btakeout|to go\b/i],
];

function parseJson(value: unknown, fallback: any = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isSafeText(value: string) {
  const lower = value.toLowerCase();
  return value.trim().length > 0 && !NEGATIVE_TERMS.some((term) => lower.includes(term));
}

function extractTagLabels(value: unknown) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((tag) => (typeof tag === 'string' ? tag : tag?.title))
    .filter((label): label is string => typeof label === 'string' && isSafeText(label))
    .slice(0, 8);
}

function extractThemesFromText(texts: string[]) {
  const themes: string[] = [];
  for (const text of texts) {
    if (!isSafeText(text)) continue;
    for (const [label, pattern] of THEME_PATTERNS) {
      if (pattern.test(text) && !themes.includes(label)) themes.push(label);
    }
  }
  return themes.slice(0, 6);
}

function formatList(items: string[]) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildHighlights(buffet: any) {
  const highlights: string[] = [];
  const tags = extractTagLabels(buffet.reviewsTags);
  const positiveTexts = (buffet.reviewRecords || [])
    .filter((review: any) => (review.stars ?? review.rating ?? 0) >= 4)
    .map((review: any) => String(review.textTranslated || review.text || '').replace(/\s+/g, ' ').trim())
    .filter((text: string) => text.length >= 40 && isSafeText(text))
    .slice(0, 8);
  const tagThemes = extractThemesFromText(tags);
  const textThemes = extractThemesFromText(positiveTexts);
  const themes = Array.from(new Set([...tagThemes, ...textThemes]));

  if (typeof buffet.rating === 'number' && typeof buffet.reviewsCount === 'number' && buffet.reviewsCount >= 25) {
    highlights.push(`Customers have left ${buffet.reviewsCount.toLocaleString('en-US')} reviews, with an average rating of ${buffet.rating.toFixed(1)} stars.`);
  }

  if (tags.length >= 2) {
    highlights.push(`Review tags mention ${formatList(tags.slice(0, 4).map((tag) => tag.toLowerCase()))}.`);
  }

  if (themes.length >= 2) {
    highlights.push(`Positive review text points to ${formatList(themes.slice(0, 4))}.`);
  }

  if (positiveTexts.length >= 3) {
    highlights.push(`Recent positive review text gives this page enough customer detail to compare it with nearby buffet options.`);
  }

  return Array.from(new Set(highlights)).slice(0, 4);
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
  let eligible = 0;

  while (true) {
    const result: any = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
          fields: ['id', 'name', 'slug', 'cityName', 'stateAbbr', 'rating', 'reviewsCount', 'reviewsTags'],
        },
        reviewRecords: {},
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

      const items = buildHighlights(buffet);
      if (items.length < 2) continue;
      eligible += 1;
      output[`/chinese-buffets/${citySlug}/${buffet.slug}`] = {
        items,
        generatedAt: new Date().toISOString(),
        sourceMethod: 'deterministic_review_signals',
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
  fs.writeFileSync(OUT, JSON.stringify(Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b))), null, 2) + '\n');
  const summary = {
    generatedAt: new Date().toISOString(),
    scanned,
    eligible,
    written: Object.keys(output).length,
    missingCitySlug: missingCitySlug.length,
    bucketCounts,
    files: { json: OUT, summary: SUMMARY_OUT },
  };
  fs.writeFileSync(SUMMARY_OUT, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
