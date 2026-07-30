import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'chinese-buffets/.env') });
dotenv.config();

function getArg(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

const INPUT = path.resolve(process.cwd(), getArg('--input', 'scripts/output/llm-seo-summary-sample.jsonl'));
const OUT = path.resolve(process.cwd(), getArg('--out', 'scripts/output/llm-seo-summary-live-sample.jsonl'));
const SUMMARY = path.resolve(process.cwd(), getArg('--summary', 'scripts/output/llm-seo-summary-live-sample-summary.json'));
const PROGRESS_EVERY = Number(getArg('--progress-every', '25'));
const NEGATIVE_REVIEW_TERMS = [
  'cold', 'dirty', 'rude', 'bad', 'worst', 'slow', 'overpriced', 'gross',
  'stale', 'bland', 'disappointed', 'terrible', 'awful', 'restroom',
  'bathroom', 'complaint', 'complaints',
  'smell', 'wealth',
];
const UNSAFE_MENU_TERMS = [
  'slot', 'gacor', 'rtp', 'neymar', 'indonesia', 'ships from', 'loading',
  'accepted minta', 'pembatalan', 'rp ', 'jt', 'gambling', 'casino',
];

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANT_APP_ADMIN_TOKEN;

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: (schema as any).default || schema,
});

function parseJson(value: any, fallback: any = null) {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseUrl(url: string) {
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  if (parts.length === 3 && parts[0] === 'chinese-buffets') {
    return { citySlug: parts[1], buffetSlug: parts[2] };
  }
  return null;
}

function summarizeHours(hoursRaw: any) {
  const hours = parseJson(hoursRaw, []);
  if (!Array.isArray(hours) || hours.length === 0) return null;
  if (hours.length >= 7) return 'Hours listed for all 7 days';
  return `Hours listed for ${hours.length} days`;
}

function titleCaseKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeServiceOptions(raw: any) {
  const data = parseJson(raw, {});
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data)
    .filter(([, value]) => value === true || value === 'true')
    .map(([key]) => titleCaseKey(key))
    .slice(0, 8);
}

function summarizeStructuredData(records: any[]) {
  const items: string[] = [];
  for (const record of records || []) {
    const group = String(record.group || record.type || '').trim();
    const data = parseJson(record.data, null);
    if (!data) continue;
    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string') items.push(`${group}: ${item}`);
        if (typeof item === 'object' && item) {
          for (const [key, value] of Object.entries(item)) {
            if (value === true || value === 'true') items.push(`${group}: ${titleCaseKey(key)}`);
          }
        }
      }
    } else if (typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (value === true || value === 'true') items.push(`${group}: ${titleCaseKey(key)}`);
        if (typeof value === 'string' && value.length < 60) items.push(`${group}: ${titleCaseKey(key)} ${value}`);
      }
    } else if (data === true || data === 'true') {
      items.push(titleCaseKey(group));
    }
    if (items.length >= 10) break;
  }
  return Array.from(new Set(items)).slice(0, 10);
}

function summarizeReviewThemes(buffet: any, reviews: any[]) {
  const themes: string[] = [];
  const tags = parseJson(buffet.reviewsTags, []);
  const isSafeTheme = (value: string) => {
    const lower = value.toLowerCase();
    return !NEGATIVE_REVIEW_TERMS.some((term) => lower.includes(term));
  };
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === 'string' && isSafeTheme(tag)) themes.push(tag);
      if (tag && typeof tag === 'object' && tag.title) {
        const label = tag.count ? `${tag.title} (${tag.count} mentions)` : tag.title;
        if (isSafeTheme(label)) themes.push(label);
      }
    }
  }
  for (const value of [buffet.what_customers_are_saying_seo, buffet.reviewSummaryParagraph1, buffet.reviewSummaryParagraph2]) {
    if (typeof value === 'string' && value.trim() && isSafeTheme(value)) themes.push(value.trim().slice(0, 220));
  }
  const positiveReviews = (reviews || [])
    .filter((review: any) => (review.stars ?? review.rating ?? 0) >= 4)
    .map((review: any) => String(review.textTranslated || review.text || '').replace(/\s+/g, ' ').trim())
    .filter((text: string) => text.length >= 40 && isSafeTheme(text))
    .slice(0, 3);
  themes.push(...positiveReviews);
  return Array.from(new Set(themes)).slice(0, 6);
}

function summarizeMenu(menu: any) {
  if (!menu) return [];
  const isSafeMenuItem = (value: any) => {
    const text = String(value || '').trim();
    if (!text) return false;
    const lower = text.toLowerCase();
    if (text.length > 70) return false;
    if (UNSAFE_MENU_TERMS.some((term) => lower.includes(term))) return false;
    return /[a-z]/i.test(text);
  };
  const items = Array.isArray(menu.menuItems) ? menu.menuItems : [];
  const linkedItems = items
    .map((item: any) => item.name)
    .filter(isSafeMenuItem)
    .slice(0, 12);
  if (linkedItems.length) return linkedItems;
  const parsedItems = parseJson(menu.items, []);
  if (Array.isArray(parsedItems)) {
    return parsedItems.map((item: any) => item.name || item).filter(isSafeMenuItem).slice(0, 12);
  }
  const structured = parseJson(menu.structuredData, {});
  const categories = structured?.categories;
  if (Array.isArray(categories)) {
    return categories
      .flatMap((category: any) => category.items || [])
      .map((item: any) => item.name || item)
      .filter(isSafeMenuItem)
      .slice(0, 12);
  }
  return [];
}

async function queryBuffet(citySlug: string, buffetSlug: string) {
  const result: any = await db.query({
    cities: {
      $: { where: { slug: citySlug } },
      buffets: {
        $: { where: { slug: buffetSlug } },
        structuredData: {},
      },
    },
  });
  return result.cities?.[0]?.buffets?.[0] || null;
}

async function queryReviews(buffetId: string) {
  const result: any = await db.query({
    buffets: {
      $: { where: { id: buffetId } },
      reviewRecords: {},
    },
  });
  return (result.buffets?.[0]?.reviewRecords || [])
    .sort((a: any, b: any) => {
      const aTime = a.publishAt ? new Date(a.publishAt).getTime() : 0;
      const bTime = b.publishAt ? new Date(b.publishAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 8);
}

async function queryMenu(placeId: string | null | undefined) {
  if (!placeId) return null;
  const result: any = await db.query({
    menus: {
      $: { where: { placeId } },
      menuItems: {},
    },
  });
  const menus = result.menus || [];
  return menus.sort((a: any, b: any) => {
    const aTime = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
    const bTime = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
    return bTime - aTime;
  })[0] || null;
}

function buildPayload(url: string, buffet: any, menu: any) {
  return {
    url,
    name: buffet.name,
    city: buffet.cityName,
    state: buffet.stateAbbr || buffet.state,
    neighborhood: buffet.neighborhood || null,
    address: buffet.address || null,
    rating: buffet.rating ?? null,
    reviewsCount: buffet.reviewsCount ?? null,
    categories: parseJson(buffet.categories, buffet.categoryName ? [buffet.categoryName] : []),
    hoursSummary: summarizeHours(buffet.hours),
    price: buffet.price || null,
    hasWebsite: Boolean(buffet.website),
    hasPhone: Boolean(buffet.phone),
    photosCount: buffet.imagesCount || 0,
    existingDescription: buffet.description2 || buffet.description || buffet.what_customers_are_saying_seo || null,
    reviewThemes: summarizeReviewThemes(buffet, buffet.reviewRecords || []),
    menuItems: summarizeMenu(menu),
    amenities: [
      ...summarizeServiceOptions(buffet.serviceOptions),
      ...summarizeStructuredData(buffet.structuredData || []),
    ].slice(0, 12),
    nearbyContext: [],
  };
}

async function main() {
  const inputRows = fs.readFileSync(INPUT, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const existingRows = fs.existsSync(OUT)
    ? fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const completedUrls = new Set(existingRows.map((row: any) => row.source?.url).filter(Boolean));
  const outputRows = [...existingRows];
  const missing = [];
  let processed = 0;

  for (const row of inputRows) {
    const url = row.source.url;
    if (completedUrls.has(url)) {
      continue;
    }
    const parsed = parseUrl(url);
    if (!parsed) {
      missing.push({ url, reason: 'unsupported URL shape' });
      continue;
    }
    const buffet = await queryBuffet(parsed.citySlug, parsed.buffetSlug);
    if (!buffet) {
      missing.push({ url, reason: 'not found in InstantDB' });
      continue;
    }
    buffet.reviewRecords = await queryReviews(buffet.id);
    const menu = await queryMenu(buffet.placeId);
    const source = buildPayload(url, buffet, menu);
    const promptText = JSON.stringify(source);
    const estimatedInputTokens = Math.max(1, Math.round(promptText.length / 4) + 520);
    const outputRow = {
      sampleSet: row.sampleSet,
      model: row.model,
      estimatedInputTokens,
      estimatedOutputTokens: row.estimatedOutputTokens,
      estimatedCostUsd: Number(((estimatedInputTokens * 0.09 / 1_000_000) + (row.estimatedOutputTokens * 0.18 / 1_000_000)).toFixed(6)),
      source,
    };
    outputRows.push(outputRow);
    completedUrls.add(url);
    fs.appendFileSync(OUT, JSON.stringify(outputRow) + '\n');
    processed += 1;
    if (PROGRESS_EVERY > 0 && processed % PROGRESS_EVERY === 0) {
      console.log(`Processed ${processed} new rows, ${outputRows.length}/${inputRows.length} total written`);
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    sampleCount: outputRows.length,
    missing,
    enrichedCounts: {
      reviewThemes: outputRows.filter((row) => row.source.reviewThemes.length > 0).length,
      menuItems: outputRows.filter((row) => row.source.menuItems.length > 0).length,
      amenities: outputRows.filter((row) => row.source.amenities.length > 0).length,
    },
    estimatedInputTokens: outputRows.reduce((sum, row) => sum + row.estimatedInputTokens, 0),
    estimatedOutputTokens: outputRows.reduce((sum, row) => sum + row.estimatedOutputTokens, 0),
    estimatedCostUsd: Number(outputRows.reduce((sum, row) => sum + row.estimatedCostUsd, 0).toFixed(6)),
    files: { jsonl: OUT, summary: SUMMARY },
  };
  fs.writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  if ((error as any)?.body?.hint) {
    console.error(JSON.stringify((error as any).body.hint, null, 2));
  }
  process.exit(1);
});
