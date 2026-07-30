import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'chinese-buffets/.env') });
dotenv.config();

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

function getArg(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function parseFaqCount(value: unknown): number {
  if (!value || typeof value !== 'string' || value.trim().length === 0) return 0;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed?.items)) return parsed.items.length;
    if (Array.isArray(parsed?.mainEntity)) return parsed.mainEntity.length;
    if (Array.isArray(parsed?.questionsAndAnswers)) return parsed.questionsAndAnswers.length;
  } catch {
    return 1;
  }
  return 1;
}

function pathFromUrl(url: string): string {
  return new URL(url).pathname.replace(/\/$/, '');
}

function loadPathSet(filePath: string, kind: 'json-map' | 'jsonl-source'): Set<string> {
  if (!filePath || !fs.existsSync(filePath)) return new Set();
  if (kind === 'json-map') {
    return new Set(Object.keys(JSON.parse(fs.readFileSync(filePath, 'utf8'))));
  }
  const paths = new Set<string>();
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const url = row.source?.url || row.url;
    if (url) paths.add(pathFromUrl(url));
  }
  return paths;
}

async function main() {
  const batchSize = Number(getArg('--batch-size', '500'));
  const out = getArg('--out', 'scripts/output/faq-coverage-summary.json');
  const acceptedSummaryMap = loadPathSet(getArg('--accepted-map', 'lib/generated/llm-seo-summary-drafts.json'), 'json-map');
  const notIndexedSeed = loadPathSet(getArg('--not-indexed-seed', 'scripts/output/not-indexed-all/llm-seo-summary-url-seed.jsonl'), 'jsonl-source');
  const citiesResult: any = await db.query({
    cities: { $: { fields: ['city', 'stateAbbr', 'slug'] } },
  });
  const citySlugByNameState = new Map<string, string>();
  for (const city of citiesResult.cities || []) {
    citySlugByNameState.set(`${city.city}|||${city.stateAbbr}`, city.slug);
  }

  const totals = {
    totalBuffets: 0,
    withFaqs: 0,
    withoutFaqs: 0,
    withAtLeast5Faqs: 0,
    acceptedSummaryPages: acceptedSummaryMap.size,
    acceptedSummaryMatchedPagePaths: 0,
    acceptedSummaryUnmatchedPagePaths: 0,
    acceptedSummaryWithFaqs: 0,
    acceptedSummaryWithoutFaqs: 0,
    notIndexedRestaurantUrls: notIndexedSeed.size,
    notIndexedMatchedPagePaths: 0,
    notIndexedUnmatchedPagePaths: 0,
    notIndexedWithFaqs: 0,
    notIndexedWithoutFaqs: 0,
  };
  const faqCountBuckets: Record<string, number> = {};
  const examplesWithoutFaqs: Array<Record<string, unknown>> = [];
  const examplesWithFaqs: Array<Record<string, unknown>> = [];
  const matchedAcceptedPaths = new Set<string>();
  const matchedNotIndexedPaths = new Set<string>();

  let offset = 0;
  while (true) {
    const result: any = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
          fields: ['id', 'name', 'slug', 'cityName', 'stateAbbr', 'questionsAndAnswers', 'reviewsCount'],
        },
      },
    });
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;

    for (const buffet of buffets) {
      const citySlug = citySlugByNameState.get(`${buffet.cityName}|||${buffet.stateAbbr}`);
      const pagePath = citySlug && buffet.slug ? `/chinese-buffets/${citySlug}/${buffet.slug}` : null;
      const faqCount = parseFaqCount(buffet.questionsAndAnswers);
      const hasFaqs = faqCount > 0;
      const bucket = faqCount >= 10 ? '10+' : String(faqCount);

      totals.totalBuffets += 1;
      if (hasFaqs) totals.withFaqs += 1;
      else totals.withoutFaqs += 1;
      if (faqCount >= 5) totals.withAtLeast5Faqs += 1;
      faqCountBuckets[bucket] = (faqCountBuckets[bucket] || 0) + 1;

      if (pagePath && acceptedSummaryMap.has(pagePath)) {
        matchedAcceptedPaths.add(pagePath);
        if (hasFaqs) totals.acceptedSummaryWithFaqs += 1;
        else totals.acceptedSummaryWithoutFaqs += 1;
      }
      if (pagePath && notIndexedSeed.has(pagePath)) {
        matchedNotIndexedPaths.add(pagePath);
        if (hasFaqs) totals.notIndexedWithFaqs += 1;
        else totals.notIndexedWithoutFaqs += 1;
      }

      const example = {
        path: pagePath,
        name: buffet.name,
        city: buffet.cityName,
        state: buffet.stateAbbr,
        reviewsCount: buffet.reviewsCount || 0,
        faqCount,
      };
      if (hasFaqs && examplesWithFaqs.length < 10) examplesWithFaqs.push(example);
      if (!hasFaqs && examplesWithoutFaqs.length < 20) examplesWithoutFaqs.push(example);
    }

    console.log(`Scanned ${totals.totalBuffets} buffets`);
    if (buffets.length < batchSize) break;
    offset += batchSize;
  }

  totals.acceptedSummaryMatchedPagePaths = matchedAcceptedPaths.size;
  totals.acceptedSummaryUnmatchedPagePaths = acceptedSummaryMap.size - matchedAcceptedPaths.size;
  totals.notIndexedMatchedPagePaths = matchedNotIndexedPaths.size;
  totals.notIndexedUnmatchedPagePaths = notIndexedSeed.size - matchedNotIndexedPaths.size;

  const report = {
    generatedAt: new Date().toISOString(),
    totals,
    faqCountBuckets,
    examplesWithFaqs,
    examplesWithoutFaqs,
  };

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
