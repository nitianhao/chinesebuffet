/**
 * Advanced Neighborhood Enrichment Script
 * 
 * Enriches buffet neighborhood data using Groq LLM to extract multiple location groupings:
 * - Primary neighborhoods (official/informal)
 * - Districts/areas (Downtown, Midtown, Chinatown, etc.)
 * - County (official)
 * - Metro area (common name)
 * 
 * SCHEMA MIGRATION PLAN:
 * =====================
 * 
 * CURRENT STATE:
 * - `neighborhood` (string | null) - Single neighborhood value
 * 
 * NEW SCHEMA DESIGN:
 * We maintain backward compatibility by:
 * 1. Keeping `neighborhood` field as `neighborhoodPrimary` (string | null)
 *    - This preserves the existing single-value field for backward compatibility
 *    - Existing code that reads `buffet.neighborhood` continues to work
 *    - We populate this with the primary neighborhood from enriched data
 * 
 * 2. Adding `neighborhoodContext` (string | null) - JSON stringified object
 *    - Stores the full enriched context: neighborhoods array, districts, county, metro_area
 *    - Format matches the output schema below
 *    - This allows programmatic access to all location groupings for SEO
 * 
 * WHY THIS APPROACH:
 * - Backward compatible: existing `neighborhood` field remains accessible
 * - SEO-friendly: rich context enables better filtering/grouping by area, county, metro
 * - Flexible: JSON structure allows adding more fields later without schema changes
 * - Migration-safe: if enrichment fails, original `neighborhood` value is preserved
 * 
 * MIGRATION STEPS:
 * 1. Update schema: Add `neighborhoodContext` field (optional string for JSON)
 * 2. Run this script to populate both fields
 * 3. Update application code to read from `neighborhoodContext` when available
 * 4. Eventually deprecate `neighborhood` in favor of `neighborhoodPrimary` from context
 * 
 * Example commands:
 *   npx tsx scripts/enrich-neighborhoods-advanced.ts
 *   npx tsx scripts/enrich-neighborhoods-advanced.ts --limit 10 --concurrency 3
 *   npx tsx scripts/enrich-neighborhoods-advanced.ts --resume
 *   npx tsx scripts/enrich-neighborhoods-advanced.ts --dry-run
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import pLimit from 'p-limit';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Cost-efficient Groq model
const DEFAULT_LIMIT = 0; // 0 = unlimited
const DEFAULT_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const CHECKPOINT_FILE = path.join(__dirname, 'neighborhood-enrichment-checkpoint.json');

// ============================================================================
// SCHEMAS
// ============================================================================

const NeighborhoodItemSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['official', 'informal']),
  confidence: z.enum(['high', 'medium'])
});

const DistrictItemSchema = z.object({
  name: z.string().min(1),
  confidence: z.enum(['high', 'medium'])
});

const NeighborhoodContextSchema = z.object({
  neighborhoods: z.array(NeighborhoodItemSchema).default([]),
  districts_or_areas: z.array(DistrictItemSchema).default([]),
  county: z.string().nullable().default(null),
  metro_area: z.string().nullable().default(null),
  generatedAt: z.string().optional(),
  model: z.string().optional(),
  source: z.string().optional()
});

type NeighborhoodContext = z.infer<typeof NeighborhoodContextSchema>;

type BuffetRecord = {
  id: string;
  name?: string;
  address?: string;
  street?: string;
  cityName?: string;
  state?: string;
  stateAbbr?: string;
  lat?: number;
  lng?: number;
  neighborhood?: string | null;
  neighborhoodContext?: string | null;
};

interface Checkpoint {
  lastProcessedId: string | null;
  processedIds: string[];
  processedCount: number;
  errorCount: number;
  skippedCount: number;
  startTime: number;
}

// ============================================================================
// CHECKPOINT MANAGEMENT
// ============================================================================

function loadCheckpoint(): Checkpoint | null {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const data = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.warn(`Warning: Could not load checkpoint: ${error}`);
      return null;
    }
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  } catch (error) {
    console.error(`Error saving checkpoint: ${error}`);
  }
}

// ============================================================================
// DEDUPLICATION HELPERS
// ============================================================================

/**
 * Normalize a string for comparison: lowercase, strip punctuation, trim
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .trim();
}

/**
 * Check if two neighborhood names are similar (case-insensitive, punctuation-insensitive)
 * Also handles cases like "Downtown" vs "Downtown Phoenix"
 */
function areSimilar(name1: string, name2: string): boolean {
  const norm1 = normalizeString(name1);
  const norm2 = normalizeString(name2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // One contains the other (handles "Downtown" vs "Downtown Phoenix")
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    // But avoid false positives like "North" matching "Northwest"
    const words1 = norm1.split(/\s+/);
    const words2 = norm2.split(/\s+/);
    
    // If one is a single word and it's contained in the other, it's similar
    if (words1.length === 1 && words2.length > 1 && words2.includes(words1[0])) {
      return true;
    }
    if (words2.length === 1 && words1.length > 1 && words1.includes(words2[0])) {
      return true;
    }
    
    // If shorter name is at least 4 chars and is contained, consider similar
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length >= norm2.length ? norm1 : norm2;
    if (shorter.length >= 4 && longer.includes(shorter)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Deduplicate neighborhoods/districts against existing neighborhood string
 */
function deduplicateAgainstExisting(
  items: Array<{ name: string }>,
  existingNeighborhood: string | null
): Array<{ name: string }> {
  if (!existingNeighborhood || !existingNeighborhood.trim()) {
    return items;
  }
  
  return items.filter(item => !areSimilar(item.name, existingNeighborhood));
}

/**
 * Deduplicate within an array (remove duplicates)
 */
function deduplicateArray<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  
  for (const item of items) {
    const normalized = normalizeString(item.name);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(item);
    } else {
      // Check if we already have a similar one
      const existing = result.find(r => areSimilar(r.name, item.name));
      if (!existing) {
        result.push(item);
      }
    }
  }
  
  return result;
}

// ============================================================================
// GROQ API INTEGRATION
// ============================================================================

async function generateWithGroq(
  prompt: string,
  model: string
): Promise<{ text: string; tokens?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
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
          temperature: 0.1, // Low temperature for deterministic output
          max_tokens: 500, // Enough for structured JSON response
          messages: [
            {
              role: 'system',
              content: 'You are a geographic information expert. Return ONLY valid JSON. Do not invent obscure location names. If uncertain, omit fields.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' } // Force JSON output
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        const sleepMs = Math.min(2000 * Math.pow(2, attempt), 10000);
        if (attempt < MAX_RETRIES - 1) {
          console.log(`  Rate limit hit, waiting ${Math.round(sleepMs / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, sleepMs));
          continue;
        }
        throw new Error('Groq rate limited');
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
        throw new Error(`Groq error: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      
      // Extract token usage if available
      const tokens = data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined;

      return { text: text.trim(), tokens };
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw new Error('Request timeout');
      }

      if (attempt < MAX_RETRIES - 1) {
        const isServerError = error?.status >= 500 || error?.message?.includes('5');
        if (isServerError || error?.message?.includes('network') || error?.message?.includes('ECONNREFUSED')) {
          await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
          continue;
        }
      }

      throw error;
    }
  }

  throw new Error('Groq unavailable after retries');
}

/**
 * Extract JSON from text response, handling markdown code blocks
 */
function extractJsonFromText(text: string): { jsonText: string; extracted: boolean } {
  const trimmed = text.trim();
  
  // If it's already valid JSON, return as-is
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed);
      return { jsonText: trimmed, extracted: true };
    } catch {
      // Not valid JSON, continue to extraction
    }
  }
  
  // Try to extract from markdown code blocks
  const jsonMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (jsonMatch) {
    return { jsonText: jsonMatch[1], extracted: true };
  }
  
  // Try to find JSON object in text
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    return { jsonText: braceMatch[0], extracted: true };
  }
  
  return { jsonText: trimmed, extracted: false };
}

/**
 * Build the prompt for Groq
 */
function buildPrompt(
  address: string,
  city: string,
  lat: number,
  lng: number,
  existingNeighborhood: string | null
): string {
  const existingNote = existingNeighborhood
    ? `\nIMPORTANT: This location already has neighborhood "${existingNeighborhood}". Do NOT duplicate this value - omit it from your response if it matches any of your findings.`
    : '';

  return `Given this location, extract location groupings. Return ONLY valid JSON matching this exact schema:

{
  "neighborhoods": [{"name":"string","type":"official|informal","confidence":"high|medium"}],
  "districts_or_areas": [{"name":"string","confidence":"high|medium"}],
  "county": "string|null",
  "metro_area": "string|null"
}

Location:
- Address: ${address || 'N/A'}
- City: ${city || 'N/A'}
- Coordinates: ${lat}, ${lng}${existingNote}

RULES:
1. Do NOT return city/state names.
2. Do NOT duplicate existingNeighborhood if provided (omit if same or very similar).
3. Include additional overlapping neighborhoods if commonly known.
4. Counties must be official (e.g., "Maricopa County", not "Maricopa").
5. Metro areas must be widely recognized (e.g., "Greater Phoenix Area", "Dallas-Fort Worth Metroplex").
6. Districts/areas: Include well-known areas like "Downtown", "Midtown", "Chinatown", "Financial District" if applicable.
7. If unsure about a value, omit it rather than guess.
8. Return ONLY the JSON object, no markdown, no explanation.

JSON:`;
}

/**
 * Enrich neighborhood data for a single buffet
 */
async function enrichBuffetNeighborhood(
  buffet: BuffetRecord,
  model: string,
  dryRun: boolean
): Promise<{ success: boolean; context?: NeighborhoodContext; error?: string }> {
  // Validate required fields
  if (!buffet.lat || !buffet.lng) {
    return { success: false, error: 'Missing lat/lng' };
  }

  if (!buffet.address && !buffet.street) {
    return { success: false, error: 'Missing address' };
  }

  if (!buffet.cityName) {
    return { success: false, error: 'Missing city' };
  }

  const address = buffet.address || buffet.street || '';
  const city = buffet.cityName;
  const lat = buffet.lat;
  const lng = buffet.lng;
  const existingNeighborhood = buffet.neighborhood || null;

  try {
    // Build prompt
    const prompt = buildPrompt(address, city, lat, lng, existingNeighborhood);

    // Call Groq
    const { text: rawText } = await generateWithGroq(prompt, model);

    // Extract JSON
    const { jsonText, extracted } = extractJsonFromText(rawText);

    // Parse and validate
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      // Retry once with a "fix JSON" prompt
      console.log(`  ⚠ Invalid JSON, attempting to fix...`);
      const fixPrompt = `The following text should be valid JSON but has syntax errors. Fix it and return ONLY the corrected JSON object, no explanation:\n\n${jsonText}`;
      const { text: fixedText } = await generateWithGroq(fixPrompt, model);
      const { jsonText: fixedJson } = extractJsonFromText(fixedText);
      try {
        parsed = JSON.parse(fixedJson);
      } catch {
        return { success: false, error: 'Invalid JSON after retry' };
      }
    }

    // Validate against schema
    const validationResult = NeighborhoodContextSchema.safeParse(parsed);
    if (!validationResult.success) {
      return { success: false, error: `Schema validation failed: ${validationResult.error.message}` };
    }

    let context = validationResult.data;

    // Deduplicate against existing neighborhood
    if (existingNeighborhood) {
      context.neighborhoods = deduplicateAgainstExisting(context.neighborhoods, existingNeighborhood);
      context.districts_or_areas = deduplicateAgainstExisting(context.districts_or_areas, existingNeighborhood);
    }

    // Deduplicate within arrays
    context.neighborhoods = deduplicateArray(context.neighborhoods);
    context.districts_or_areas = deduplicateArray(context.districts_or_areas);

    // Add metadata
    context.generatedAt = new Date().toISOString();
    context.model = `groq:${model}`;
    context.source = 'llm';

    // Determine primary neighborhood (first high-confidence neighborhood, or first one, or existing)
    let neighborhoodPrimary: string | null = existingNeighborhood;
    if (context.neighborhoods.length > 0) {
      const highConf = context.neighborhoods.find(n => n.confidence === 'high');
      neighborhoodPrimary = highConf ? highConf.name : context.neighborhoods[0].name;
    }

    // If we have an existing neighborhood that wasn't in the enriched data, keep it as primary
    if (existingNeighborhood && !context.neighborhoods.some(n => areSimilar(n.name, existingNeighborhood))) {
      neighborhoodPrimary = existingNeighborhood;
      // Add it to neighborhoods array with high confidence
      context.neighborhoods.unshift({
        name: existingNeighborhood,
        type: 'informal',
        confidence: 'high'
      });
    }

    return { success: true, context };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

// ============================================================================
// MAIN SCRIPT
// ============================================================================

async function main() {
  const argv = process.argv.slice(2);
  const limit = argv.includes('--limit') 
    ? parseInt(argv[argv.indexOf('--limit') + 1] || '0', 10)
    : DEFAULT_LIMIT;
  const concurrency = argv.includes('--concurrency')
    ? parseInt(argv[argv.indexOf('--concurrency') + 1] || String(DEFAULT_CONCURRENCY), 10)
    : DEFAULT_CONCURRENCY;
  const resume = argv.includes('--resume');
  const dryRun = argv.includes('--dry-run');
  const model = process.env.GROQ_MODEL || DEFAULT_MODEL;

  // Validate environment
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN is not set');
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('ERROR: GROQ_API_KEY is not set');
    process.exit(1);
  }

  // Initialize database
  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('='.repeat(80));
  console.log('Neighborhood Enrichment Script');
  console.log('='.repeat(80));
  console.log(`Model: ${model}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);
  console.log(`Dry run: ${dryRun ? 'YES (no database writes)' : 'NO'}`);
  console.log(`Resume: ${resume ? 'YES' : 'NO'}`);
  console.log('');

  // Load checkpoint
  const checkpoint = resume ? loadCheckpoint() : null;
  const processedIds = new Set<string>(checkpoint?.processedIds || []);
  let processedCount = checkpoint?.processedCount || 0;
  let errorCount = checkpoint?.errorCount || 0;
  let skippedCount = checkpoint?.skippedCount || 0;
  const startTime = checkpoint?.startTime || Date.now();

  console.log(`Starting from: ${checkpoint ? `checkpoint (${processedCount} processed)` : 'beginning'}`);
  console.log('');

  // Fetch all buffets
  console.log('Fetching buffets...');
  let allBuffets: BuffetRecord[] = [];
  let offset = 0;
  const batchSize = 500;

  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
        },
      },
    });

    const buffets = (result.buffets || []) as BuffetRecord[];
    if (buffets.length === 0) break;

    allBuffets = allBuffets.concat(buffets);
    offset += batchSize;

    if (buffets.length < batchSize) break;
    process.stdout.write(`\rFetched ${allBuffets.length} buffets...`);
  }

  console.log(`\n✓ Fetched ${allBuffets.length} total buffets`);
  console.log('');

  // Filter buffets to process
  let buffetsToProcess = allBuffets.filter(b => {
    // Skip if missing required fields
    if (!b.lat || !b.lng) return false;
    if (!b.address && !b.street) return false;
    if (!b.cityName) return false;
    
    // When resuming: skip if already processed AND has neighborhoodContext
    // (re-process if it was processed before schema sync and doesn't have context)
    if (resume && processedIds.has(b.id) && b.neighborhoodContext) {
      return false;
    }
    
    // Skip if already processed (only when not resuming, or when resuming but has context)
    if (!resume && processedIds.has(b.id)) return false;
    
    return true;
  });

  // Apply limit
  if (limit > 0 && buffetsToProcess.length > limit) {
    buffetsToProcess = buffetsToProcess.slice(0, limit);
  }

  console.log(`Processing ${buffetsToProcess.length} buffets...`);
  console.log('');

  // Process with concurrency
  const limiter = pLimit(concurrency);
  let currentIndex = 0;

  const processBuffet = async (buffet: BuffetRecord) => {
    const index = ++currentIndex;
    const total = buffetsToProcess.length;

    try {
      console.log(`[${index}/${total}] Processing "${buffet.name || buffet.id}"`);
      console.log(`  Location: ${buffet.address || buffet.street || 'N/A'}, ${buffet.cityName || 'N/A'}, ${buffet.state || 'N/A'}`);

      const result = await enrichBuffetNeighborhood(buffet, model, dryRun);

      if (!result.success) {
        console.log(`  ✗ Error: ${result.error}`);
        errorCount++;
        processedIds.add(buffet.id);
        saveCheckpoint({
          lastProcessedId: buffet.id,
          processedIds: Array.from(processedIds),
          processedCount,
          errorCount,
          skippedCount,
          startTime
        });
        return;
      }

      if (!result.context) {
        console.log(`  ⏭ Skipped (no context generated)`);
        skippedCount++;
        processedIds.add(buffet.id);
        saveCheckpoint({
          lastProcessedId: buffet.id,
          processedIds: Array.from(processedIds),
          processedCount,
          errorCount,
          skippedCount,
          startTime
        });
        return;
      }

      // Determine primary neighborhood
      const neighborhoodPrimary = result.context.neighborhoods.length > 0
        ? (result.context.neighborhoods.find(n => n.confidence === 'high')?.name || result.context.neighborhoods[0].name)
        : buffet.neighborhood; // Preserve existing if no new neighborhoods found

      // Update database
      if (!dryRun) {
        try {
          await db.transact([
            db.tx.buffets[buffet.id].update({
              neighborhood: neighborhoodPrimary, // Update primary field (backward compatible)
              neighborhoodContext: JSON.stringify(result.context) // Store full context
            })
          ]);
        } catch (updateError: any) {
          // Check if it's a schema sync issue
          if (updateError.message?.includes('Attributes are missing') || 
              updateError.message?.includes('schema') ||
              updateError.message?.includes('not found') ||
              updateError.message?.includes('Validation failed')) {
            console.log(`  ⚠ Schema not synced - updating neighborhood only`);
            console.log(`  ℹ Run 'npm run sync-schema' to enable neighborhoodContext field`);
            // Fallback: only update neighborhood field (backward compatible)
            try {
              await db.transact([
                db.tx.buffets[buffet.id].update({
                  neighborhood: neighborhoodPrimary
                })
              ]);
              console.log(`  ✓ Updated neighborhood (context will be saved after schema sync)`);
            } catch (fallbackError: any) {
              console.error(`  ✗ Fatal: Cannot update even neighborhood field`);
              console.error(`\n  Schema sync required! Run one of these:`);
              console.error(`    1. npm run sync-schema`);
              console.error(`    2. npx instant-cli push --app 709e0e09-3347-419b-8daa-bad6889e480d`);
              console.error(`    3. npm run dev (let it start, then stop it)`);
              throw new Error(`Schema sync required. Error: ${fallbackError.message}`);
            }
          } else {
            throw updateError;
          }
        }
      }

      console.log(`  ✓ Enriched:`);
      console.log(`    Primary: ${neighborhoodPrimary || 'N/A'}`);
      console.log(`    Neighborhoods: ${result.context.neighborhoods.length}`);
      console.log(`    Districts: ${result.context.districts_or_areas.length}`);
      console.log(`    County: ${result.context.county || 'N/A'}`);
      console.log(`    Metro: ${result.context.metro_area || 'N/A'}`);

      processedCount++;
      processedIds.add(buffet.id);

      // Save checkpoint every 10 records
      if (processedCount % 10 === 0) {
        saveCheckpoint({
          lastProcessedId: buffet.id,
          processedIds: Array.from(processedIds),
          processedCount,
          errorCount,
          skippedCount,
          startTime
        });
      }
    } catch (error: any) {
      console.error(`  ✗ Fatal error: ${error.message}`);
      errorCount++;
      processedIds.add(buffet.id);
      saveCheckpoint({
        lastProcessedId: buffet.id,
        processedIds: Array.from(processedIds),
        processedCount,
        errorCount,
        skippedCount,
        startTime
      });
    }
  };

  // Process all buffets
  await Promise.all(buffetsToProcess.map(buffet => limiter(() => processBuffet(buffet))));

  // Final checkpoint
  saveCheckpoint({
    lastProcessedId: buffetsToProcess[buffetsToProcess.length - 1]?.id || null,
    processedIds: Array.from(processedIds),
    processedCount,
    errorCount,
    skippedCount,
    startTime
  });

  // Summary
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log('');
  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Processed: ${processedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Duration: ${duration} minutes`);
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
