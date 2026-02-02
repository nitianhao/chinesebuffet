import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { z } from 'zod';
import { getRateLimitManager } from './lib/rateLimitManager';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const PROGRESS_LOG = path.join(OUTPUT_DIR, 'seo-gen-progress.jsonl');
const SENTENCES_FILE = path.join(OUTPUT_DIR, 'seo-sentences.json');

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '25000', 10);

const WORD_MIN = 120;
const WORD_MAX = 250;

const LENGTH_TOKEN_LIMITS = [600, 750, 900];
const MAX_LENGTH_FIX_ATTEMPTS = 4;
const MAX_VALIDATION_RETRIES = 4;
const MAX_RETRIES = 3; // Max retries for Groq

const NEGATIVE_TERMS = [
  'rude', 'dirty', 'cold', 'slow', 'overpriced', 'bad', 'awful', 'worst',
  'never', 'disappointed', 'disappointing', 'mediocre', 'bland', 'greasy',
  'stale', 'not good', 'terrible', 'gross', 'unfriendly', 'inattentive',
  'noisy', 'waited', 'wait time', 'overcooked', 'undercooked'
];

const INITIAL_BANNED_OPENINGS = [
  'look no further', 'hidden gem', "if you're looking for",
  'if you are looking for', 'your search ends here', 'a must-try', 'a must try'
];

const JsonResponseSchema = z.object({
  description_md: z.string(),
  word_count: z.number().int(),
  bold_phrases: z.array(z.string())
});

type BuffetRecord = {
  id: string;
  name?: string;
  cityName?: string;
  state?: string;
  neighborhood?: string | null;
  categoryName?: string | null;
  primaryType?: string | null;
  price?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  description?: string | null;
  description2?: string | null;
  structuredData?: any;
  reviewRecords?: any[];
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type GeneratedResult = {
  descriptionMd: string;
  wordCount: number;
  boldPhrases: string[];
  provider: 'groq';
  model: string;
  latencyMs: number;
  tokens?: TokenUsage;
};

class GenerationError extends Error {
  provider?: string;
  model?: string;
  latencyMs?: number;
  responseSnippet?: string;
  constructor(message: string, details?: Partial<GenerationError>) {
    super(message);
    Object.assign(this, details);
  }
}

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toWordCount(text: string): number {
  const matches = text.trim().match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g);
  return matches ? matches.length : 0;
}

function normalizeSentence(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractBoldPhrases(text: string): string[] {
  const phrases: string[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    phrases.push(match[1].trim());
  }
  return phrases;
}

function containsNegativeTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return NEGATIVE_TERMS.some((term) => lower.includes(term));
}

function getSeed(buffetId: string): number {
  const hash = crypto.createHash('md5').update(buffetId).digest('hex');
  return parseInt(hash.slice(0, 8), 16) % 10000;
}

function parseJsonMaybe(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function extractJsonFromText(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return { jsonText: trimmed, extracted: false };
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    return { jsonText: match[0], extracted: true };
  }
  return { jsonText: trimmed, extracted: false };
}

function extractFacts(buffet: BuffetRecord) {
  const structuredDataList = buffet.structuredData
    ? Array.isArray(buffet.structuredData)
      ? buffet.structuredData
      : [buffet.structuredData]
    : [];

  const notableAttributes = new Set<string>();

  structuredDataList.forEach((item) => {
    if (!item) return;
    const raw = parseJsonMaybe(item.data);
    if (raw && typeof raw === 'object') {
      Object.entries(raw).forEach(([key, value]) => {
        if (value === true) {
          notableAttributes.add(key);
        } else if (typeof value === 'string' && value.length < 40) {
          notableAttributes.add(`${key}: ${value}`);
        }
      });
    }
    if (item.type) {
      notableAttributes.add(String(item.type));
    }
  });

  return {
    name: buffet.name || 'This buffet',
    city: buffet.cityName || '',
    state: buffet.state || '',
    neighborhood: buffet.neighborhood || '',
    category: buffet.categoryName || buffet.primaryType || '',
    price: buffet.price || '',
    rating: buffet.rating || null,
    reviewsCount: buffet.reviewsCount || null,
    website: buffet.website || '',
    notableAttributes: Array.from(notableAttributes).slice(0, 12)
  };
}

function extractHighlights(reviews: any[]): string[] {
  if (!Array.isArray(reviews)) return [];
  const highlights: string[] = [];

  const sorted = reviews
    .filter((review) => {
      const rating = review?.rating ?? review?.stars;
      if (rating == null) return true;
      return rating >= 4;
    })
    .slice(0, 50);

  for (const review of sorted) {
    const text = review?.textTranslated || review?.text || '';
    if (!text) continue;
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const normalized = normalizeSentence(sentence);
      if (!normalized) continue;
      if (containsNegativeTerm(normalized)) continue;
      if (sentence.length > 180) continue;
      const trimmed = sentence.replace(/\s+/g, ' ').trim();
      if (trimmed.length < 20) continue;
      if (!highlights.includes(trimmed)) {
        highlights.push(trimmed);
      }
      if (highlights.length >= 7) return highlights;
    }
  }
  return highlights;
}

function toGeoPhrase(facts: ReturnType<typeof extractFacts>) {
  if (facts.city && facts.state) return `${facts.city}, ${facts.state}`;
  if (facts.city) return facts.city;
  if (facts.state) return facts.state;
  return 'the area';
}

function buildPrompt(options: {
  facts: ReturnType<typeof extractFacts>;
  highlights: string[];
  bannedPhrases: string[];
  doNotUseSentences: string[];
  seed: number;
  lengthDirective?: string;
  uniquenessDirective?: string;
}) {
  const { facts, highlights, bannedPhrases, doNotUseSentences, seed, lengthDirective, uniquenessDirective } = options;
  const geo = toGeoPhrase(facts);

  return [
    `System intent: You are an SEO copywriter for local restaurant pages. Use ONLY the provided facts and positive review highlights. Do not invent features. Do not mention negatives. Write naturally but keyword-rich. Keep it readable.`,
    `Write 1-2 short paragraphs (no bullets, no headings). Bold only key phrases.`,
    `Include core keywords naturally: "Chinese buffet", "buffet", "all-you-can-eat", and location-based phrases.`,
    `Use this seed to vary sentence structure and ordering; avoid stock phrases; do not reuse banned phrases. Seed: ${seed}.`,
    `BANNED PHRASES (do not use or paraphrase): ${bannedPhrases.join(' | ')}`,
    doNotUseSentences.length > 0
      ? `Do NOT reuse these sentences or close variants: ${doNotUseSentences.join(' | ')}`
      : `Do NOT reuse any sentences from prior descriptions.`,
    lengthDirective || `Length must be ${WORD_MIN}-${WORD_MAX} words.`,
    uniquenessDirective || '',
    `REQUIRED OUTPUT: Return STRICT JSON ONLY with keys {"description_md","word_count","bold_phrases"} and no extra text.`,
    `description_md should include several bold phrases using **...** (aim for 3-10).`,
    `Try to include "Chinese buffet" or "${geo}" in at least one bold phrase.`,
    `Facts (use only these):`,
    JSON.stringify(
      {
        name: facts.name,
        city: facts.city,
        state: facts.state,
        neighborhood: facts.neighborhood || undefined,
        category: facts.category || undefined,
        price: facts.price || undefined,
        rating: facts.rating || undefined,
        reviewsCount: facts.reviewsCount || undefined,
        website: facts.website || undefined,
        notableAttributes: facts.notableAttributes.length ? facts.notableAttributes : undefined
      },
      null,
      2
    ),
    `Positive review highlights (short bullets; weave in naturally):`,
    JSON.stringify(highlights.slice(0, 7), null, 2)
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fn(controller.signal);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

function classifyError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  const status = error?.status || error?.response?.status;
  const isRateLimit = status === 429 || message.includes('429') || message.includes('rate limit');
  const isServerError = status && status >= 500;
  const isTimeout = message.includes('abort') || message.includes('timeout');
  return { isRateLimit, isServerError, isTimeout, status, message };
}

async function generateWithGroq(
  prompt: string,
  maxOutputTokens: number,
  temperature: number
): Promise<{ text: string; model: string; latencyMs: number; tokens?: TokenUsage }> {
  const rateLimitManager = getRateLimitManager();
  
  // Check if Groq is in cooldown - if so, wait for it
  if (!rateLimitManager.isHealthy('groq')) {
    const health = rateLimitManager.getHealthStatus();
    const waitMs = health.groq.unhealthyUntil - Date.now();
    if (waitMs > 0) {
      console.log(`[groq] Waiting ${Math.ceil(waitMs/1000)}s for cooldown to end...`);
      await rateLimitManager.globalSleep(waitMs + 100, 'Groq cooldown');
    }
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    rateLimitManager.markUnhealthy('groq', 'GROQ_API_KEY not set');
    throw new Error('GROQ_API_KEY is not set');
  }

  // Proactive throttling: check if we should wait
  const estimatedTokens = rateLimitManager.estimateTokens(prompt, maxOutputTokens);
  const proactiveWaitMs = rateLimitManager.shouldWaitForGroq(estimatedTokens);
  if (proactiveWaitMs > 0) {
    await rateLimitManager.globalSleep(proactiveWaitMs, `Groq proactive throttle (need ~${estimatedTokens} tokens)`);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const start = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature,
          max_tokens: maxOutputTokens,
          messages: [
            {
              role: 'system',
              content: 'You are an SEO copywriter for local restaurant pages. Use ONLY provided facts and highlights. Do not invent features or mention negatives.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      const latencyMs = Date.now() - start;
      clearTimeout(timeoutId);

      // Parse rate limit headers
      const headers = rateLimitManager.parseGroqHeaders(response.headers);
      rateLimitManager.updateGroqState(headers);

      if (response.status === 429) {
        // Brief sleep based on headers, upgraded account should rarely hit this
        const sleepMs = Math.min(rateLimitManager.calculateSleepMs(headers, 0), 3000);
        rateLimitManager.record429('groq', headers, sleepMs);
        
        if (attempt < MAX_RETRIES - 1) {
          await rateLimitManager.globalSleep(sleepMs, `Groq 429 (retry ${attempt + 1}/${MAX_RETRIES})`);
          continue;
        }
        
        const error: any = new Error('Groq rate limited');
        error.isRateLimit = true;
        error.headers = headers;
        throw error;
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          const sleepMs = Math.min(500 * (attempt + 1), 2000);
          await sleep(sleepMs);
          continue;
        }
        throw new Error(`Groq error: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      
      // Extract token usage from Groq response
      let tokens: TokenUsage | undefined;
      if (data?.usage) {
        tokens = {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        };
      }
      
      rateLimitManager.recordSuccess('groq');
      return { text, model: GROQ_MODEL, latencyMs, tokens };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error?.isRateLimit) {
        throw error;
      }
      
      const info = classifyError(error);
      if ((info.isServerError || info.isTimeout) && attempt < MAX_RETRIES - 1) {
        const sleepMs = Math.min(500 * (attempt + 1), 2000);
        await sleep(sleepMs);
        continue;
      }
      
      throw error;
    }
  }

  throw new Error('Groq unavailable');
}

// Simple wrapper - only using Groq now (upgraded account)
async function generate(
  prompt: string,
  maxOutputTokens: number,
  temperature: number
): Promise<{ text: string; provider: 'groq'; model: string; latencyMs: number; tokens?: TokenUsage }> {
  const result = await generateWithGroq(prompt, maxOutputTokens, temperature);
  return { text: result.text, provider: 'groq', model: result.model, latencyMs: result.latencyMs, tokens: result.tokens };
}

function validateJsonOutput(
  parsed: z.infer<typeof JsonResponseSchema>,
  facts: ReturnType<typeof extractFacts>,
  descriptionText: string
) {
  const wordCount = toWordCount(descriptionText);
  
  if (parsed.word_count !== wordCount) {
    console.warn(`[warn] word_count mismatch: model=${parsed.word_count} computed=${wordCount}`);
  }

  const boldPhrases = extractBoldPhrases(descriptionText);
  
  if (boldPhrases.length < 2) {
    console.warn(`[warn] only ${boldPhrases.length} bold phrases found`);
  }

  const geo = toGeoPhrase(facts).toLowerCase();
  const hasGeoPhrase = boldPhrases.some((phrase) => {
    const lower = phrase.toLowerCase();
    return lower.includes('chinese buffet') || lower.includes('buffet') || lower.includes(geo);
  });
  if (!hasGeoPhrase) {
    console.warn(`[warn] missing geo/buffet phrase in bold`);
  }

  if (containsNegativeTerm(descriptionText)) {
    console.warn(`[warn] description may contain negative term`);
  }

  return { ok: true, wordCount, boldPhrases };
}

function buildTrigrams(text: string): Set<string> {
  const words = normalizeSentence(text).split(' ').filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i < words.length - 2; i++) {
    grams.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return grams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function ensureSentenceStore(): Set<string> {
  if (!fs.existsSync(SENTENCES_FILE)) return new Set<string>();
  try {
    const raw = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf8'));
    if (Array.isArray(raw)) {
      return new Set(raw.map((s) => String(s)));
    }
  } catch {
    return new Set<string>();
  }
  return new Set<string>();
}

function persistSentenceStore(sentences: Set<string>) {
  fs.writeFileSync(SENTENCES_FILE, JSON.stringify(Array.from(sentences), null, 2));
}

function appendProgress(entry: Record<string, any>) {
  fs.appendFileSync(PROGRESS_LOG, `${JSON.stringify(entry)}\n`);
}

function loadProgressSuccesses(): Set<string> {
  if (!fs.existsSync(PROGRESS_LOG)) return new Set<string>();
  const lines = fs.readFileSync(PROGRESS_LOG, 'utf8').split('\n');
  const successIds = new Set<string>();
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed.status === 'success' && parsed.buffetId) {
        successIds.add(parsed.buffetId);
      }
    } catch {
      continue;
    }
  }
  return successIds;
}

function loadRecentDescriptions(limit: number): string[] {
  if (!fs.existsSync(PROGRESS_LOG)) return [];
  const lines = fs.readFileSync(PROGRESS_LOG, 'utf8').split('\n').filter(Boolean);
  const recent: string[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(lines[i]);
      if (parsed.status === 'success' && parsed.description_md) {
        recent.push(parsed.description_md);
      }
    } catch {
      continue;
    }
    if (recent.length >= limit) break;
  }
  return recent.reverse();
}

async function runPreflight(db: ReturnType<typeof init>) {
  let offset = 0;
  const scanLimit = 200;
  let buffets: any[] = [];

  while (buffets.length < scanLimit) {
    const result = await db.query({
      buffets: {
        $: { limit: 50, offset }
      }
    });
    const batch = result.buffets || [];
    if (batch.length === 0) break;
    buffets = buffets.concat(batch);
    offset += batch.length;
    if (batch.length < 50) break;
  }

  if (buffets.length === 0) {
    console.log('No buffets found to preflight.');
    return true;
  }

  const buffetWithDescription2 = buffets.find((b: any) => typeof b.description2 === 'string');
  const sample = buffetWithDescription2 || buffets[0];
  const originalDescription2 = sample.description2;

  try {
    if (typeof originalDescription2 === 'string') {
      await db.transact([db.tx.buffets[sample.id].update({ description2: originalDescription2 })]);
      return true;
    }

    try {
      await db.transact([db.tx.buffets[sample.id].update({ description2: null })]);
    } catch (error: any) {
      console.error('Schema not ready. Please sync schema (description2 field), then re-run.');
      return false;
    }

    await db.transact([db.tx.buffets[sample.id].update({ description2: '' })]);
    await db.transact([db.tx.buffets[sample.id].update({ description2: null })]);
    return true;
  } catch (error: any) {
    console.error('Schema not ready. Please sync schema (description2 field), then re-run.');
    return false;
  }
}

async function generateDescription(
  buffet: BuffetRecord,
  facts: ReturnType<typeof extractFacts>,
  highlights: string[],
  sentencesStore: Set<string>,
  recentDescriptions: string[],
  bannedOpenings: Set<string>
): Promise<GeneratedResult> {
  let lengthAttempts = 0;
  let validationRetries = 0;
  let uniquenessRetryUsed = false;
  let transientRetries = 0;

  let lengthDirective = `Length must be ${WORD_MIN}-${WORD_MAX} words.`;
  const sentencesDoNotUse: string[] = [];

  while (lengthAttempts < MAX_LENGTH_FIX_ATTEMPTS) {
    const prompt = buildPrompt({
      facts,
      highlights,
      bannedPhrases: Array.from(bannedOpenings),
      doNotUseSentences: sentencesDoNotUse,
      seed: getSeed(buffet.id),
      lengthDirective,
      uniquenessDirective: uniquenessRetryUsed
        ? 'Rewrite to change sentence structure and avoid duplicated sentences while staying factual.'
        : undefined
    });

    const temperature = 0.7;
    const maxOutputTokens = LENGTH_TOKEN_LIMITS[Math.min(lengthAttempts, LENGTH_TOKEN_LIMITS.length - 1)];

    let responseText = '';
    let provider: 'groq' = 'groq';
    let model = '';
    let latencyMs = 0;
    let tokens: TokenUsage | undefined;

    try {
      const result = await generate(prompt, maxOutputTokens, temperature);
      responseText = result.text;
      provider = result.provider;
      model = result.model;
      latencyMs = result.latencyMs;
      tokens = result.tokens;
      transientRetries = 0;
    } catch (error: any) {
      transientRetries += 1;
      if (transientRetries >= MAX_RETRIES) {
        throw error;
      }
      // Brief sleep before retry
      await sleep(300);
      continue;
    }

    let parsedJson: z.infer<typeof JsonResponseSchema> | null = null;
    try {
      const extracted = extractJsonFromText(responseText);
      parsedJson = JsonResponseSchema.parse(JSON.parse(extracted.jsonText));
      if (extracted.extracted) {
        console.warn(`[warn] extracted JSON for buffet ${buffet.id}`);
      }
    } catch (error) {
      validationRetries += 1;
      if (validationRetries > MAX_VALIDATION_RETRIES) {
        throw new GenerationError('Invalid JSON response', {
          provider,
          model,
          latencyMs,
          responseSnippet: responseText.slice(0, 500)
        });
      }
      continue;
    }

    const description = parsedJson.description_md.trim();
    const wordCount = toWordCount(description);

    if (wordCount < 80) {
      lengthDirective = `Expand to ${WORD_MIN}-${WORD_MAX} words by adding concrete details from facts/highlights; do not add new claims.`;
      lengthAttempts += 1;
      console.warn(`[warn] word count ${wordCount} too short, retrying (attempt ${lengthAttempts})`);
      continue;
    }

    if (wordCount > 350) {
      lengthDirective = `Tighten to ${WORD_MIN}-${WORD_MAX} words; keep all key info; remove filler.`;
      lengthAttempts += 1;
      console.warn(`[warn] word count ${wordCount} too long, retrying (attempt ${lengthAttempts})`);
      continue;
    }

    const validation = validateJsonOutput(parsedJson, facts, description);
    if (!validation.ok) {
      validationRetries += 1;
      if (validationRetries > MAX_VALIDATION_RETRIES) {
        throw new GenerationError(`Validation failed: ${(validation as any).reason}`, {
          provider,
          model,
          latencyMs,
          responseSnippet: responseText.slice(0, 500)
        });
      }
      continue;
    }

    const sentences = splitSentences(description);
    const normalizedSentences = sentences.map(normalizeSentence).filter(Boolean);
    const duplicated = normalizedSentences.filter((s) => sentencesStore.has(s));
    const descriptionGrams = buildTrigrams(description);
    const similarityScore = recentDescriptions.reduce((maxScore, text) => {
      const score = jaccardSimilarity(descriptionGrams, buildTrigrams(text));
      return Math.max(maxScore, score);
    }, 0);

    if ((duplicated.length > 0 || similarityScore > 0.35) && !uniquenessRetryUsed) {
      sentencesDoNotUse.push(...duplicated.slice(0, 3));
      uniquenessRetryUsed = true;
      continue;
    }

    const opening = sentences[0]?.toLowerCase() || '';
    for (const phrase of INITIAL_BANNED_OPENINGS) {
      if (opening.startsWith(phrase)) {
        bannedOpenings.add(phrase);
      }
    }

    return {
      descriptionMd: description,
      wordCount,
      boldPhrases: validation.boldPhrases || parsedJson.bold_phrases,
      provider,
      model,
      latencyMs,
      tokens
    };
  }

  throw new GenerationError('Failed to generate description', {
    responseSnippet: ''
  });
}

async function main() {
  ensureOutputDir();

  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getFlagValue = (flag: string, defaultValue: number) => {
    const index = argv.indexOf(flag);
    if (index >= 0 && argv[index + 1]) {
      const value = Number(argv[index + 1]);
      if (!Number.isNaN(value)) return value;
    }
    return defaultValue;
  };

  const limit = getFlagValue('--limit', Number.POSITIVE_INFINITY);
  const maxConcurrency = getFlagValue('--concurrency', 3);
  const force = hasFlag('--force');
  const dryRun = hasFlag('--dry-run');
  const preflightOnly = hasFlag('--preflight');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN.');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema
  });

  const preflightOk = await runPreflight(db);
  if (!preflightOk) {
    process.exit(1);
  }

  if (preflightOnly) {
    console.log('Preflight OK.');
    process.exit(0);
  }

  // Initialize rate limit manager with max concurrency
  const rateLimitManager = getRateLimitManager(maxConcurrency);

  const sentencesStore = ensureSentenceStore();
  const bannedOpenings = new Set<string>(INITIAL_BANNED_OPENINGS);
  const recentDescriptions = loadRecentDescriptions(40);
  const processedIds = force ? new Set<string>() : loadProgressSuccesses();

  const batchSize = 200;
  const targetTotal = Number.isFinite(limit) ? limit : null;
  let offset = 0;
  let totalProcessed = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let totalLatency = 0;
  const startTime = Date.now();

  // Track active tasks for adaptive concurrency
  const activeTasks: Promise<void>[] = [];

  async function processBuffet(buffet: BuffetRecord) {
    if (!buffet?.id) return;
    
    // Skip if already in progress log as successful
    if (processedIds.has(buffet.id)) {
      skippedCount += 1;
      appendProgress({
        timestamp: new Date().toISOString(),
        buffetId: buffet.id,
        name: buffet.name,
        status: 'skipped',
        reason: 'already_successful_in_log'
      });
      return;
    }

    // Skip if description2 is already populated in DB
    if (buffet.description2 && buffet.description2.trim().length > 0) {
      skippedCount += 1;
      console.log(`[skipped] ${buffet.name} - description2 already populated (${buffet.description2.length} chars)`);
      appendProgress({
        timestamp: new Date().toISOString(),
        buffetId: buffet.id,
        name: buffet.name,
        status: 'skipped',
        reason: 'description2_already_populated'
      });
      return;
    }

    const facts = extractFacts(buffet);
    const highlights = extractHighlights(buffet.reviewRecords || []);
    let lastProvider: string = 'n/a';
    let lastModel: string = 'n/a';
    let lastLatency: number = 0;

    try {
      const result = await generateDescription(
        buffet,
        facts,
        highlights,
        sentencesStore,
        recentDescriptions,
        bannedOpenings
      );

      const sentences = splitSentences(result.descriptionMd).map(normalizeSentence).filter(Boolean);
      sentences.forEach((s) => sentencesStore.add(s));
      recentDescriptions.push(result.descriptionMd);
      if (recentDescriptions.length > 60) recentDescriptions.shift();
      persistSentenceStore(sentencesStore);

      if (!dryRun) {
        await db.transact([db.tx.buffets[buffet.id].update({ description2: result.descriptionMd })]);
      }

      successCount += 1;
      totalLatency += result.latencyMs;
      lastProvider = result.provider;
      lastModel = result.model;
      lastLatency = result.latencyMs;

      // Print full generated text to terminal
      const tokenInfo = result.tokens 
        ? `Tokens: ${result.tokens.promptTokens} in / ${result.tokens.completionTokens} out / ${result.tokens.totalTokens} total`
        : 'Tokens: N/A';
      
      console.log(`\n${'='.repeat(80)}`);
      console.log(`[SUCCESS] ${buffet.name} (${buffet.cityName}, ${buffet.state})`);
      console.log(`Provider: ${result.provider} | Model: ${result.model} | Words: ${result.wordCount} | Latency: ${result.latencyMs}ms`);
      console.log(tokenInfo);
      console.log(`${'─'.repeat(80)}`);
      console.log(result.descriptionMd);
      console.log(`${'='.repeat(80)}\n`);

      appendProgress({
        timestamp: new Date().toISOString(),
        buffetId: buffet.id,
        name: buffet.name,
        status: 'success',
        wordCount: result.wordCount,
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        tokens: result.tokens,
        description_md: result.descriptionMd
      });
    } catch (error: any) {
      failedCount += 1;
      lastProvider = error?.provider || lastProvider;
      lastModel = error?.model || lastModel;
      lastLatency = error?.latencyMs || lastLatency;
      const responseSnippet = error?.responseSnippet ? String(error.responseSnippet) : undefined;
      console.error(
        `[failed] ${buffet.name || buffet.id} reason=${String(error?.message || error)} provider=${lastProvider} model=${lastModel}`
      );
      appendProgress({
        timestamp: new Date().toISOString(),
        buffetId: buffet.id,
        name: buffet.name,
        status: 'failed',
        reason: String(error?.message || error),
        provider: lastProvider,
        model: lastModel,
        latencyMs: lastLatency,
        response_snippet: responseSnippet
      });
    }

    totalProcessed += 1;

    const elapsedMin = (Date.now() - startTime) / 1000 / 60;
    const avgLatency = successCount ? totalLatency / successCount : 0;
    const rate = totalProcessed ? totalProcessed / elapsedMin : 0;
    const remaining = targetTotal !== null ? Math.max(targetTotal - totalProcessed, 0) : null;
    const etaMin = rate > 0 && remaining !== null ? remaining / rate : 0;
    const currentConcurrency = rateLimitManager.getConcurrency();

    console.log(
      `[progress] processed=${totalProcessed} success=${successCount} failed=${failedCount} skipped=${skippedCount} concurrency=${currentConcurrency} provider=${lastProvider} model=${lastModel} lastLatencyMs=${lastLatency.toFixed(0)} avgLatencyMs=${avgLatency.toFixed(0)} etaMin=${remaining !== null ? etaMin.toFixed(1) : 'unknown'}`
    );

    // Print stats periodically
    rateLimitManager.maybePrintStats();
  }

  while (totalProcessed < limit) {
    const query = await db.query({
      buffets: {
        $: { limit: batchSize, offset },
        structuredData: { $: { limit: 50 } },
        reviewRecords: { $: { limit: 50 } }
      }
    });

    const buffets = (query.buffets || []) as BuffetRecord[];
    if (buffets.length === 0) break;

    // Process buffets with adaptive concurrency
    for (const buffet of buffets) {
      if (totalProcessed >= limit) break;

      // Get current concurrency limit
      const currentConcurrency = rateLimitManager.getConcurrency();

      // Wait if we're at capacity
      while (activeTasks.length >= currentConcurrency) {
        await Promise.race(activeTasks);
        // Remove completed tasks
        for (let i = activeTasks.length - 1; i >= 0; i--) {
          const task = activeTasks[i];
          const status = await Promise.race([task.then(() => 'done'), Promise.resolve('pending')]);
          if (status === 'done') {
            activeTasks.splice(i, 1);
          }
        }
      }

      // Start new task
      const task = processBuffet(buffet).finally(() => {
        const index = activeTasks.indexOf(task);
        if (index > -1) activeTasks.splice(index, 1);
      });
      activeTasks.push(task);
    }

    // Wait for remaining tasks in this batch
    await Promise.all(activeTasks);
    activeTasks.length = 0;

    offset += batchSize;
    if (buffets.length < batchSize) break;
  }

  // Wait for any remaining tasks
  await Promise.all(activeTasks);

  const durationMin = (Date.now() - startTime) / 1000 / 60;
  console.log(
    `Done. processed=${totalProcessed} success=${successCount} failed=${failedCount} skipped=${skippedCount} durationMin=${durationMin.toFixed(1)}`
  );

  // Print final stats
  rateLimitManager.maybePrintStats();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
