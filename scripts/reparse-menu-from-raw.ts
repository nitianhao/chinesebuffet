/**
 * Re-parse Menu from Raw Text
 * 
 * This script takes the raw scraped menu text and re-parses it 
 * into properly structured menu items using Groq LLM.
 * 
 * Usage:
 *   npx tsx scripts/reparse-menu-from-raw.ts --placeId <placeId>
 *   npx tsx scripts/reparse-menu-from-raw.ts --placeId <placeId> --write
 */

import { init, id } from '@instantdb/admin';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const MODEL = 'llama-3.3-70b-versatile'; // Use more capable model for complex parsing
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120000; // 2 minutes for large menus

// Schema for parsed menu
const ParsedMenuSchema = z.object({
  categories: z.array(z.object({
    name: z.string(),
    items: z.array(z.object({
      name: z.string(),
      description: z.string().optional().nullable(),
      price: z.string().optional().nullable(),
      priceNumber: z.number().optional().nullable(),
      variants: z.array(z.object({
        name: z.string(),
        price: z.string(),
        priceNumber: z.number().optional().nullable(),
      })).optional().nullable(),
    })),
  })),
});

type ParsedMenu = z.infer<typeof ParsedMenuSchema>;

function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  return init({
    appId: '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });
}

/**
 * Build prompt for parsing raw menu text
 */
function buildParsingPrompt(restaurantName: string, rawText: string): string {
  // Truncate if too long
  const text = rawText.length > 8000 ? rawText.substring(0, 8000) : rawText;
  
  return `Parse this Chinese restaurant menu text into structured JSON for "${restaurantName}".

PARSING RULES:
1. Extract individual menu items - each item has: number (like "A1.", "1.", etc.), name, and price(s)
2. Items often appear TWICE in the text (name repeated) - only include once
3. Some items have size/variant options: "S $9.95 L $17.95" or "Pt. $3.95 Qt. $7.95" - include as variants
4. Some items have add-on prices like "w. Pork Fried Rice $11.95" - include as variants
5. Group items into logical categories: "Appetizers", "Soups", "Fried Rice", "Lo Mein", "Chicken", "Beef", "Pork", "Seafood", "Vegetables", "Chef's Specialties", "Combination Plates", etc.
6. REMOVE navigation text, search prompts, notes about extra charges
7. Clean item names - remove item numbers from the name itself
8. Extract the BASE price for each item (lowest price without add-ons)

PRICE FORMAT:
- Always format as "$X.XX" (with dollar sign and 2 decimals)
- priceNumber should be the numeric value (8.50, not "$8.50")

OUTPUT: Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"categories":[{"name":"Category","items":[{"name":"Item Name","description":"optional","price":"$X.XX","priceNumber":X.XX,"variants":[{"name":"w. Fried Rice","price":"$X.XX","priceNumber":X.XX}]}]}]}

RAW MENU TEXT:
${text}

JSON:`;
}

/**
 * Extract JSON from response text
 */
function extractJson(text: string): string {
  const trimmed = text.trim();
  
  // Remove markdown code blocks if present
  let cleaned = trimmed.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  
  // Find the JSON object - be more careful about matching
  const startIdx = cleaned.indexOf('{');
  if (startIdx === -1) return cleaned;
  
  // Find the matching closing brace
  let braceCount = 0;
  let endIdx = -1;
  
  for (let i = startIdx; i < cleaned.length; i++) {
    if (cleaned[i] === '{') braceCount++;
    else if (cleaned[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        endIdx = i;
        break;
      }
    }
  }
  
  if (endIdx > startIdx) {
    return cleaned.substring(startIdx, endIdx + 1);
  }
  
  // Fallback: simple regex match
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    return match[0];
  }
  
  return cleaned;
}

/**
 * Repair common JSON issues
 */
function repairJson(text: string): string {
  let json = text.trim();
  
  // Remove any trailing content after the main JSON object
  const lastBrace = json.lastIndexOf('}');
  if (lastBrace > 0) {
    json = json.substring(0, lastBrace + 1);
  }
  
  // Remove trailing commas before } or ]
  json = json.replace(/,(\s*[}\]])/g, '$1');
  
  // Fix missing commas between array elements (common LLM issue)
  json = json.replace(/\}(\s*)\{/g, '},$1{');
  json = json.replace(/\](\s*)\[/g, '],$1[');
  
  // Balance brackets
  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  
  for (let i = 0; i < openBrackets - closeBrackets; i++) json += ']';
  for (let i = 0; i < openBraces - closeBraces; i++) json += '}';
  
  return json;
}

/**
 * Call Groq to parse menu
 */
async function parseMenuWithGroq(prompt: string): Promise<{ menu: ParsedMenu | null; error?: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { menu: null, error: 'GROQ_API_KEY not set' };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      console.log(`  Calling Groq (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 8000,
          messages: [
            {
              role: 'system',
              content: 'You are a menu parser. Output ONLY valid JSON, no markdown or explanation. Parse restaurant menus into structured categories and items.'
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
        console.log('  Rate limited, waiting 5s...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return { menu: null, error: `Groq error: ${response.status}` };
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content || '';
      
      const tokens = data?.usage?.total_tokens || 0;
      console.log(`  Tokens used: ${tokens}`);

      // Parse JSON
      let jsonText = extractJson(text);
      let parsed: any;
      
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.log('  Initial parse failed, attempting repair...');
        try {
          jsonText = repairJson(jsonText);
          parsed = JSON.parse(jsonText);
        } catch (e2) {
          return { menu: null, error: `JSON parse error: ${e}` };
        }
      }

      // Validate schema
      try {
        const validated = ParsedMenuSchema.parse(parsed);
        return { menu: validated };
      } catch (validationError: any) {
        return { menu: null, error: `Validation error: ${validationError?.message}` };
      }

    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error?.name === 'AbortError') {
        console.log('  Request timeout, retrying...');
        if (attempt < MAX_RETRIES - 1) continue;
        return { menu: null, error: 'Request timeout' };
      }
      
      throw error;
    }
  }

  return { menu: null, error: 'Max retries exceeded' };
}

/**
 * Update menu items in database
 */
async function updateMenuItems(
  db: ReturnType<typeof getAdminDb>,
  menuId: string,
  parsedMenu: ParsedMenu
): Promise<{ created: number; deleted: number }> {
  // Delete existing menu items
  const existingResult = await db.query({
    menus: {
      $: { where: { id: menuId } },
      menuItems: {},
    },
  });
  
  const existingItems = (existingResult.menus?.[0] as any)?.menuItems || [];
  
  if (existingItems.length > 0) {
    console.log(`  Deleting ${existingItems.length} existing items...`);
    const deleteOps = existingItems.map((item: any) =>
      db.tx.menuItems[item.id].delete()
    );
    
    // Batch delete
    const BATCH_SIZE = 100;
    for (let i = 0; i < deleteOps.length; i += BATCH_SIZE) {
      await db.transact(deleteOps.slice(i, i + BATCH_SIZE));
    }
  }
  
  // Create new items
  const createOps: any[] = [];
  let order = 0;
  
  for (const category of parsedMenu.categories) {
    for (const item of category.items) {
      const itemId = id();
      
      // Build description including variants if present
      let description = item.description || null;
      if (item.variants && item.variants.length > 0) {
        const variantStr = item.variants
          .map(v => `${v.name}: ${v.price}`)
          .join(' | ');
        description = description ? `${description}\n${variantStr}` : variantStr;
      }
      
      createOps.push(
        db.tx.menuItems[itemId]
          .update({
            categoryName: category.name,
            name: item.name,
            description: description,
            price: item.price || null,
            priceNumber: item.priceNumber || null,
            itemOrder: order++,
          })
          .link({ menu: menuId })
      );
    }
  }
  
  // Batch create
  console.log(`  Creating ${createOps.length} new items...`);
  const BATCH_SIZE = 100;
  for (let i = 0; i < createOps.length; i += BATCH_SIZE) {
    await db.transact(createOps.slice(i, i + BATCH_SIZE));
  }
  
  return { created: createOps.length, deleted: existingItems.length };
}

/**
 * Print parsed menu preview
 */
function printMenuPreview(menu: ParsedMenu): void {
  console.log('\n' + '─'.repeat(60));
  console.log('PARSED MENU PREVIEW');
  console.log('─'.repeat(60));
  
  let totalItems = 0;
  for (const category of menu.categories) {
    totalItems += category.items.length;
    console.log(`\n[${category.name}] - ${category.items.length} items`);
    
    // Show first 3 items per category
    for (const item of category.items.slice(0, 3)) {
      const price = item.price ? ` - ${item.price}` : '';
      console.log(`  • ${item.name}${price}`);
      if (item.variants && item.variants.length > 0) {
        console.log(`    Variants: ${item.variants.map(v => `${v.name} ${v.price}`).join(', ')}`);
      }
    }
    if (category.items.length > 3) {
      console.log(`  ... and ${category.items.length - 3} more`);
    }
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log(`Total: ${menu.categories.length} categories, ${totalItems} items`);
  console.log('─'.repeat(60) + '\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getFlagValue = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : '';
  };

  const placeId = getFlagValue('--placeId');
  const write = hasFlag('--write');

  if (!placeId) {
    console.error('Usage: npx tsx scripts/reparse-menu-from-raw.ts --placeId <placeId> [--write]');
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is required');
    process.exit(1);
  }

  console.log('Re-parsing Menu from Raw Text');
  console.log(`PlaceId: ${placeId}`);
  console.log(`Write mode: ${write ? 'ENABLED' : 'DISABLED (preview only)'}\n`);

  const db = getAdminDb();

  // Get buffet info
  const buffetResult = await db.query({
    buffets: {
      $: { where: { placeId } }
    }
  });
  
  const buffet = (buffetResult.buffets as any)?.[0];
  const restaurantName = buffet?.name || 'Restaurant';
  console.log(`Restaurant: ${restaurantName}`);

  // Get menu with raw text
  const menuResult = await db.query({
    menus: {
      $: { where: { placeId } },
      menuItems: {}
    }
  });

  const menu = (menuResult.menus as any)?.[0];
  if (!menu) {
    console.error('No menu found for this placeId');
    process.exit(1);
  }

  console.log(`Menu ID: ${menu.id}`);
  console.log(`Current menuItems: ${menu.menuItems?.length || 0}`);
  
  if (!menu.rawText) {
    console.error('Menu has no raw text to parse');
    process.exit(1);
  }

  console.log(`Raw text length: ${menu.rawText.length} chars\n`);

  // Build prompt and parse
  const prompt = buildParsingPrompt(restaurantName, menu.rawText);
  const { menu: parsedMenu, error } = await parseMenuWithGroq(prompt);

  if (error) {
    console.error(`Error parsing menu: ${error}`);
    process.exit(1);
  }

  if (!parsedMenu || parsedMenu.categories.length === 0) {
    console.error('No categories parsed from menu');
    process.exit(1);
  }

  // Preview
  printMenuPreview(parsedMenu);

  // Write if enabled
  if (write) {
    console.log('Writing to database...');
    const { created, deleted } = await updateMenuItems(db, menu.id, parsedMenu);
    console.log(`✓ Done: Deleted ${deleted} items, Created ${created} items`);
  } else {
    console.log('Dry run complete. Use --write to save changes.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
