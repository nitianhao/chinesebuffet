/**
 * Generate SEO-optimized "Pet Care & Veterinary" sections for buffets
 * 
 * Generates HTML descriptions based on POI data from the database.
 * 
 * Example commands:
 *   npx tsx scripts/generate-poi-pet-care-veterinary.ts --limit 10 --concurrency 3 --dry-run
 *   npx tsx scripts/generate-poi-pet-care-veterinary.ts --concurrency 5
 * 
 * Configuration:
 *   - Model: DEFAULT_MODEL constant (line 28) - change to use different Groq model
 *   - Max tokens: max_tokens in generateWithGroq function (line 495) - adjust for longer/shorter outputs
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const DEFAULT_LIMIT = 0; // 0 = no limit
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Low-cost Groq model
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const TARGET_GROUP = 'Pet care & Veterinary';
const MAX_POIS = 10; // Limit to 10 POIs for SEO tightness
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoint-pet-care-veterinary.json');

type BuffetRecord = {
  id: string;
  name?: string | null;
  petCareVeterinary?: string | null;
  poiRecords?: PoiRecord[];
};

type PoiRecord = {
  id: string;
  osmId?: number | null;
  name?: string | null;
  category?: string | null;
  tags?: string | null;
  distanceFt?: number | null;
  group?: string | null;
};

type CleanPoi = {
  name: string;
  displayDistance: string;
  displayAddress: string;
};

type Checkpoint = {
  [buffetId: string]: {
    status: 'generated' | 'skipped_existing' | 'skipped_no_pois' | 'error';
    timestamp: number;
    poiCount?: number;
    errorMessage?: string;
  };
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function loadCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const content = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn('Warning: Could not parse checkpoint file, starting fresh');
    }
  }
  return {};
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function safeJsonParse(str: string | null | undefined): any {
  if (!str || typeof str !== 'string') return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function normalizeCategory(category: string | null | undefined): string {
  if (!category) return '';
  // Normalize: lowercase, spaces->underscore, collapse multiple underscores
  return category
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/[^\w_]/g, '');
}

function isExcludedCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const normalized = normalizeCategory(category);
  // Exact match for pet_boarding or animal_shelter
  return normalized === 'pet_boarding' || normalized === 'animal_shelter';
}

function roundToNearest10(num: number): number {
  return Math.round(num / 10) * 10;
}

function roundToNearest50(num: number): number {
  return Math.round(num / 50) * 50;
}

function formatDistance(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0 || !Number.isFinite(distanceFt)) {
    return 'unknown distance';
  }
  if (distanceFt < 1000) {
    const rounded = roundToNearest10(distanceFt);
    return `~${rounded} ft`;
  }
  const miles = distanceFt / 5280;
  return `~${miles.toFixed(1)} mi`;
}

function parseAddress(tags: any): string {
  if (!tags || typeof tags !== 'object') {
    return '(no address listed)';
  }

  const house = tags['addr:housenumber'] || '';
  const street = tags['addr:street'] || '';

  if (house && street) {
    return `${house} ${street}`;
  }
  if (street) {
    return street;
  }
  return '(no address listed)';
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function dedupePois(pois: PoiRecord[]): PoiRecord[] {
  // Primary key: osmId if present
  const byOsmId = new Map<number, PoiRecord>();
  // Secondary key: normalized name + rounded distance (for POIs without osmId)
  const byNameDistance = new Map<string, PoiRecord>();

  for (const poi of pois) {
    const distanceFt = poi.distanceFt || Infinity;
    
    if (poi.osmId != null && Number.isFinite(poi.osmId)) {
      // Primary deduplication by osmId
      const existing = byOsmId.get(poi.osmId);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byOsmId.set(poi.osmId, poi);
      }
    } else {
      // Secondary deduplication by name + distance
      const name = poi.name?.trim() || 'Pet care location';
      const normalizedName = normalizeName(name);
      const roundedDist = roundToNearest50(distanceFt);
      const key = `${normalizedName}|${roundedDist}`;
      
      const existing = byNameDistance.get(key);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byNameDistance.set(key, poi);
      }
    }
  }

  // Combine results, prioritizing osmId entries
  const result: PoiRecord[] = [];
  const seenSecondary = new Set<string>();

  for (const poi of byOsmId.values()) {
    result.push(poi);
  }

  for (const poi of byNameDistance.values()) {
    // Skip if we already have this via osmId
    if (poi.osmId != null && byOsmId.has(poi.osmId)) {
      continue;
    }
    // Skip if name+distance already seen
    const name = poi.name?.trim() || 'Pet care location';
    const normalizedName = normalizeName(name);
    const roundedDist = roundToNearest50(poi.distanceFt || Infinity);
    const key = `${normalizedName}|${roundedDist}`;
    if (!seenSecondary.has(key)) {
      seenSecondary.add(key);
      result.push(poi);
    }
  }

  // Sort by distance ascending
  return result.sort((a, b) => {
    const distA = a.distanceFt || Infinity;
    const distB = b.distanceFt || Infinity;
    return distA - distB;
  });
}

function prepareCleanPois(pois: PoiRecord[]): CleanPoi[] {
  return pois.map(poi => {
    // Name fallback: prefer poi.name, else tags.name/brand/operator, else "Pet care location"
    let name = poi.name?.trim() || null;
    if (!name) {
      const tags = safeJsonParse(poi.tags);
      name = tags.name || tags.brand || tags.operator || null;
    }
    name = name || 'Pet care location';

    const distanceFt = poi.distanceFt;
    const displayDistance = formatDistance(distanceFt);
    
    const tags = safeJsonParse(poi.tags);
    const displayAddress = parseAddress(tags);

    return {
      name,
      displayDistance,
      displayAddress
    };
  });
}

function buildIntroSentence(extras: {
  count: number;
  nearestDistance: string;
  rangeText: string | null;
}): string {
  if (extras.count === 1) {
    return `${extras.count} pet care &amp; veterinary option is listed at ${extras.nearestDistance} near this buffet.`;
  }
  // count >= 2: include rangeText
  return `${extras.count} pet care &amp; veterinary options are listed from ${extras.rangeText} near this buffet.`;
}

function normalizeHTML(html: string): string {
  if (!html || typeof html !== 'string') return html;
  
  // Escape ampersands (but preserve existing entities)
  let normalized = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');
  
  // Collapse whitespace: replace multiple spaces/newlines/tabs with single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove spaces between tags (e.g., "> <" => "><")
  normalized = normalized.replace(/>\s+</g, '><');
  
  // Trim leading/trailing whitespace
  normalized = normalized.trim();
  
  return normalized;
}

function buildPrompt(
  buffetName: string | null,
  cleanPois: CleanPoi[],
  extras: {
    count: number;
    nearestDistance: string;
    rangeText: string | null;
  }
): string {
  const buffetNameText = buffetName || null;
  const headerText = buffetNameText 
    ? `Pet care &amp; veterinary near ${buffetNameText}`
    : 'Pet care &amp; veterinary nearby';

  const listItemsExample = cleanPois
    .map(poi => `    <li>${poi.name} — ${poi.displayDistance} — ${poi.displayAddress}.</li>`)
    .join('\n');
  
  const introSentence = buildIntroSentence(extras);

  return `Generate SEO-friendly HTML for a "Pet care & veterinary" section.

RETURN FORMAT:
- Return HTML ONLY (no markdown fences, no JSON wrapper, no comments)
- Output the complete <section> element
- Output MUST start exactly with: <section data-poi-group="pet-care-veterinary">
- Output MUST end exactly with: </section>
- No leading or trailing text outside the section

HARD RULES (NON-NEGOTIABLE):
- DO NOT invent facts. Use ONLY the provided data.
- DO NOT output placeholders like "None available", "No options", "Not found", "N/A".
- DO NOT include phone numbers, opening hours, websites, or ratings.
- DO NOT include city, state, or zip codes.
- DO NOT add claims, opinions, or details not present.
- Keep language concise, neutral, and factual.

OUTPUT STRUCTURE:
<section data-poi-group="pet-care-veterinary">
  <h3>${headerText}</h3>
  <p>${introSentence}</p>
  <ul>
${listItemsExample}
  </ul>
  <p class="poi-note">Hours and availability can vary, so confirming details ahead of time is recommended.</p>
</section>

INTRO SENTENCE (STRICT):
You MUST use this EXACT sentence (1 sentence only):
${introSentence}

Do NOT modify it. Use it exactly as provided.

LIST ITEM RULES (STRICT):
- Format: <li>{Name} — {displayDistance} — {displayAddress}.</li>
- Each item MUST end with a period right before </li>
- Use exactly the format: Name — distance — address.
- Never include city/state/zip/phone/hours/website/ratings
- Never invent anything

CLOSER RULES (STRICT):
- Always include the closing paragraph with class="poi-note"
- Use exactly: <p class="poi-note">Hours and availability can vary, so confirming details ahead of time is recommended.</p>

DATA:
${JSON.stringify({ buffetName: buffetNameText, extras, places: cleanPois }, null, 2)}

Return HTML only:`;
}

function validateHTML(html: string, poiCount: number): { valid: boolean; reason?: string } {
  if (!html || typeof html !== 'string') {
    return { valid: false, reason: 'HTML is empty or not a string' };
  }

  // Must contain section with data-poi-group attribute
  if (!html.includes('<section data-poi-group="pet-care-veterinary">')) {
    return { valid: false, reason: 'HTML must contain <section data-poi-group="pet-care-veterinary">' };
  }
  
  if (!html.endsWith('</section>')) {
    return { valid: false, reason: 'HTML must end with </section>' };
  }
  
  // Must have exactly 1 h3
  const h3Matches = html.match(/<h3>/g);
  const h3Count = h3Matches ? h3Matches.length : 0;
  if (h3Count !== 1) {
    return { valid: false, reason: `Expected exactly 1 <h3>, found ${h3Count}` };
  }
  
  // Must have at least 1 ul
  if (!html.includes('<ul>')) {
    return { valid: false, reason: 'Missing <ul> tag' };
  }
  
  // Check for empty <ul></ul>
  if (html.includes('<ul></ul>') || html.includes('<ul>\n</ul>') || html.includes('<ul> </ul>')) {
    return { valid: false, reason: 'Contains empty <ul> tag' };
  }
  
  // Count list items
  const liMatches = html.match(/<li>/g);
  const liCount = liMatches ? liMatches.length : 0;
  if (liCount === 0) {
    return { valid: false, reason: 'No <li> items found' };
  }
  
  if (liCount !== poiCount) {
    return { valid: false, reason: `Expected ${poiCount} <li> items, found ${liCount}` };
  }
  
  // Check for banned phrases
  const bannedPhrases = ['no options', 'none available', 'not found', 'n/a', 'n/a'];
  const htmlLower = html.toLowerCase();
  for (const phrase of bannedPhrases) {
    if (htmlLower.includes(phrase)) {
      return { valid: false, reason: `Contains banned phrase: "${phrase}"` };
    }
  }
  
  // Check intro paragraph exists before ul
  const introPIndex = html.indexOf('<p>');
  const ulIndex = html.indexOf('<ul>');
  if (introPIndex === -1 || ulIndex === -1 || introPIndex >= ulIndex) {
    return { valid: false, reason: 'Intro <p> must exist before <ul>' };
  }
  
  // Check every <li> ends with ".</li>"
  const liMatches2 = html.match(/<li>([\s\S]*?)<\/li>/g);
  if (liMatches2) {
    for (const li of liMatches2) {
      if (!li.endsWith('.</li>')) {
        return { valid: false, reason: 'List item must end with .</li>' };
      }
    }
  }
  
  return { valid: true };
}

function isServerError(error: any): boolean {
  const status = error?.status || error?.statusCode || error?.response?.status;
  return status >= 500 && status < 600;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateWithGroq(
  prompt: string,
  model: string = DEFAULT_MODEL
): Promise<{ text: string; tokens?: TokenUsage }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not set');
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
          model,
          temperature: 0, // Low temperature for consistent output
          max_tokens: 450, // Enough for 10 li items
          messages: [
            {
              role: 'system',
              content: 'You format and lightly narrate provided data. You must not invent facts. Use only provided fields. Output only valid HTML and nothing else.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const sleepMs = Math.min(2000 * Math.pow(2, attempt), 10000);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  Rate limit hit, waiting ${Math.round(sleepMs / 1000)}s before retry...`);
          await delay(sleepMs);
          continue;
        }
        throw new Error('Groq rate limited');
      }

      if (!response.ok) {
        if (isServerError({ status: response.status }) && attempt < MAX_RETRIES - 1) {
          await delay(500 * (attempt + 1));
          continue;
        }
        throw new Error(`Groq error: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      
      let tokens: TokenUsage | undefined;
      if (data?.usage) {
        tokens = {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        };
      }
      
      return { text, tokens };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw new Error('Request timeout');
      }
      
      if (isServerError(error) && attempt < MAX_RETRIES - 1) {
        await delay(500 * (attempt + 1));
        continue;
      }
      
      throw error;
    }
  }

  throw new Error('Groq unavailable after retries');
}

async function generateDescription(
  buffetName: string | null,
  cleanPois: CleanPoi[],
  extras: {
    count: number;
    nearestDistance: string;
    rangeText: string | null;
  },
  model: string = DEFAULT_MODEL
): Promise<{ html: string; tokens?: TokenUsage }> {
  const prompt = buildPrompt(buffetName, cleanPois, extras);
  
  let lastError: any = null;
  let tokens: TokenUsage | undefined;
  
  // Try up to 2 times (initial + one retry with fix instruction)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, tokens: newTokens } = await generateWithGroq(prompt, model);
      tokens = newTokens || tokens;
      
      // Extract HTML (remove markdown code blocks if present)
      let html = text.trim();
      html = html.replace(/```html\s*/g, '').replace(/```\s*/g, '').trim();
      
      // Normalize HTML
      let normalizedHtml = normalizeHTML(html);
      
      // Validate HTML (structural and content checks)
      const validation = validateHTML(normalizedHtml, cleanPois.length);
      if (!validation.valid) {
        const validationError = `Invalid HTML structure: ${validation.reason}`;
        if (attempt < 1) {
          console.log(`  ${validationError}, retrying with fix instruction...`);
          // Retry with fix prompt
          const fixInstruction = `CRITICAL FIX: ${validation.reason}. Fix formatting to match the required template exactly, do not add facts.`;
          const fixPrompt = `${prompt}\n\nINVALID HTML:\n${normalizedHtml}\n\nFAILED VALIDATIONS:\n- ${validation.reason}\n\n${fixInstruction}\n\nReturn corrected HTML only. Do not change facts. Do not add or remove POIs.`;
          const fixResult = await generateWithGroq(fixPrompt, model);
          tokens = {
            promptTokens: (tokens?.promptTokens || 0) + (fixResult.tokens?.promptTokens || 0),
            completionTokens: (tokens?.completionTokens || 0) + (fixResult.tokens?.completionTokens || 0),
            totalTokens: (tokens?.totalTokens || 0) + (fixResult.tokens?.totalTokens || 0)
          };
          let fixHtml = fixResult.text.trim();
          fixHtml = fixHtml.replace(/```html\s*/g, '').replace(/```\s*/g, '').trim();
          normalizedHtml = normalizeHTML(fixHtml);
          const fixValidation = validateHTML(normalizedHtml, cleanPois.length);
          if (fixValidation.valid) {
            return { html: normalizedHtml, tokens };
          }
          // If fix also fails, continue to throw error
        }
        throw new Error(validationError);
      }
      
      return { html: normalizedHtml, tokens };
    } catch (error: any) {
      lastError = error;
      if (attempt < 1) {
        console.log(`  Generation failed (attempt ${attempt + 1}/2): ${error.message}`);
        await delay(1000 * (attempt + 1));
        continue;
      }
    }
  }
  
  throw new Error(`Generation failed after 2 attempts: ${lastError?.message || 'Unknown error'}`);
}

async function processBuffet(
  buffet: BuffetRecord,
  checkpoint: Checkpoint,
  db: any,
  options: { dryRun: boolean; resume: boolean; model: string }
): Promise<{ status: string; tokens?: TokenUsage; html?: string; poiCount?: number }> {
  const buffetId = buffet.id;
  
  // Skip if already in checkpoint (resume mode)
  if (options.resume && checkpoint[buffetId]) {
    const existing = checkpoint[buffetId];
    return { 
      status: existing.status,
      poiCount: existing.poiCount
    };
  }
  
  // Skip if petCareVeterinary already exists (DO NOT call LLM)
  if (buffet.petCareVeterinary && buffet.petCareVeterinary.trim().length > 0) {
    checkpoint[buffetId] = {
      status: 'skipped_existing',
      timestamp: Date.now()
    };
    return { status: 'skipped_existing' };
  }
  
  // Get POIs and filter
  const poiRecords = buffet.poiRecords || [];
  const filteredPOIs = poiRecords
    .filter((poi: PoiRecord) => {
      // Filter by group (exact match)
      if (!poi.group || poi.group !== TARGET_GROUP) return false;
      // Exclude categories using normalized comparison
      if (isExcludedCategory(poi.category)) return false;
      return true;
    });

  // If no eligible POIs => SKIP LLM + SKIP DB update
  if (filteredPOIs.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }

  // Dedupe POIs (keep closest for same osmId)
  const dedupedPOIs = dedupePois(filteredPOIs);
  
  // Limit to MAX_POIS (closest ones)
  const limitedPOIs = dedupedPOIs.slice(0, MAX_POIS);
  
  // Prepare clean data
  const cleanPois = prepareCleanPois(limitedPOIs);
  
  // Calculate extras (IN CODE)
  const count = cleanPois.length;
  const nearestDistance = cleanPois[0].displayDistance;
  const farthestDistance = count >= 2 ? cleanPois[count - 1].displayDistance : undefined;
  const rangeText = count >= 2 ? `${nearestDistance} to ${farthestDistance}` : null;
  
  const extras = {
    count,
    nearestDistance,
    rangeText
  };
  
  // Generate description
  try {
    const { html, tokens } = await generateDescription(
      buffet.name || null,
      cleanPois,
      extras,
      options.model
    );
    
    // Write to database if not dry run
    if (!options.dryRun) {
      await db.transact([db.tx.buffets[buffetId].update({ petCareVeterinary: html.trim() })]);
    }
    
    checkpoint[buffetId] = {
      status: 'generated',
      timestamp: Date.now(),
      poiCount: limitedPOIs.length
    };
    
    return { 
      status: 'generated', 
      html, 
      tokens,
      poiCount: limitedPOIs.length
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    checkpoint[buffetId] = {
      status: 'error',
      timestamp: Date.now(),
      errorMessage
    };
    throw new Error(`Generation failed: ${errorMessage}`);
  }
}

function printBuffetOutput(
  buffet: BuffetRecord,
  result: { 
    status: string; 
    tokens?: TokenUsage; 
    html?: string;
    poiCount?: number;
  }
) {
  const buffetId = buffet.id;
  const buffetName = buffet.name || buffetId;
  
  console.log('='.repeat(80));
  console.log(`BUFFET: ${buffetName} (${buffetId})`);
  
  if (result.status === 'generated') {
    console.log(`STATUS: GENERATED`);
    console.log(`POI COUNT: ${result.poiCount || 0}`);
    
    if (result.tokens) {
      console.log(`TOKENS: prompt=${result.tokens.promptTokens} | completion=${result.tokens.completionTokens} | total=${result.tokens.totalTokens}`);
    }
    
    console.log('-'.repeat(80));
    if (result.html) {
      console.log(result.html);
    }
  } else if (result.status === 'skipped_existing') {
    console.log(`STATUS: SKIPPED_EXISTING (petCareVeterinary already present)`);
  } else if (result.status === 'skipped_no_pois') {
    console.log(`STATUS: SKIPPED_NO_POIS (no eligible POIs)`);
  }
  
  console.log('='.repeat(80));
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag) || argv.includes(flag.replace(/([A-Z])/g, '-$1').toLowerCase());
  const getFlagValue = (flag: string, defaultValue: string | number) => {
    // Support both "--flag=value" and "--flag value" styles
    const equalsIndex = argv.findIndex(arg => arg.startsWith(flag + '='));
    if (equalsIndex >= 0) {
      const value = argv[equalsIndex].split('=')[1];
      if (typeof defaultValue === 'number') {
        const num = Number(value);
        if (!Number.isNaN(num)) return num;
      } else {
        return value;
      }
    }

    const spaceIndex = argv.findIndex(arg => arg === flag);
    if (spaceIndex >= 0 && argv[spaceIndex + 1]) {
      const value = argv[spaceIndex + 1];
      if (typeof defaultValue === 'number') {
        const num = Number(value);
        if (!Number.isNaN(num)) return num;
      } else {
        return value;
      }
    }

    return defaultValue;
  };

  const limit = getFlagValue('--limit', DEFAULT_LIMIT) as number;
  const concurrency = getFlagValue('--concurrency', DEFAULT_CONCURRENCY) as number;
  const dryRun = hasFlag('--dryRun') || hasFlag('--dry-run');
  const resume = hasFlag('--resume');
  const model = getFlagValue('--model', DEFAULT_MODEL) as string;

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY is not set in .env.local');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('='.repeat(80));
  console.log('SEO Pet Care & Veterinary Description Generator');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Excluded categories: pet_boarding, animal_shelter`);
  console.log(`Model: ${model}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);
  console.log(`Dry run mode: ${dryRun ? 'ENABLED (no database writes)' : 'DISABLED'}`);
  console.log(`Resume mode: ${resume ? 'ENABLED' : 'DISABLED'}`);
  console.log('');

  const checkpoint = resume ? loadCheckpoint() : {};
  const limiter = pLimit(concurrency);
  
  let scanned = 0;
  let generated = 0;
  let skippedExisting = 0;
  let skippedNoPois = 0;
  let failed = 0;
  let totalTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const startTime = Date.now();
  
  // Fetch buffets in batches
  const batchSize = 100;
  let offset = 0;
  let processed = 0;
  let scheduled = 0; // Count of buffets scheduled for processing (enforces limit)
  const maxScans = limit > 0 ? limit * 3 : Infinity; // Stop after scanning 3x limit to avoid infinite loops
  
  while (true) {
    // Stop once we've scheduled enough items
    if (limit > 0 && scheduled >= limit) {
      break;
    }
    
    // Stop if we've scanned too many buffets without finding any to process
    if (limit > 0 && scanned >= maxScans) {
      console.log(`\nStopping after scanning ${scanned} buffets (limit: ${limit}, max scans: ${maxScans})`);
      break;
    }
    
    const result = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
        },
        poiRecords: {
          $: {
            where: { group: TARGET_GROUP },
          },
        },
      },
    });
    
    const buffets = (result.buffets || []) as BuffetRecord[];
    if (buffets.length === 0) break;
    
    scanned += buffets.length;
    
    // Filter buffets that need processing and count skipped ones
    const toProcess: BuffetRecord[] = [];
    const skippedInBatch: { existing: number; noPois: number } = { existing: 0, noPois: 0 };
    
    for (const buffet of buffets) {
      // Stop scheduling if we've reached the limit
      if (limit > 0 && scheduled >= limit) {
        break;
      }
      
      // Skip if already in checkpoint (resume mode)
      if (resume && checkpoint[buffet.id]) {
        continue;
      }
      
      // Skip if already has petCareVeterinary
      if (buffet.petCareVeterinary && buffet.petCareVeterinary.trim().length > 0) {
        skippedInBatch.existing++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_existing',
          timestamp: Date.now()
        };
        skippedExisting++;
        if (dryRun && skippedExisting <= 5) {
          printBuffetOutput(buffet, { status: 'skipped_existing' });
        }
        continue;
      }
      
      // Check for eligible POIs
      const pois = buffet.poiRecords || [];
      const hasEligiblePOIs = pois.some((p: PoiRecord) => {
        if (!p.group || p.group !== TARGET_GROUP) return false;
        if (isExcludedCategory(p.category)) return false;
        return true;
      });
      
      if (!hasEligiblePOIs) {
        skippedInBatch.noPois++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_no_pois',
          timestamp: Date.now()
        };
        skippedNoPois++;
        if (dryRun && skippedNoPois <= 5) {
          printBuffetOutput(buffet, { status: 'skipped_no_pois' });
        }
        continue;
      }
      
      // This buffet needs processing
      // Only add if we haven't reached the limit yet
      if (limit === 0 || scheduled < limit) {
        toProcess.push(buffet);
        scheduled++;
      } else {
        // We've reached the limit, stop adding more
        break;
      }
    }
    
    // If no items to process in this batch, check if we should fetch more
    if (toProcess.length === 0) {
      // If we've reached the limit, stop
      if (limit > 0 && scheduled >= limit && processed >= limit) {
        break;
      }
      // If no more buffets in this batch, stop
      if (buffets.length < batchSize) {
        break;
      }
      // If we've scanned enough buffets, stop (avoid infinite loop)
      if (limit > 0 && scanned >= maxScans) {
        break;
      }
      // Otherwise, fetch next batch
      offset += batchSize;
      continue;
    }
    
    // Process with concurrency, but respect the limit
    const promises = toProcess.map(buffet =>
      limiter(async () => {
        // Double-check limit before processing (safety check)
        if (limit > 0 && processed >= limit) {
          return;
        }
        
        try {
          const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume, model });
          
          if (result.status === 'generated') {
            generated++;
            if (result.tokens) {
              totalTokens.promptTokens += result.tokens.promptTokens;
              totalTokens.completionTokens += result.tokens.completionTokens;
              totalTokens.totalTokens += result.tokens.totalTokens;
            }
            printBuffetOutput(buffet, result);
          }
          
          processed++;
          // Save checkpoint periodically
          if (!dryRun && processed % 10 === 0) {
            saveCheckpoint(checkpoint);
          }
        } catch (error: any) {
          failed++;
          const buffetId = buffet.id;
          checkpoint[buffetId] = {
            status: 'error',
            timestamp: Date.now(),
            errorMessage: error?.message || String(error)
          };
          console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
          processed++;
        } finally {
          // No-op: scheduled count enforces the limit
        }
      })
    );
    
    await Promise.all(promises);
    
    // Break if we've reached the limit
    if (limit > 0 && processed >= limit) {
      break;
    }
    
    if (buffets.length < batchSize) break;
    offset += batchSize;
  }
  
  // Final checkpoint save
  if (!dryRun) {
    saveCheckpoint(checkpoint);
  }
  
  const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Buffets scanned: ${scanned}`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Skipped (no eligible POIs): ${skippedNoPois}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Total Tokens: ${totalTokens.totalTokens} (${totalTokens.promptTokens} in / ${totalTokens.completionTokens} out)`);
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
