/**
 * Generate SEO-optimized "Repair & Maintenance" descriptions for buffets
 * 
 * Generates plain text paragraphs (80-150 words) based on POI data from the database.
 * 
 * Example commands:
 *   npx tsx scripts/generate-poi-repair-maintenance.ts --concurrency 3 --dry-run --limit 10
 *   npx tsx scripts/generate-poi-repair-maintenance.ts --concurrency 3 --resume
 *   npx tsx scripts/generate-poi-repair-maintenance.ts --buffetId <id> --dry-run
 * 
 * Configuration:
 *   - Model: DEFAULT_MODEL constant (line 30) - change to use different Groq model
 *   - Max tokens: max_tokens in generateWithGroq function (line 400) - adjust for longer/shorter outputs
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
const TARGET_GROUP = 'Repair & Maintenance Services';
const MAX_POIS = 5; // Limit to 5 POIs for SEO tightness
const CHECKPOINT_DIR = path.join(__dirname, 'checkpoints');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'repair-maintenance.checkpoint.json');

type BuffetRecord = {
  id: string;
  name?: string | null;
  repairMaintenance?: string | null;
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
  displayName: string;
  serviceLabel: string;
  distanceMiles: string;
  openingHours?: string;
  phone?: string;
  website?: string;
  shortAddress?: string;
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

// Ensure checkpoint directory exists
if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

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

function getCategoryLabel(category: string | null | undefined): string {
  if (!category) return 'repair service';
  
  const categoryMap: Record<string, string> = {
    'car_repair': 'car repair',
    'motorcycle_repair': 'motorcycle repair',
    'shoe_repair': 'shoe repair',
    'tailor': 'tailor',
    'sewing': 'sewing shop',
    'bicycle_repair_station': 'bicycle repair station',
    'bicycle_repair': 'bicycle repair',
    'electronics_repair': 'electronics repair',
    'watch_repair': 'watch repair',
    'watchmaker': 'watch repair',
    'camera_repair': 'camera repair',
    'eyeglass_repair': 'eyeglass repair',
    'seamstress': 'sewing shop',
    'cleaning': 'cleaning service',
    'carpet_cleaning': 'carpet cleaning',
    'carpet_washing': 'carpet cleaning',
    'window_tinting': 'window tinting',
    'repair': 'repair service',
  };
  
  const normalized = category.toLowerCase().trim();
  return categoryMap[normalized] || normalized.replace(/_/g, ' ');
}

function formatDistanceMiles(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0 || !Number.isFinite(distanceFt)) {
    return 'unknown distance';
  }
  const miles = distanceFt / 5280;
  return `${miles.toFixed(2)} mi`;
}

function parseShortAddress(tags: any): string | undefined {
  if (!tags || typeof tags !== 'object') {
    return undefined;
  }
  
  const house = tags['addr:housenumber'] || '';
  const street = tags['addr:street'] || '';
  
  if (house && street) {
    return `${house} ${street}`;
  }
  if (street) {
    return street;
  }
  return undefined;
}

function getCityState(tags: any): string | undefined {
  if (!tags || typeof tags !== 'object') {
    return undefined;
  }
  
  const city = tags['addr:city'] || tags['addr:city'] || '';
  const state = tags['addr:state'] || tags['addr:state'] || '';
  
  if (city && state) {
    return `${city}, ${state}`;
  }
  if (city) {
    return city;
  }
  return undefined;
}

function derivePoiName(poi: PoiRecord, category: string): string {
  // Priority: poi.name > tags.name > tags.brand > category-based fallback
  if (poi.name && poi.name.trim()) {
    return poi.name.trim();
  }
  
  const tags = safeJsonParse(poi.tags);
  if (tags.name) return tags.name.trim();
  if (tags.brand) return tags.brand.trim();
  
  // Fallback: generic label based on category
  const serviceLabel = getCategoryLabel(category);
  return `a nearby ${serviceLabel}`;
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
      const name = poi.name?.trim() || 'repair service';
      const normalizedName = name.toLowerCase().trim().replace(/\s+/g, ' ');
      const roundedDist = Math.round((distanceFt || Infinity) / 50) * 50;
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
    const name = poi.name?.trim() || 'repair service';
    const normalizedName = name.toLowerCase().trim().replace(/\s+/g, ' ');
    const roundedDist = Math.round((poi.distanceFt || Infinity) / 50) * 50;
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

function selectVariedPois(pois: PoiRecord[]): PoiRecord[] {
  if (pois.length === 0) {
    return [];
  }
  
  // Ensure we only keep one POI per service label (closest one)
  const byServiceLabel = new Map<string, PoiRecord>();
  for (const poi of pois) {
    const serviceLabel = getCategoryLabel(poi.category || 'repair');
    const existing = byServiceLabel.get(serviceLabel);
    if (!existing || (poi.distanceFt || Infinity) < (existing.distanceFt || Infinity)) {
      byServiceLabel.set(serviceLabel, poi);
    }
  }
  
  const uniqueServicePois = Array.from(byServiceLabel.values()).sort((a, b) => {
    const distA = a.distanceFt || Infinity;
    const distB = b.distanceFt || Infinity;
    return distA - distB;
  });
  
  return uniqueServicePois.slice(0, MAX_POIS);
}

function prepareCleanPois(pois: PoiRecord[]): CleanPoi[] {
  return pois.map(poi => {
    const category = poi.category || 'repair';
    const displayName = derivePoiName(poi, category);
    const serviceLabel = getCategoryLabel(category);
    const distanceMiles = formatDistanceMiles(poi.distanceFt);
    
    const tags = safeJsonParse(poi.tags);
    const openingHours = tags.opening_hours || tags['opening_hours'] || undefined;
    const phone = tags.phone || tags['phone'] || undefined;
    const website = tags.website || tags['website'] || undefined;
    const shortAddress = parseShortAddress(tags);
    
    return {
      displayName,
      serviceLabel,
      distanceMiles,
      ...(openingHours && { openingHours }),
      ...(phone && { phone }),
      ...(website && { website }),
      ...(shortAddress && { shortAddress }),
    };
  });
}

function buildPrompt(
  buffetName: string | null,
  cityState: string | undefined,
  poiList: CleanPoi[]
): string {
  const buffetNameText = buffetName || 'this Chinese buffet';
  // Note: cityState is no longer included in prompt per requirements
  
  const poiListText = poiList.map((poi, idx) => {
    const parts: string[] = [];
    parts.push(`- ${poi.displayName} (${poi.serviceLabel}) at ${poi.distanceMiles}`);
    // Note: phone numbers are intentionally excluded per requirements
    if (poi.shortAddress) parts.push(`Address: ${poi.shortAddress}`);
    if (poi.openingHours) parts.push(`Hours: ${poi.openingHours}`);
    if (poi.website) parts.push(`Website: ${poi.website}`);
    return parts.join('\n');
  }).join('\n\n');
  
  return `Write ONE paragraph (80-150 words) about repair/maintenance services near a Chinese buffet.

RULES:
- Plain text only. No bullets, headings, or blank lines.
- Refer to "the buffet" (never mention buffet name in body).
- No city/state names. No other restaurant/dining names.
- Mention 1-5 POIs from the list, closest first (use 1 if only one is available). Each POI needs distance in miles.
- Per POI: distance + at most ONE detail (address OR hours OR website). No phones.
- Only mention POIs provided. No generic references ("other shops", "local mechanics").
- No superlatives, opinions, or filler ("nearby residents", "after a meal").
- Include words: "nearby", "repair", "maintenance", "close to the buffet".
- End with: "Availability and hours may vary."

Buffet: "${buffetNameText}"

POI_LIST:
${poiListText}

Write the paragraph now.`;
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
          temperature: 0.2,
          max_tokens: 250,
          messages: [
            {
              role: 'system',
              content: 'SEO writer. Plain text paragraph only. Use only provided POI data. No phones, no city/state, no buffet name in body, no other restaurants. 80-150 words.'
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
      let text = data?.choices?.[0]?.message?.content || '';
      
      // Clean up: remove markdown code blocks if present
      text = text.trim();
      text = text.replace(/```[\w]*\s*/g, '').replace(/```\s*/g, '').trim();
      
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

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

async function generateDescription(
  buffetName: string | null,
  cleanPois: CleanPoi[],
  cityState: string | undefined, // Kept for function signature but not used in prompt
  model: string = DEFAULT_MODEL
): Promise<{ text: string; tokens?: TokenUsage }> {
  const prompt = buildPrompt(buffetName, cityState, cleanPois);
  
  let lastError: any = null;
  let tokens: TokenUsage | undefined;
  
  // Try up to 2 times (initial + one retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { text, tokens: newTokens } = await generateWithGroq(prompt, model);
      tokens = newTokens || tokens;
      
      const wordCount = countWords(text);
      
      // Validate word count (80-150)
      if (wordCount < 80) {
        console.log(`  Generated text too short: ${wordCount} words (minimum 80), skipping...`);
        return { text: '', tokens };
      }
      
      if (wordCount > 150) {
        console.log(`  Generated text too long: ${wordCount} words (maximum 150), skipping...`);
        return { text: '', tokens };
      }
      
      return { text: text.trim(), tokens };
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
  options: { dryRun: boolean; resume: boolean; model: string; force: boolean }
): Promise<{ status: string; tokens?: TokenUsage; text?: string; poiCount?: number }> {
  const buffetId = buffet.id;
  
  // Skip if already in checkpoint (resume mode)
  // Only skip if successfully generated or explicitly skipped due to existing data
  // Re-process "skipped_no_pois" in case the logic has changed
  if (options.resume && checkpoint[buffetId]) {
    const existing = checkpoint[buffetId];
    if (existing.status === 'generated' || existing.status === 'skipped_existing') {
      return { 
        status: existing.status,
        poiCount: existing.poiCount
      };
    }
    // For skipped_no_pois or error, re-process to check with updated logic
  }
  
  // Skip if repairMaintenance already exists (unless force)
  if (!options.force && buffet.repairMaintenance && buffet.repairMaintenance.trim().length > 0) {
    checkpoint[buffetId] = {
      status: 'skipped_existing',
      timestamp: Date.now()
    };
    return { status: 'skipped_existing' };
  }
  
  // Get POIs and filter
  const poiRecords = buffet.poiRecords || [];
  const filteredPOIs = poiRecords.filter((poi: PoiRecord) => {
    // Filter by group (normalize comparison)
    if (!poi.group) return false;
    const normalizedGroup = poi.group.trim();
    // Handle both "Repair & Maintenance" and "Repair & Maintenance Services"
    if (!normalizedGroup.includes('Repair & Maintenance')) return false;
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
  
  // Select varied POIs (up to 5, unique service labels)
  const selectedPOIs = selectVariedPois(dedupedPOIs);
  if (selectedPOIs.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }
  
  // Prepare clean data
  const cleanPois = prepareCleanPois(selectedPOIs);
  
  // Note: cityState is no longer passed to prompt per requirements (no city/state mentions)
  
  // Generate description
  try {
    const { text, tokens } = await generateDescription(
      buffet.name || null,
      cleanPois,
      undefined, // cityState removed per requirements
      options.model
    );
    
    // Validate final text (more permissive minimum)
    // If LLM returned empty string per rules, that's acceptable - skip this buffet
    if (text.trim().length === 0) {
      checkpoint[buffetId] = {
        status: 'skipped_no_pois', // Treat as skipped since LLM couldn't generate
        timestamp: Date.now()
      };
      return { status: 'skipped_no_pois' };
    }
    
    const wordCount = countWords(text);
    if (wordCount < 80) {
      throw new Error(`Generated text too short: ${wordCount} words (minimum 80)`);
    }
    if (wordCount > 150) {
      throw new Error(`Generated text too long: ${wordCount} words (maximum 150)`);
    }
    
    // Write to database if not dry run
    if (!options.dryRun) {
      await db.transact([db.tx.buffets[buffetId].update({ repairMaintenance: text.trim() })]);
    }
    
    checkpoint[buffetId] = {
      status: 'generated',
      timestamp: Date.now(),
      poiCount: selectedPOIs.length
    };
    
    return { 
      status: 'generated', 
      text, 
      tokens,
      poiCount: selectedPOIs.length
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
    text?: string;
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
    if (result.text) {
      const wordCount = countWords(result.text);
      console.log(`WORD COUNT: ${wordCount}`);
      console.log('-'.repeat(80));
      console.log(result.text);
    }
  } else if (result.status === 'skipped_existing') {
    console.log(`STATUS: SKIPPED_EXISTING (repairMaintenance already present)`);
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
  const force = hasFlag('--force');
  const model = getFlagValue('--model', DEFAULT_MODEL) as string;
  const buffetId = getFlagValue('--buffetId', '') as string;

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
  console.log('SEO Repair & Maintenance Description Generator');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Model: ${model}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);
  console.log(`Dry run mode: ${dryRun ? 'ENABLED (no database writes)' : 'DISABLED'}`);
  console.log(`Resume mode: ${resume ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Force mode: ${force ? 'ENABLED (overwrite existing)' : 'DISABLED'}`);
  if (buffetId) {
    console.log(`Single buffet mode: ${buffetId}`);
  }
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
  
  // Single buffet mode
  if (buffetId) {
    try {
      const result = await db.query({
        buffets: {
          $: {
            where: { id: buffetId },
            limit: 1,
          },
          poiRecords: {
            $: {
              where: { group: TARGET_GROUP },
            },
          },
        },
      });
      
      const buffets = (result.buffets || []) as BuffetRecord[];
      if (buffets.length === 0) {
        console.error(`ERROR: Buffet with id "${buffetId}" not found`);
        process.exit(1);
      }
      
      const buffet = buffets[0];
      try {
        const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume, model, force });
        
        if (result.status === 'generated') {
          generated++;
          if (result.tokens) {
            totalTokens.promptTokens += result.tokens.promptTokens;
            totalTokens.completionTokens += result.tokens.completionTokens;
            totalTokens.totalTokens += result.tokens.totalTokens;
          }
        } else if (result.status === 'skipped_existing') {
          skippedExisting++;
        } else if (result.status === 'skipped_no_pois') {
          skippedNoPois++;
        }
        
        printBuffetOutput(buffet, result);
      } catch (error: any) {
        failed++;
        console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
      }
    } catch (error: any) {
      console.error(`[FATAL ERROR] ${error?.message || error}`);
      process.exit(1);
    }
  } else {
    // Batch processing mode
    const batchSize = 100;
    let offset = 0;
    let processed = 0;
    let scheduled = 0; // Count of buffets scheduled for processing (enforces limit)
  const maxScans = limit > 0 ? limit * 50 : Infinity; // Scan more to achieve generated limit
    
    while (true) {
    // Stop once we've generated enough items
    if (limit > 0 && generated >= limit) {
      break;
    }
      
      // Stop if we've scanned too many buffets without finding any to process
    if (limit > 0 && scanned >= maxScans) {
      console.log(`\nStopping after scanning ${scanned} buffets (generated: ${generated}, target: ${limit}, max scans: ${maxScans})`);
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
      // Stop scheduling if we've generated enough
      if (limit > 0 && generated >= limit) {
        break;
      }
        
        // Skip if already in checkpoint (resume mode)
        if (resume && checkpoint[buffet.id]) {
          continue;
        }
        
        // Skip if already has repairMaintenance (unless force)
        if (!force && buffet.repairMaintenance && buffet.repairMaintenance.trim().length > 0) {
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
          if (!p.group) return false;
          const normalizedGroup = p.group.trim();
          return normalizedGroup.includes('Repair & Maintenance');
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
      toProcess.push(buffet);
      scheduled++;
      }
      
    // If no items to process in this batch, check if we should fetch more
      if (toProcess.length === 0) {
      // If we've reached the generated limit, stop
      if (limit > 0 && generated >= limit) {
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
        // Double-check generated limit before processing (safety check)
        if (limit > 0 && generated >= limit) {
            return;
          }
          
          try {
            const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume, model, force });
            
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
            
            // Progress update every 10 items
          if (processed % 10 === 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const rate = processed / elapsed;
            const remaining = limit > 0 ? limit - generated : null;
              const eta = remaining && rate > 0 ? Math.round(remaining / rate) : null;
              console.log(`\n[PROGRESS] Processed: ${processed} | Generated: ${generated} | Skipped (existing): ${skippedExisting} | Skipped (no POIs): ${skippedNoPois} | Failed: ${failed}`);
              if (limit > 0) {
              const pct = ((generated / limit) * 100).toFixed(1);
                console.log(`  ${pct}% complete | Rate: ${rate.toFixed(2)}/s`);
                if (eta) {
                  console.log(`  ETA: ${eta}s (${Math.round(eta / 60)}m)`);
                }
              }
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
          }
        })
      );
      
      await Promise.all(promises);
      
    // Break if we've reached the generated limit
    if (limit > 0 && generated >= limit) {
        break;
      }
      
      if (buffets.length < batchSize) break;
      offset += batchSize;
    }
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
