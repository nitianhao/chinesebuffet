import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

type PoiRecord = {
  id: string;
  name?: string | null;
  distance?: number | null;
  lat?: number | null;
  lon?: number | null;
  tags?: string | null;
  group?: string | null;
  buffet?: {
    id: string;
    name?: string | null;
    accommodationLodging?: string | null;
  } | null;
};

type LodgingEntry = {
  poiId: string;
  name?: string | null;
  distance?: number | null;
  text: string;
  updatedAt: string;
};

type Checkpoint = {
  processedIds: string[];
  successCount: number;
  errorCount: number;
  startedAt: number;
  lastSavedAt: number;
};

type RunOptions = {
  dryRun: boolean;
  limit: number;
};

const TARGET_GROUP = 'Accommodation & Lodging';
const QUERY_LIMIT = 200;
const BATCH_SIZE = 5;
const CONCURRENCY = 2;
const BATCH_DELAY_MS = 1500;
const CHECKPOINT_FILE = path.join(__dirname, 'generate-poi-accommodation-seo.checkpoint.json');

const geminiModels = ['gemini-2.5-flash', 'gemini-flash-latest'];
let geminiModelIndex = 0;

function parseArgs(): RunOptions {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limitValue = limitArg ? Number(limitArg.split('=')[1]) : NaN;
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : dryRun ? 10 : 0;
  return { dryRun, limit };
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  let loadedCount = 0;
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
    if (!match) return;
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && value && !process.env[key]) {
      process.env[key] = value;
      loadedCount++;
    }
  });
  if (loadedCount > 0) {
    console.log(`Loaded ${loadedCount} environment variables from .env.local`);
  }
}

const envPaths = [
  path.join(__dirname, '../.env.local'),
  path.join(process.cwd(), '.env.local'),
  '.env.local',
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    loadEnvFile(envPath);
    break;
  }
}

const geminiApiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const groqApiKey = process.env.GROQ_API_KEY;

const geminiClient = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;
const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

if (!geminiClient && !groqClient) {
  console.error('ERROR: No LLM provider configured.');
  console.error('Set GOOGLE_API_KEY or GEMINI_API_KEY (primary), or GROQ_API_KEY (fallback).');
  process.exit(1);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
  process.exit(1);
}

const db = init({
  appId:
    process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
    process.env.INSTANT_APP_ID ||
    '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
      if (parsed && Array.isArray(parsed.processedIds)) {
        return {
          processedIds: parsed.processedIds,
          successCount: parsed.successCount || 0,
          errorCount: parsed.errorCount || 0,
          startedAt: parsed.startedAt || Date.now(),
          lastSavedAt: Date.now(),
        };
      }
    } catch (e) {
      // Ignore corrupted checkpoint
    }
  }
  return {
    processedIds: [],
    successCount: 0,
    errorCount: 0,
    startedAt: Date.now(),
    lastSavedAt: Date.now(),
  };
}

function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.lastSavedAt = Date.now();
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function parseJsonField(value: string | null | undefined): any {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

function formatTags(tags: any): string {
  if (!tags) return 'None';
  if (typeof tags === 'string') return tags;
  if (Array.isArray(tags)) return tags.join(', ');
  if (typeof tags === 'object') {
    const pairs = Object.entries(tags)
      .slice(0, 30)
      .map(([key, val]) => `${key}: ${String(val)}`);
    return pairs.join(', ');
  }
  return String(tags);
}

function hasLodgingEntry(existing: string | null | undefined, poiId: string): boolean {
  if (!existing) return false;
  const parsed = parseJsonField(existing);
  if (!Array.isArray(parsed)) return false;
  return parsed.some((entry) => entry && entry.poiId === poiId);
}

function upsertLodgingEntry(existing: string | null | undefined, entry: LodgingEntry): string {
  const parsed = parseJsonField(existing);
  const list: LodgingEntry[] = Array.isArray(parsed) ? parsed : [];
  const index = list.findIndex((item) => item.poiId === entry.poiId);
  if (index >= 0) {
    list[index] = entry;
  } else {
    list.push(entry);
  }
  return JSON.stringify(list);
}

function buildPrompt(record: PoiRecord): string {
  const name = record.name?.trim() || 'this place';
  const distance = typeof record.distance === 'number' ? Math.round(record.distance) : null;
  const lat = typeof record.lat === 'number' ? record.lat.toFixed(6) : 'unknown';
  const lon = typeof record.lon === 'number' ? record.lon.toFixed(6) : 'unknown';
  const tags = formatTags(parseJsonField(record.tags || null));
  const distanceText = distance !== null ? `${distance}` : 'unknown';

  return `Act as a local travel SEO expert. Write 2-3 unique, engaging sentences for a POI named ${name}. Mention it is located ${distanceText} meters away. Describe its vibe based on its category and tags. Ensure the text helps users locate it and highlights key features in **bold**. Do not use generic filler.

POI DATA:
- Name: ${name}
- Distance (meters): ${distanceText}
- Latitude: ${lat}
- Longitude: ${lon}
- Tags: ${tags}`;
}

function ensureBoldKeywords(text: string, name: string): string {
  if (/\*\*.+\*\*/.test(text)) return text;
  if (name && text.includes(name)) {
    return text.replace(name, `**${name}**`);
  }
  return `**${name}** - ${text}`;
}

function normalizeSentences(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (!sentences || sentences.length <= 3) return cleaned;
  return sentences.slice(0, 3).join(' ').trim();
}

function isRateLimitError(error: any): boolean {
  const status = error?.status || error?.statusCode || error?.response?.status;
  const message = (error?.message || '').toLowerCase();
  return status === 429 || message.includes('rate limit') || message.includes('too many requests');
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number; maxDelayMs: number }
): Promise<T> {
  const { retries, baseDelayMs, maxDelayMs } = opts;
  let lastError: any = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const shouldBackoff = isRateLimitError(error);
      const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      if (attempt < retries - 1 && shouldBackoff) {
        console.log(`  Rate limit hit, waiting ${Math.round(delayMs / 1000)}s before retry...`);
        await delay(delayMs);
        continue;
      }
      if (attempt < retries - 1 && !shouldBackoff) {
        await delay(500 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

async function generateWithGemini(prompt: string): Promise<string> {
  if (!geminiClient) {
    throw new Error('Gemini client not configured');
  }
  const modelName = geminiModels[geminiModelIndex % geminiModels.length];
  geminiModelIndex += 1;
  const model = geminiClient.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text() || '';
}

async function generateWithGroq(prompt: string): Promise<string> {
  if (!groqClient) {
    throw new Error('Groq client not configured');
  }
  const response = await groqClient.chat.completions.create({
    model: 'llama-3.1-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'You are a local travel SEO expert. Write concise, unique, engaging POI descriptions with bolded keywords.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 220,
  });
  return response.choices[0]?.message?.content || '';
}

async function generateDescription(record: PoiRecord): Promise<string> {
  const prompt = buildPrompt(record);
  const name = record.name?.trim() || 'this place';

  if (geminiClient) {
    try {
      const geminiText = await withRetry(
        () => generateWithGemini(prompt),
        { retries: 3, baseDelayMs: 1200, maxDelayMs: 20000 }
      );
      const normalized = normalizeSentences(geminiText);
      return ensureBoldKeywords(normalized, name);
    } catch (error) {
      console.warn('Gemini failed, falling back to Groq:', (error as Error).message);
      if (!groqClient) throw error;
    }
  }

  const groqText = await withRetry(
    () => generateWithGroq(prompt),
    { retries: 3, baseDelayMs: 1200, maxDelayMs: 20000 }
  );
  const normalized = normalizeSentences(groqText);
  return ensureBoldKeywords(normalized, name);
}

async function updateBuffetAccommodation(buffetId: string, accommodationLodging: string) {
  await db.transact([db.tx.buffets[buffetId].update({ accommodationLodging })]);
}

async function processRecord(
  record: PoiRecord,
  checkpoint: Checkpoint,
  options: RunOptions
): Promise<void> {
  const name = record.name || '(Unnamed POI)';
  try {
    if (!record.buffet?.id) {
      throw new Error('Missing linked buffet');
    }
    const description = await generateDescription(record);
    if (!description || description.length < 40) {
      throw new Error('Generated text too short');
    }
    if (!options.dryRun) {
      const nextValue = upsertLodgingEntry(record.buffet.accommodationLodging, {
        poiId: record.id,
        name: record.name || null,
        distance: record.distance ?? null,
        text: description,
        updatedAt: new Date().toISOString(),
      });
      await updateBuffetAccommodation(record.buffet.id, nextValue);
    }
    checkpoint.processedIds.push(record.id);
    checkpoint.successCount += 1;
    console.log(`✓ ${name} (${record.id}) -> Buffet ${record.buffet.name || record.buffet.id}`);
    console.log(description);
    console.log('-'.repeat(80));
  } catch (error: any) {
    checkpoint.errorCount += 1;
    console.log(`✗ ${name} (${record.id}) - ${error.message || 'Error'}`);
    if (error?.status || error?.statusCode || error?.response?.status) {
      console.log(`  Status: ${error.status || error.statusCode || error.response?.status}`);
    }
    if (error?.stack) {
      console.log(`  Stack: ${error.stack.split('\n').slice(0, 2).join(' | ')}`);
    }
  }
}

async function main() {
  const options = parseArgs();
  console.log('='.repeat(80));
  console.log('POI Accommodation & Lodging SEO Generator');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Batch size: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}\n`);
  if (options.dryRun) {
    console.log('DRY RUN mode enabled (no database writes).');
  }
  if (options.limit > 0) {
    console.log(`Limit: ${options.limit} record(s)\n`);
  }

  const checkpoint = options.dryRun
    ? {
        processedIds: [],
        successCount: 0,
        errorCount: 0,
        startedAt: Date.now(),
        lastSavedAt: Date.now(),
      }
    : loadCheckpoint();
  const processedSet = new Set(checkpoint.processedIds);
  const limiter = pLimit(CONCURRENCY);

  let offset = 0;
  let totalSeen = 0;
  let totalAttempted = 0;

  while (true) {
    const result = await db.query({
      poiRecords: {
        $: {
          where: { group: TARGET_GROUP },
          limit: QUERY_LIMIT,
          offset,
        },
        buffet: {},
      },
    });

    const records = (result.poiRecords || []) as PoiRecord[];
    if (records.length === 0) break;

    totalSeen += records.length;

    const pending = records.filter((record) => {
      if (processedSet.has(record.id)) return false;
      const buffet = record.buffet;
      if (!buffet?.id) return false;
      return !hasLodgingEntry(buffet.accommodationLodging || null, record.id);
    });

    if (pending.length === 0) {
      offset += QUERY_LIMIT;
      continue;
    }

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((record) =>
          limiter(async () => {
            if (options.limit > 0 && totalAttempted >= options.limit) {
              return;
            }
            totalAttempted += 1;
            await processRecord(record, checkpoint, options);
          })
        )
      );

      if (!options.dryRun) {
        saveCheckpoint(checkpoint);
      }
      if (options.limit > 0 && totalAttempted >= options.limit) {
        break;
      }
      await delay(BATCH_DELAY_MS);
    }

    if (options.limit > 0 && totalAttempted >= options.limit) {
      break;
    }
    offset += QUERY_LIMIT;
  }

  const durationMin = ((Date.now() - checkpoint.startedAt) / 1000 / 60).toFixed(1);
  console.log('\n' + '='.repeat(80));
  console.log('DONE');
  console.log('='.repeat(80));
  console.log(`Total scanned: ${totalSeen}`);
  console.log(`Success: ${checkpoint.successCount}`);
  console.log(`Errors: ${checkpoint.errorCount}`);
  console.log(`Duration: ${durationMin} min`);

  if (!options.dryRun && checkpoint.errorCount === 0) {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log('Checkpoint file cleaned up.');
    }
  } else if (!options.dryRun) {
    console.log('Checkpoint saved for resume.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
