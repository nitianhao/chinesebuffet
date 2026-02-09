/**
 * Generate SEO-optimized "Nearby Accommodation & Lodging" descriptions for buffets
 * 
 * Generates HTML descriptions based on POI data from the database.
 * 
 * Example commands:
 *   npx tsx scripts/generate-accommodation-lodging.ts --limit 10
 *   npx tsx scripts/generate-accommodation-lodging.ts --limit 10 --write
 *   npx tsx scripts/generate-accommodation-lodging.ts --write --resume --concurrency 3
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

const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const TARGET_GROUP = 'Accommodation & Lodging';
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoint-accomodation-lodging.json');
const MAX_ITEMS_PER_SECTION = 6;

type BuffetRecord = {
  id: string;
  name?: string | null;
  cityName?: string | null;
  state?: string | null;
  accommodationLodging?: string | null;
  poiRecords?: PoiRecord[] | any;
};

type PoiRecord = {
  id: string;
  name?: string | null;
  type?: string | null;
  category?: string | null;
  tags?: string | null;
  distanceFt?: number | null;
  group?: string | null;
  Group?: string | null; // Handle case variations
};

type CleanPoiItem = {
  name: string;
  displayDistance: string;
  displayAddress: string;
  category: string;
};

type Checkpoint = {
  [buffetId: string]: {
    status: 'generated' | 'skipped_existing' | 'skipped_no_pois' | 'error';
    timestamp: number;
    lodgingCount?: number;
    bedCount?: number;
    errorMessage?: string;
  };
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type LLMResponse = {
  html: string;
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

function parseJsonField(value: string | null | undefined): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

function formatDistance(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0) return 'unknown distance';
  if (distanceFt < 1000) {
    // Round to nearest 10 ft
    const rounded = Math.round(distanceFt / 10) * 10;
    return `~${rounded} ft`;
  }
  const miles = distanceFt / 5280;
  return `~${miles.toFixed(1)} mi`;
}

function parseAddress(tags: any): string {
  if (!tags || typeof tags !== 'object') {
    return '(no address listed)';
  }

  const housenumber = tags['addr:housenumber'] || '';
  const street = tags['addr:street'] || '';

  if (housenumber && street) {
    return `${housenumber} ${street}`;
  }
  if (street) {
    return street;
  }
  if (housenumber) {
    return housenumber;
  }
  return '(no address listed)';
}

function classifyPOIs(pois: PoiRecord[]): {
  bedStorePois: PoiRecord[];
  lodgingPois: PoiRecord[];
} {
  const bedStorePois: PoiRecord[] = [];
  const lodgingPois: PoiRecord[] = [];

  for (const poi of pois) {
    const category = poi.category || '';
    if (category.toLowerCase() === 'bed') {
      bedStorePois.push(poi);
    } else {
      lodgingPois.push(poi);
    }
  }

  return { bedStorePois, lodgingPois };
}

function prepareCleanPois(pois: PoiRecord[]): CleanPoiItem[] {
  return pois
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map(poi => {
      const name = poi.name || 'Unnamed';
      const displayDistance = formatDistance(poi.distanceFt);
      const tags = parseJsonField(poi.tags);
      const displayAddress = parseAddress(tags);
      const category = poi.category || 'unknown';

      return {
        name,
        displayDistance,
        displayAddress,
        category
      };
    });
}

function extractStreetName(displayAddress: string): string | null {
  if (!displayAddress || displayAddress === '(no address listed)') {
    return null;
  }
  
  // Remove leading house number if present (e.g., "4011 16th Avenue" => "16th Avenue")
  // Pattern: optional number(s) followed by space, then capture the rest
  const match = displayAddress.match(/^\d+\s+(.+)$/);
  if (match && match[1]) {
    const street = match[1].trim();
    return street.length > 0 ? street : null;
  }
  
  // If no leading number, use the whole address as street
  const street = displayAddress.trim();
  return street.length > 0 ? street : null;
}

function findCommonStreet(pois: CleanPoiItem[]): string | null {
  if (pois.length < 2) return null;
  
  const streetCounts: Record<string, number> = {};
  for (const poi of pois) {
    const street = extractStreetName(poi.displayAddress);
    if (street) {
      streetCounts[street] = (streetCounts[street] || 0) + 1;
    }
  }
  
  // Find street that appears in at least 2 POIs
  for (const [street, count] of Object.entries(streetCounts)) {
    if (count >= 2) {
      return street;
    }
  }
  
  return null;
}

function normalizeHTML(html: string): string {
  if (!html || typeof html !== 'string') return html;
  
  // Decode &amp; to & (we'll store raw & in text)
  let normalized = html.replace(/&amp;/g, '&');
  
  // Collapse whitespace: replace multiple spaces/newlines/tabs with single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Remove spaces between tags (e.g., "> <" => "><")
  normalized = normalized.replace(/>\s+</g, '><');
  
  // Trim leading/trailing whitespace
  normalized = normalized.trim();
  
  return normalized;
}

function buildPrompt(
  lodgingPoisClean: CleanPoiItem[],
  bedStorePoisClean: CleanPoiItem[],
  sectionsToRender: string[],
  extras: {
    lodgingCount: number;
    lodgingNearestDistance: string;
    lodgingFarthestDistance: string;
    bedCount: number;
    bedNearestDistance: string;
    bedFarthestDistance: string;
    commonStreets: {
      bed: string | null;
      lodging: string | null;
    };
  }
): string {
  const data: {
    lodgingPoisClean: CleanPoiItem[];
    bedStorePoisClean: CleanPoiItem[];
    sectionsToRender: string[];
    extras: typeof extras;
  } = {
    lodgingPoisClean,
    bedStorePoisClean,
    sectionsToRender,
    extras
  };

  return `Generate HTML for nearby accommodation & lodging sections.

RETURN FORMAT:
- Return STRICT JSON only: {"html":"..."} (no extra keys, no markdown, no comments)

HARD RULES (NON-NEGOTIABLE):
- You are given sectionsToRender array. Output ONLY those sections listed. If a section is not in sectionsToRender, do NOT output it.
- NEVER output a section with zero items. NEVER output empty <ul></ul>.
- NEVER output placeholder tokens like "~nearest" or "~farthest" as literal text. Use the actual distance values from extras.
- Mention clustering ONLY if extras.commonStreets.<section> is a real street name (not null, not "(no address listed)"). If null, do NOT mention clustering.

GLOBAL RULES (NON-NEGOTIABLE):
- DO NOT include buffet name, city, state, zip codes, or country (even if you think you know them).
- DO NOT invent facts. Use ONLY the provided data.
- DO NOT output placeholders like "None available", "No options", "Not found", "N/A".
- Do NOT say "check online", "visit a travel website", "please check", "more options", or any similar filler.
- Avoid vague phrases like: "various", "in the area", "available nearby" unless paired with concrete numbers/distances.
- Keep language concise, neutral, and user-helpful.

OUTPUT STRUCTURE:
Output ONLY the sections listed in sectionsToRender.

If "lodging" is in sectionsToRender, output:

<h3>Hotels & Motels Nearby</h3>
<p>ONE sentence intro (max 1 sentence) that MUST include:
  - lodgingCount
  - lodgingNearestDistance (use the actual value, not "~nearest")
  - AND lodgingFarthestDistance if provided (use actual values in format "~X to ~Y")
  No buffet name, no "Chinese buffet".</p>
<ul>
  <li>Name (optional label) — distance — address.</li>
  ...
</ul>
<p>OPTIONAL ONE sentence closing (max 1 sentence) that is helpful and non-generic.</p>

If "bed" is in sectionsToRender, output:

<h3>Bed & Mattress Stores Nearby</h3>
<p>ONE sentence intro (max 1 sentence) that MUST include:
  - bedCount
  - bedNearestDistance (use the actual value, not "~nearest")
  - AND bedFarthestDistance if provided (use actual values in format "~X to ~Y")
  If extras.commonStreets.bed is provided (not null) AND bedCount >= 2, also mention the street (e.g., "both on X" or "clustered on X").
  No buffet name, no "Chinese buffet".</p>
<ul>
  <li>Name — distance — address.</li>
  ...
</ul>
<p>OPTIONAL ONE sentence closing (max 1 sentence) that is helpful and non-generic.</p>

ORDER:
If both sections are in sectionsToRender, output in this order:
1) Hotels & Motels Nearby
2) Bed & Mattress Stores Nearby

LIST ITEM RULES (STRICT):
- Lodging list items:
  - Format: <Name> (optional label) — <displayDistance> — <displayAddress>.
  - End with a period.
  - Optional label rules:
    - If category is "hotel" => "(hotel)"
    - If category is "motel" => "(motel)"
    - Otherwise omit label
- Bed store list items:
  - Format: <Name> — <displayDistance> — <displayAddress>.
  - NEVER include any category label in bed list items.
  - End with a period.

INTRO SENTENCE TEMPLATES (USE THESE PATTERNS):
STYLE VARIATION (LIGHT, SAFE):
- Avoid repeating the exact same intro phrasing across records.
- You may rotate between these equivalent intro patterns, but ALWAYS include the same factual data:
  - "X lodging options are listed (~nearest to ~farthest), with the closest at ~nearest."
  - "X lodging options are listed, starting around ~nearest (~farthest at most)."
  - "X nearby lodging options appear in the data, beginning around ~nearest."
- For single-item sections, use:
  - "1 lodging option is listed, about ~nearest away."
  - "A single lodging option is listed, located about ~nearest away."
- Do NOT introduce any new facts, adjectives, or claims.
- Keep intros to exactly ONE sentence.

Lodging patterns:
- If farthest provided and different from nearest:
  - Rotate between: "X lodging options are listed (~nearest to ~farthest), with the closest at ~nearest."
  - Or: "X lodging options are listed, starting around ~nearest (~farthest at most)."
  - Or: "X nearby lodging options appear in the data, beginning around ~nearest."
- Else (single item or same distance):
  - "1 lodging option is listed, about ~nearest away."
  - Or: "A single lodging option is listed, located about ~nearest away."

Bed store patterns:
- If farthest provided and different from nearest:
  - Rotate between: "X bed and mattress stores are listed (~nearest to ~farthest), with the closest at ~nearest."
  - Or: "X bed and mattress stores are listed, starting around ~nearest (~farthest at most)."
  - Or: "X nearby bed and mattress stores appear in the data, beginning around ~nearest."
- Else (single item or same distance):
  - "1 bed and mattress store is listed, about ~nearest away."
  - Or: "A single bed and mattress store is listed, located about ~nearest away."
- If common street is provided (not null) and X>=2:
  - Add: "They are clustered on <street>." (merge into ONE sentence with semicolon if needed)

CLOSING SENTENCE REQUIREMENTS (OPTIONAL):
- Must be factual and helpful without adding new info.
- Must NOT repeat the exact same closing sentence in both sections when both sections exist.
- Allowed closings (choose one per section):
  - Lodging: "Availability and pricing can change, so confirming details before booking is recommended."
  - Lodging: "Room availability can vary by date, so it helps to confirm details before you arrive."
  - Bed: "Store hours can vary, so it's worth checking hours before stopping by."
  - Bed: "Hours may vary by day, so checking opening times before visiting is recommended."
- Do NOT mention websites unless the DATA explicitly provides a website field (assume it does not).

DATA:
You will be given cleaned POIs with precomputed distance and address. Use them exactly as provided.
Use the extras fields to build the intro sentence.

${JSON.stringify(data, null, 2)}

Return JSON:`;
}

function validateHTML(
  html: string,
  lodgingCount: number,
  bedCount: number
): { valid: boolean; reason?: string } {
  if (!html || typeof html !== 'string') {
    return { valid: false, reason: 'HTML is empty or not a string' };
  }
  
  // Must have h3 and ul
  const hasH3 = html.includes('<h3>');
  const hasUL = html.includes('<ul>');
  if (!hasH3 || !hasUL) {
    return { valid: false, reason: 'Missing <h3> or <ul> tags' };
  }

  // Check for empty <ul></ul> tags
  if (html.includes('<ul></ul>') || html.includes('<ul>\n</ul>') || html.includes('<ul> </ul>')) {
    return { valid: false, reason: 'Contains empty <ul> tag' };
  }

  // Check for sections that shouldn't exist
  const hasLodgingSection = html.includes('Hotels & Motels Nearby');
  const hasBedSection = html.includes('Bed & Mattress Stores Nearby');
  
  if (hasLodgingSection && lodgingCount === 0) {
    return { valid: false, reason: 'Lodging section present but lodgingCount is 0' };
  }
  
  if (hasBedSection && bedCount === 0) {
    return { valid: false, reason: 'Bed section present but bedCount is 0' };
  }

  // Check for placeholder tokens
  if (html.includes('~nearest') || html.includes('~farthest')) {
    return { valid: false, reason: 'Contains placeholder tokens like ~nearest or ~farthest' };
  }

  // Must NOT contain zip codes (5-digit pattern) - but allow in addresses like "12345 Street"
  // Only flag if it looks like a standalone zip code
  const zipPattern = /\b\d{5}\b(?!\s*[A-Za-z])/;
  if (zipPattern.test(html)) {
    return { valid: false, reason: 'Contains zip code pattern' };
  }

  // State abbreviation check removed - prompt explicitly forbids it and false positives were causing issues
  // The LLM is instructed not to include state abbreviations, and addresses provided don't contain them

  return { valid: true };
}

function isRateLimitError(error: any): boolean {
  const status = error?.status || error?.statusCode || error?.response?.status;
  return status === 429;
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
          max_tokens: 2000,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are an SEO content writer. You MUST return valid JSON only in this exact format: {"html":"<h3>...</h3>..."}. The HTML string must be properly escaped for JSON (escape quotes with \\"). Never invent facts. Do not include city, state, or zip codes.'
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

function extractJSON(text: string): string | null {
  // Try to find JSON object in the text
  let jsonText = text.trim();
  
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  // Try to find the JSON object - look for {"html": pattern
  const htmlPattern = /"html"\s*:\s*"/;
  const htmlMatch = jsonText.search(htmlPattern);
  
  if (htmlMatch >= 0) {
    // Find the start of the JSON object
    let startIdx = jsonText.lastIndexOf('{', htmlMatch);
    if (startIdx < 0) startIdx = 0;
    
    // Try to extract from start to end
    let extracted = jsonText.substring(startIdx);
    
    // Try to find the matching closing brace
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < extracted.length; i++) {
      const char = extracted[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') depth++;
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return extracted.substring(0, i + 1);
          }
        }
      }
    }
  }
  
  // Fallback: try simple regex match
  const match = jsonText.match(/\{[\s\S]*"html"[\s\S]*\}/);
  if (match) {
    return match[0];
  }
  
  return null;
}

async function generateDescription(
  lodgingPoisClean: CleanPoiItem[],
  bedStorePoisClean: CleanPoiItem[],
  sectionsToRender: string[],
  extras: {
    lodgingCount: number;
    lodgingNearestDistance: string;
    lodgingFarthestDistance: string;
    bedCount: number;
    bedNearestDistance: string;
    bedFarthestDistance: string;
    commonStreets: {
      bed: string | null;
      lodging: string | null;
    };
  },
  model: string = DEFAULT_MODEL
): Promise<{ html: string; tokens?: TokenUsage }> {
  const prompt = buildPrompt(lodgingPoisClean, bedStorePoisClean, sectionsToRender, extras);
  
  let lastError: any = null;
  let tokens: TokenUsage | undefined;
  
  // Try up to 3 times
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { text, tokens: newTokens } = await generateWithGroq(prompt, model);
      tokens = newTokens || tokens;
      
      // Extract JSON
      const jsonText = extractJSON(text);
      if (!jsonText) {
        throw new Error('Could not extract JSON from response');
      }
      
      let parsed: LLMResponse;
      try {
        parsed = JSON.parse(jsonText);
      } catch (parseError: any) {
        // Try to extract HTML directly from the text as a fallback
        const htmlMatch = text.match(/<h3>[\s\S]*/);
        if (htmlMatch) {
          // Extract HTML content and reconstruct JSON
          let htmlContent = htmlMatch[0].trim();
          // Remove any trailing markdown or text after HTML
          const htmlEnd = htmlContent.lastIndexOf('</p>');
          if (htmlEnd >= 0) {
            htmlContent = htmlContent.substring(0, htmlEnd + 4);
          }
          
          // Escape for JSON
          const escapedHtml = htmlContent
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
          
          const reconstructedJson = `{"html":"${escapedHtml}"}`;
          try {
            parsed = JSON.parse(reconstructedJson);
          } catch (e2) {
            if (attempt < 2) {
              console.log(`  JSON parse failed (attempt ${attempt + 1}/3), retrying...`);
              await delay(1000 * (attempt + 1));
              lastError = parseError;
              continue;
            }
            throw new Error(`JSON parse failed: ${parseError.message}. Response preview: ${text.substring(0, 200)}`);
          }
        } else {
          if (attempt < 2) {
            console.log(`  JSON parse failed (attempt ${attempt + 1}/3), retrying...`);
            await delay(1000 * (attempt + 1));
            lastError = parseError;
            continue;
          }
          throw new Error(`JSON parse failed: ${parseError.message}. Response preview: ${text.substring(0, 200)}`);
        }
      }
      
      if (!parsed.html || typeof parsed.html !== 'string') {
        throw new Error('Response missing html field or html is not a string');
      }
      
      // Normalize HTML before validation
      let normalizedHtml = normalizeHTML(parsed.html);
      
      // Validate HTML with counts
      const validation = validateHTML(
        normalizedHtml,
        extras.lodgingCount,
        extras.bedCount
      );
      if (!validation.valid) {
        const validationError = `Invalid HTML structure: ${validation.reason}`;
        if (attempt < 2) {
          console.log(`  ${validationError}, retrying with fix instruction...`);
          // Retry with fix prompt
          const fixPrompt = `${prompt}\n\nCRITICAL: The previous output had errors. Fix: ${validation.reason}. Return ONLY valid JSON with corrected HTML.`;
          const fixResult = await generateWithGroq(fixPrompt, model);
          tokens = fixResult.tokens || tokens;
          const fixJsonText = extractJSON(fixResult.text);
          if (fixJsonText) {
            try {
              const fixParsed = JSON.parse(fixJsonText);
              if (fixParsed.html) {
                normalizedHtml = normalizeHTML(fixParsed.html);
                const fixValidation = validateHTML(
                  normalizedHtml,
                  extras.lodgingCount,
                  extras.bedCount
                );
                if (fixValidation.valid) {
                  return { html: normalizedHtml, tokens };
                }
              }
            } catch (e) {
              // Fall through to retry
            }
          }
          await delay(1000 * (attempt + 1));
          lastError = new Error(validationError);
          continue;
        }
        throw new Error(validationError);
      }
      
      return { html: normalizedHtml, tokens };
    } catch (error: any) {
      lastError = error;
      if (attempt < 2) {
        console.log(`  Generation failed (attempt ${attempt + 1}/3): ${error.message}`);
        await delay(1000 * (attempt + 1));
        continue;
      }
    }
  }
  
  throw new Error(`Generation failed after 3 attempts: ${lastError?.message || 'Unknown error'}`);
}

async function processBuffet(
  buffet: BuffetRecord,
  checkpoint: Checkpoint,
  db: any,
  options: { write: boolean; resume: boolean; model: string }
): Promise<{ status: string; tokens?: TokenUsage; html?: string; lodgingCount?: number; bedCount?: number }> {
  const buffetId = buffet.id;
  
  // Skip if already in checkpoint (resume mode)
  if (options.resume && checkpoint[buffetId]) {
    const existing = checkpoint[buffetId];
    return { 
      status: existing.status,
      lodgingCount: existing.lodgingCount,
      bedCount: existing.bedCount
    };
  }
  
  // Skip if accommodationLodging already exists (DO NOT call LLM)
  if (buffet.accommodationLodging && buffet.accommodationLodging.trim().length > 0) {
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
      // Check both 'group' and 'Group' for case variations
      const group = poi.group || poi.Group;
      if (!group || group !== TARGET_GROUP) return false;
      if (poi.type === 'apartment') return false;
      return true;
    })
    .sort((a: PoiRecord, b: PoiRecord) => {
      const distA = a.distanceFt || Infinity;
      const distB = b.distanceFt || Infinity;
      return distA - distB;
    });
  
  if (filteredPOIs.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }
  
  // Classify POIs
  const { bedStorePois, lodgingPois } = classifyPOIs(filteredPOIs);
  
  // Hard gating: determine which sections to render
  const sectionsToRender: string[] = [];
  if (lodgingPois.length > 0) {
    sectionsToRender.push('lodging');
  }
  if (bedStorePois.length > 0) {
    sectionsToRender.push('bed');
  }
  
  // If both arrays are empty, skip (shouldn't happen due to earlier check, but double-check)
  if (sectionsToRender.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }
  
  // Prepare clean data
  const lodgingPoisClean = prepareCleanPois(lodgingPois);
  const bedStorePoisClean = prepareCleanPois(bedStorePois);
  
  // Calculate extras
  const lodgingNearestDistance = lodgingPoisClean.length > 0 
    ? lodgingPoisClean[0].displayDistance 
    : '';
  const lodgingFarthestDistance = lodgingPoisClean.length > 0 
    ? lodgingPoisClean[lodgingPoisClean.length - 1].displayDistance 
    : '';
  const bedNearestDistance = bedStorePoisClean.length > 0 
    ? bedStorePoisClean[0].displayDistance 
    : '';
  const bedFarthestDistance = bedStorePoisClean.length > 0 
    ? bedStorePoisClean[bedStorePoisClean.length - 1].displayDistance 
    : '';
  
  // Calculate common streets (only if we have 2+ items and real street names)
  const bedCommonStreet = bedStorePoisClean.length >= 2 
    ? findCommonStreet(bedStorePoisClean) 
    : null;
  const lodgingCommonStreet = lodgingPoisClean.length >= 2 
    ? findCommonStreet(lodgingPoisClean) 
    : null;
  
  const extras = {
    lodgingCount: lodgingPois.length,
    lodgingNearestDistance,
    lodgingFarthestDistance,
    bedCount: bedStorePois.length,
    bedNearestDistance,
    bedFarthestDistance,
    commonStreets: {
      bed: bedCommonStreet,
      lodging: lodgingCommonStreet
    }
  };
  
  // Generate description
  try {
    const { html, tokens } = await generateDescription(
      lodgingPoisClean,
      bedStorePoisClean,
      sectionsToRender,
      extras,
      options.model
    );
    
    // Write to database if --write flag is set
    if (options.write) {
      await db.transact([db.tx.buffets[buffetId].update({ accommodationLodging: html })]);
    }
    
    checkpoint[buffetId] = {
      status: 'generated',
      timestamp: Date.now(),
      lodgingCount: lodgingPois.length,
      bedCount: bedStorePois.length
    };
    
    return { 
      status: 'generated', 
      html, 
      tokens,
      lodgingCount: lodgingPois.length,
      bedCount: bedStorePois.length
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
    lodgingCount?: number;
    bedCount?: number;
  }
) {
  const buffetId = buffet.id;
  
  console.log('='.repeat(80));
  console.log(`BUFFET: ${buffetId}`);
  
  if (result.status === 'generated') {
    console.log(`STATUS: GENERATED`);
    console.log(`LODGING POIs: ${result.lodgingCount || 0} | BED STORE POIs: ${result.bedCount || 0}`);
    
    if (result.tokens) {
      console.log(`TOKENS: prompt=${result.tokens.promptTokens} | completion=${result.tokens.completionTokens} | total=${result.tokens.totalTokens}`);
    }
    
    console.log('-'.repeat(80));
    if (result.html) {
      console.log(result.html);
    }
  } else if (result.status === 'skipped_existing') {
    console.log(`STATUS: SKIPPED_EXISTING (accomodationLodging already present)`);
  } else if (result.status === 'skipped_no_pois') {
    console.log(`STATUS: SKIPPED_NO_POIS`);
  }
  
  console.log('='.repeat(80));
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getFlagValue = (flag: string, defaultValue: string | number) => {
    const index = argv.indexOf(flag);
    if (index >= 0 && argv[index + 1]) {
      const value = argv[index + 1];
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
  const write = hasFlag('--write');
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
  console.log('SEO Accommodation & Lodging Description Generator');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Model: ${model}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit}`);
  console.log(`Write mode: ${write ? 'ENABLED' : 'DISABLED (dry run)'}`);
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
  
  while (processed < limit) {
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
      // Skip if already in checkpoint (resume mode)
      if (resume && checkpoint[buffet.id]) {
        continue;
      }
      
      // Skip if already has accommodationLodging
      if (buffet.accommodationLodging && buffet.accommodationLodging.trim().length > 0) {
        skippedInBatch.existing++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_existing',
          timestamp: Date.now()
        };
        skippedExisting++;
        printBuffetOutput(buffet, { status: 'skipped_existing' });
        continue;
      }
      
      // Check for POIs
      const pois = buffet.poiRecords || [];
      const hasPOIs = pois.some((p: PoiRecord) => {
        const group = p.group || p.Group;
        return group === TARGET_GROUP && p.type !== 'apartment';
      });
      
      if (!hasPOIs) {
        skippedInBatch.noPois++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_no_pois',
          timestamp: Date.now()
        };
        skippedNoPois++;
        printBuffetOutput(buffet, { status: 'skipped_no_pois' });
        continue;
      }
      
      // This buffet needs processing
      if (toProcess.length < limit - processed) {
        toProcess.push(buffet);
      }
    }
    
    // Process with concurrency
    await Promise.all(
      toProcess.map(buffet =>
        limiter(async () => {
          if (processed >= limit) return;
          
          try {
            const result = await processBuffet(buffet, checkpoint, db, { write, resume, model });
            
            if (result.status === 'generated') {
              generated++;
              if (result.tokens) {
                totalTokens.promptTokens += result.tokens.promptTokens;
                totalTokens.completionTokens += result.tokens.completionTokens;
                totalTokens.totalTokens += result.tokens.totalTokens;
              }
              printBuffetOutput(buffet, result);
            }
            // Note: skipped_existing and skipped_no_pois are already handled in filtering phase
            
            processed++;
            
            // Save checkpoint periodically
            if (processed % 10 === 0) {
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
          }
        })
      )
    );
    
    if (buffets.length < batchSize) break;
    offset += batchSize;
    
    if (processed >= limit) break;
  }
  
  // Final checkpoint save
  saveCheckpoint(checkpoint);
  
  const durationMin = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Buffets scanned: ${scanned}`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Skipped (no POIs): ${skippedNoPois}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${durationMin} minutes`);
  console.log(`Total Tokens: ${totalTokens.totalTokens} (${totalTokens.promptTokens} in / ${totalTokens.completionTokens} out)`);
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
