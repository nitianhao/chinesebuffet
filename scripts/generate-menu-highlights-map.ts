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
const OUT = path.resolve(process.cwd(), 'lib/generated/llm-menu-highlights.json');
const SUMMARY_OUT = path.resolve(process.cwd(), 'scripts/output/menu-highlights-summary.json');

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: (schema as any).default || schema,
});

const UNSAFE_TERMS = [
  'slot', 'gacor', 'casino', 'cookie', 'javascript', 'loading', 'captcha',
  'not found', 'access denied', 'privacy policy', 'terms of service',
];

const DISH_PATTERNS: Array<[string, RegExp]> = [
  ['sushi', /\bsushi|maki|nigiri|sashimi\b/i],
  ['seafood', /\bseafood|shrimp|crab|lobster|fish|clam|mussel\b/i],
  ['hibachi or grill items', /\bhibachi|grill|teriyaki\b/i],
  ['Mongolian grill items', /\bmongolian\b/i],
  ['chicken dishes', /\bchicken|wings?\b/i],
  ['beef dishes', /\bbeef|steak\b/i],
  ['pork dishes', /\bpork|rib\b/i],
  ['noodle dishes', /\bnoodle|lo mein|chow mein|mei fun|udon|pho\b/i],
  ['fried rice', /\bfried rice|rice\b/i],
  ['soups', /\bsoup|wonton|egg drop|hot and sour\b/i],
  ['appetizers', /\bappetizer|egg roll|spring roll|dumpling|rangoon|wonton\b/i],
  ['vegetable or tofu dishes', /\bvegetable|broccoli|tofu|bean curd\b/i],
  ['desserts', /\bdessert|cake|ice cream|cookie|pudding\b/i],
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

function safeText(value: unknown) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  if (!text || text.length > 80) return '';
  if (!/[a-z]/i.test(text)) return '';
  if (UNSAFE_TERMS.some((term) => lower.includes(term))) return '';
  return text;
}

function collectMenuItems(menu: any) {
  const names: string[] = [];
  const linked = Array.isArray(menu.menuItems) ? menu.menuItems : [];
  for (const item of linked) {
    const name = safeText(item.name);
    if (name) names.push(name);
  }
  const parsedItems = parseJson(menu.items, []);
  if (Array.isArray(parsedItems)) {
    for (const item of parsedItems) {
      const name = safeText(item?.name || item);
      if (name) names.push(name);
    }
  }
  const structured = parseJson(menu.structuredData, {});
  if (Array.isArray(structured?.categories)) {
    for (const category of structured.categories) {
      for (const item of category.items || []) {
        const name = safeText(item?.name || item);
        if (name) names.push(name);
      }
    }
  }
  return Array.from(new Set(names)).slice(0, 80);
}

function collectCategories(menu: any) {
  const labels: string[] = [];
  const linked = Array.isArray(menu.menuItems) ? menu.menuItems : [];
  for (const item of linked) {
    const category = safeText(item.categoryName);
    if (category) labels.push(category);
  }
  const parsedCategories = parseJson(menu.categories, []);
  if (Array.isArray(parsedCategories)) {
    for (const category of parsedCategories) {
      const name = safeText(category?.name || category);
      if (name) labels.push(name);
    }
  }
  const structured = parseJson(menu.structuredData, {});
  if (Array.isArray(structured?.categories)) {
    for (const category of structured.categories) {
      const name = safeText(category?.name || category);
      if (name) labels.push(name);
    }
  }
  return Array.from(new Set(labels)).slice(0, 20);
}

function formatList(items: string[]) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildHighlights(menu: any) {
  const items = collectMenuItems(menu);
  const categories = collectCategories(menu);
  if (items.length < 5 && categories.length < 2) return [];

  const haystack = [...items, ...categories].join(' | ');
  const dishSignals = DISH_PATTERNS
    .filter(([, pattern]) => pattern.test(haystack))
    .map(([label]) => label)
    .slice(0, 6);

  const highlights: string[] = [];
  if (categories.length >= 2) {
    highlights.push(`Menu data includes categories such as ${formatList(categories.slice(0, 4).map((item) => item.toLowerCase()))}.`);
  }
  if (dishSignals.length >= 2) {
    highlights.push(`Detected menu signals include ${formatList(dishSignals.slice(0, 5))}.`);
  }
  if (items.length >= 5) {
    highlights.push(`The linked menu data includes ${items.length.toLocaleString('en-US')} named item${items.length === 1 ? '' : 's'} for comparison.`);
  }
  if (menu.sourceUrl) {
    highlights.push('Use the linked menu source to confirm current availability and pricing before visiting.');
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
  const batchSize = 500;
  let offset = 0;
  let scanned = 0;
  let buffetsWithMenus = 0;
  let eligible = 0;
  let missingCitySlug = 0;
  const bucketCounts: Record<string, number> = {};

  while (true) {
    const result: any = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
          fields: ['id', 'name', 'slug', 'cityName', 'stateAbbr', 'placeId'],
        },
      },
    });
    const buffets = result.buffets || [];
    if (!buffets.length) break;

    for (const buffet of buffets) {
      scanned += 1;
      if (!buffet.placeId) continue;
      const citySlug = citySlugByNameState.get(`${buffet.cityName}|||${buffet.stateAbbr}`);
      if (!citySlug || !buffet.slug) {
        missingCitySlug += 1;
        continue;
      }
      const menuResult: any = await db.query({
        menus: {
          $: { where: { placeId: buffet.placeId } },
          menuItems: {},
        },
      });
      const menus = menuResult.menus || [];
      if (!menus.length) continue;
      buffetsWithMenus += 1;
      const latestMenu = menus.sort((a: any, b: any) => {
        const aTime = a.scrapedAt ? new Date(a.scrapedAt).getTime() : 0;
        const bTime = b.scrapedAt ? new Date(b.scrapedAt).getTime() : 0;
        return bTime - aTime;
      })[0];
      const items = buildHighlights(latestMenu);
      if (items.length < 2) continue;
      eligible += 1;
      output[`/chinese-buffets/${citySlug}/${buffet.slug}`] = {
        items,
        generatedAt: new Date().toISOString(),
        sourceMethod: 'deterministic_menu_records',
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
    buffetsWithMenus,
    eligible,
    written: Object.keys(output).length,
    missingCitySlug,
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
