import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), 'chinese-buffets/.env') });
dotenv.config();

const MODEL = 'deepseek/deepseek-v4-flash';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OUT_DIR = path.resolve(process.cwd(), 'scripts/output/openrouter-faqs');
const OUTPUT_JSONL = path.join(OUT_DIR, 'faq-generation-results.jsonl');
const SUMMARY_JSON = path.join(OUT_DIR, 'faq-generation-summary.json');
const ACCEPTED_MAP = path.resolve(process.cwd(), 'lib/generated/llm-seo-summary-drafts.json');

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANT_APP_ADMIN_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!APP_ID || !ADMIN_TOKEN) {
  throw new Error('NEXT_PUBLIC_INSTANT_APP_ID and INSTANT_ADMIN_TOKEN are required');
}
if (!OPENROUTER_API_KEY) {
  throw new Error('OPENROUTER_API_KEY is required');
}

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: (schema as any).default || schema,
});

type SourcePayload = {
  id: string;
  path: string;
  name: string;
  city: string;
  state: string;
  address?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  hoursSummary?: string | null;
  hasWebsite: boolean;
  hasPhone: boolean;
  menuItems: string[];
  amenities: string[];
  reviewThemes: string[];
  llmSeoSummary?: string;
};

type FaqItem = {
  question: string;
  answer: string;
  sourceFieldsUsed?: string[];
};

function getArg(name: string, fallback: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

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

function titleCaseKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeHours(hoursRaw: unknown) {
  const hours = parseJson(hoursRaw, []);
  if (!Array.isArray(hours) || hours.length === 0) return null;
  if (hours.length >= 7) return 'Hours are listed for all 7 days.';
  return `Hours are listed for ${hours.length} days.`;
}

function summarizeServiceOptions(raw: unknown) {
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
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data)) {
        if (value === true || value === 'true') items.push(`${group}: ${titleCaseKey(key)}`);
        if (typeof value === 'string' && value.length < 60) items.push(`${group}: ${titleCaseKey(key)} ${value}`);
      }
    }
    if (items.length >= 10) break;
  }
  return Array.from(new Set(items)).slice(0, 10);
}

function summarizeMenu(menu: any) {
  if (!menu) return [];
  const unsafe = ['slot', 'gacor', 'casino', 'loading', 'cookie', 'javascript'];
  const isSafe = (value: unknown) => {
    const text = String(value || '').trim();
    const lower = text.toLowerCase();
    return text.length >= 2 && text.length <= 70 && /[a-z]/i.test(text) && !unsafe.some((term) => lower.includes(term));
  };
  const linkedItems = Array.isArray(menu.menuItems)
    ? menu.menuItems.map((item: any) => item.name).filter(isSafe).slice(0, 10)
    : [];
  if (linkedItems.length) return linkedItems;
  const parsedItems = parseJson(menu.items, []);
  if (Array.isArray(parsedItems)) {
    return parsedItems.map((item: any) => item.name || item).filter(isSafe).slice(0, 10);
  }
  return [];
}

function summarizeReviewThemes(buffet: any, reviews: any[]) {
  const negative = ['dirty', 'rude', 'worst', 'terrible', 'awful', 'gross', 'stale', 'complaint'];
  const safe = (value: string) => !negative.some((term) => value.toLowerCase().includes(term));
  const themes: string[] = [];
  const tags = parseJson(buffet.reviewsTags, []);
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      const label = typeof tag === 'string' ? tag : tag?.title;
      if (label && safe(label)) themes.push(String(label));
    }
  }
  for (const review of reviews || []) {
    const rating = review.stars ?? review.rating ?? 0;
    const text = String(review.textTranslated || review.text || '').replace(/\s+/g, ' ').trim();
    if (rating >= 4 && text.length >= 40 && safe(text)) themes.push(text.slice(0, 180));
    if (themes.length >= 5) break;
  }
  return Array.from(new Set(themes)).slice(0, 5);
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function repairJson(text: string) {
  let json = text.trim()
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');

  const completeItems = json.match(/\{[^{}]*"question"[^{}]*"answer"[^{}]*(?:"sourceFieldsUsed"[^{}]*)?\}/g);
  if (completeItems?.length) {
    return `{"items":[${completeItems.join(',')}]}`;
  }

  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  for (let index = 0; index < openBrackets - closeBrackets; index += 1) json += ']';
  for (let index = 0; index < openBraces - closeBraces; index += 1) json += '}';
  return json;
}

function parseModelJson(text: string) {
  const jsonText = extractJson(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    return JSON.parse(repairJson(jsonText));
  }
}

function pathFromBuffet(citySlug: string, slug: string) {
  return `/chinese-buffets/${citySlug}/${slug}`;
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
  return (result.menus || [])[0] || null;
}

function buildPrompt(source: SourcePayload) {
  return `Generate grounded FAQ items for a Chinese buffet restaurant page.

Use ONLY the source facts below. Do not invent prices, dishes, hours, amenities, awards, popularity, delivery, or buffet details. If a fact is missing, do not mention it.

Return strict JSON only:
{"items":[{"question":"string","answer":"string","sourceFieldsUsed":["field"]}]}

Requirements:
- Generate 4 to 6 FAQ items.
- Each answer must be 1 sentence, direct, factual, and no more than 35 words.
- Include location/address, rating/review count, contact/website/menu, hours, amenities/service options, menu items, or review themes only when present.
- Do not use markdown.
- Do not include citations.
- Do not say best, top, famous, authentic, popular, cheap, or family-friendly unless that exact idea appears in the source facts.

Source facts:
${JSON.stringify(source, null, 2)}`;
}

async function callOpenRouter(source: SourcePayload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://buffetlocator.com',
        'X-Title': 'Buffet Locator FAQ generation',
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 1100,
        messages: [
          {
            role: 'system',
            content: 'You generate factual FAQ JSON for local restaurant pages. Return valid JSON only.',
          },
          { role: 'user', content: buildPrompt(source) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`);
    }
    const data: any = await response.json();
    return {
      text: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || null,
    };
  } catch (error: any) {
    clearTimeout(timeout);
    throw error;
  }
}

function qaItems(rawItems: any[], source: SourcePayload) {
  const blocked = ['best', 'top', 'famous', 'authentic', 'popular', 'cheap', 'family-friendly'];
  const facts = JSON.stringify(source).toLowerCase();
  const issues: string[] = [];
  const items: FaqItem[] = [];

  if (!Array.isArray(rawItems)) return { items, issues: ['missing items array'] };
  if (rawItems.length < 3) issues.push('fewer than 3 items');

  for (const raw of rawItems.slice(0, 8)) {
    const question = String(raw?.question || '').replace(/\s+/g, ' ').trim();
    const answer = String(raw?.answer || '').replace(/\s+/g, ' ').trim();
    if (question.length < 10 || answer.length < 20) continue;
    if (answer.split(/\s+/).length > 45) continue;
    const lower = `${question} ${answer}`.toLowerCase();
    if (blocked.some((term) => lower.includes(term) && !facts.includes(term))) continue;
    items.push({
      question,
      answer,
      sourceFieldsUsed: Array.isArray(raw?.sourceFieldsUsed) ? raw.sourceFieldsUsed.map(String).slice(0, 6) : [],
    });
  }

  const unique = Array.from(new Map(items.map((item) => [item.question.toLowerCase(), item])).values()).slice(0, 6);
  if (unique.length < 3) issues.push(`only ${unique.length} valid items`);
  return { items: unique, issues };
}

async function findTargets(limit: number) {
  const accepted = JSON.parse(fs.readFileSync(ACCEPTED_MAP, 'utf8'));
  const acceptedPaths = new Set(Object.keys(accepted));
  const cityResult: any = await db.query({ cities: { $: { fields: ['city', 'stateAbbr', 'slug'] } } });
  const citySlugByNameState = new Map<string, string>();
  for (const city of cityResult.cities || []) {
    citySlugByNameState.set(`${city.city}|||${city.stateAbbr}`, city.slug);
  }

  const targets: any[] = [];
  let offset = 0;
  const batchSize = 500;
  while (true) {
    const result: any = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
          fields: [
            'id', 'name', 'slug', 'cityName', 'stateAbbr', 'state', 'address', 'rating',
            'reviewsCount', 'hours', 'website', 'phone', 'placeId', 'serviceOptions',
            'reviewsTags', 'questionsAndAnswers',
          ],
        },
      },
    });
    const buffets = result.buffets || [];
    if (!buffets.length) break;
    for (const buffet of buffets) {
      const citySlug = citySlugByNameState.get(`${buffet.cityName}|||${buffet.stateAbbr}`);
      if (!citySlug || !buffet.slug) continue;
      const pagePath = pathFromBuffet(citySlug, buffet.slug);
      if (!acceptedPaths.has(pagePath) || hasFaqs(buffet.questionsAndAnswers)) continue;
      targets.push({ ...buffet, pagePath, llmSeoSummary: accepted[pagePath]?.summary });
      if (limit && targets.length >= limit) return targets;
    }
    if (buffets.length < batchSize) break;
    offset += batchSize;
  }
  return targets;
}

async function enrichSource(buffet: any): Promise<SourcePayload> {
  const detail: any = await db.query({
    buffets: {
      $: { where: { id: buffet.id } },
      structuredData: {},
    },
  });
  const hydrated = { ...buffet, ...(detail.buffets?.[0] || {}) };
  const reviews = await queryReviews(buffet.id);
  const menu = await queryMenu(hydrated.placeId);
  return {
    id: buffet.id,
    path: buffet.pagePath,
    name: hydrated.name,
    city: hydrated.cityName,
    state: hydrated.stateAbbr || hydrated.state,
    address: hydrated.address || null,
    rating: hydrated.rating ?? null,
    reviewsCount: hydrated.reviewsCount ?? null,
    hoursSummary: summarizeHours(hydrated.hours),
    hasWebsite: Boolean(hydrated.website),
    hasPhone: Boolean(hydrated.phone),
    menuItems: summarizeMenu(menu),
    amenities: [
      ...summarizeServiceOptions(hydrated.serviceOptions),
      ...summarizeStructuredData(hydrated.structuredData || []),
    ].slice(0, 12),
    reviewThemes: summarizeReviewThemes(hydrated, reviews),
    llmSeoSummary: buffet.llmSeoSummary,
  };
}

async function main() {
  const limit = Number(getArg('--limit', '0'));
  const write = hasFlag('--write');
  const resume = hasFlag('--resume');
  const retryErrors = hasFlag('--retry-errors');
  const concurrency = Number(getArg('--concurrency', '2'));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const existing = resume && fs.existsSync(OUTPUT_JSONL)
    ? fs.readFileSync(OUTPUT_JSONL, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const completedIds = new Set(existing
    .filter((row: any) => !retryErrors || row.status === 'accepted')
    .map((row: any) => row.source?.id)
    .filter(Boolean));
  if (!resume && fs.existsSync(OUTPUT_JSONL)) fs.unlinkSync(OUTPUT_JSONL);

  const targets = await findTargets(limit);
  const pending = targets.filter((target) => !completedIds.has(target.id));
  console.log(`Targets: ${targets.length}; pending: ${pending.length}; write=${write}; model=${MODEL}`);

  const rows = [...existing];
  let accepted = rows.filter((row: any) => row.status === 'accepted').length;
  let rejected = rows.filter((row: any) => row.status !== 'accepted').length;
  let promptTokens = rows.reduce((sum: number, row: any) => sum + (row.usage?.prompt_tokens || 0), 0);
  let completionTokens = rows.reduce((sum: number, row: any) => sum + (row.usage?.completion_tokens || 0), 0);

  async function processTarget(target: any) {
    const source = await enrichSource(target);
    try {
      const { text, usage } = await callOpenRouter(source);
      const parsed = parseModelJson(text);
      const { items, issues } = qaItems(parsed.items, source);
      const status = issues.length ? 'rejected' : 'accepted';
      const record = { status, issues, source, items, usage, model: MODEL, generatedAt: new Date().toISOString() };
      if (status === 'accepted' && write) {
        await db.transact([db.tx.buffets[source.id].update({ questionsAndAnswers: JSON.stringify({ items, model: MODEL, generatedAt: record.generatedAt }) })]);
      }
      fs.appendFileSync(OUTPUT_JSONL, JSON.stringify(record) + '\n');
      rows.push(record);
      if (status === 'accepted') accepted += 1;
      else rejected += 1;
      promptTokens += usage?.prompt_tokens || 0;
      completionTokens += usage?.completion_tokens || 0;
      console.log(`${status.toUpperCase()} ${source.path} (${items.length} FAQs)`);
    } catch (error: any) {
      const record = { status: 'error', issues: [String(error?.message || error)], source, items: [], model: MODEL, generatedAt: new Date().toISOString() };
      fs.appendFileSync(OUTPUT_JSONL, JSON.stringify(record) + '\n');
      rows.push(record);
      rejected += 1;
      console.log(`ERROR ${source.path}: ${record.issues[0].slice(0, 180)}`);
    }
  }

  for (let index = 0; index < pending.length; index += concurrency) {
    await Promise.all(pending.slice(index, index + concurrency).map(processTarget));
    console.log(`Progress: ${Math.min(index + concurrency, pending.length)}/${pending.length} pending processed; accepted=${accepted}; rejected=${rejected}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    write,
    targets: targets.length,
    totalRows: rows.length,
    accepted,
    rejected,
    promptTokens,
    completionTokens,
    estimatedCostUsd: Number(((promptTokens * 0.09 / 1_000_000) + (completionTokens * 0.18 / 1_000_000)).toFixed(6)),
    files: { jsonl: OUTPUT_JSONL, summary: SUMMARY_JSON },
  };
  fs.writeFileSync(SUMMARY_JSON, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
