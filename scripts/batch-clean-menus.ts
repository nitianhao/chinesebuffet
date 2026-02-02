/**
 * Batch Clean Menus
 * 
 * Re-parses menus from raw text for all buffets that need it.
 * Prioritizes menus with garbled data (long concatenated names, wrong categories).
 * Uses a checkpoint file to skip already-processed menus on resume.
 * 
 * Usage:
 *   npx tsx scripts/batch-clean-menus.ts --limit 10 --write
 *   npx tsx scripts/batch-clean-menus.ts --limit 600 --write  (process all)
 *   npx tsx scripts/batch-clean-menus.ts --limit 10  (dry run)
 */

import { init, id } from '@instantdb/admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const CHECKPOINT_FILE = path.join(process.cwd(), '.menu-clean-checkpoint.json');

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

// Re-use parsing logic from reparse-menu-from-raw
const MODEL = 'llama-3.3-70b-versatile';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120000;
const DELAY_BETWEEN_MENUS_MS = 4000; // Rate limit friendly
const DB_RETRY_DELAY_MS = 15000; // Wait 15s on InstantDB timeout before retry

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

function buildParsingPrompt(restaurantName: string, rawText: string): string {
  const text = rawText.length > 8000 ? rawText.substring(0, 8000) : rawText;
  return `Parse this Chinese restaurant menu text into structured JSON for "${restaurantName}".

PARSING RULES:
1. Extract individual menu items - each item has: number (like "A1.", "1.", etc.), name, and price(s)
2. Items often appear TWICE in the text (name repeated) - only include once
3. Some items have size/variant options: "S $9.95 L $17.95" or "Pt. $3.95 Qt. $7.95" - include as variants (Pt=Pint, Qt=Quart)
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

function extractJson(text: string): string {
  const trimmed = text.trim().replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const startIdx = trimmed.indexOf('{');
  if (startIdx === -1) return trimmed;
  let braceCount = 0;
  for (let i = startIdx; i < trimmed.length; i++) {
    if (trimmed[i] === '{') braceCount++;
    else if (trimmed[i] === '}') {
      braceCount--;
      if (braceCount === 0) return trimmed.substring(startIdx, i + 1);
    }
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : trimmed;
}

function repairJson(text: string): string {
  let json = text.trim();
  const lastBrace = json.lastIndexOf('}');
  if (lastBrace > 0) json = json.substring(0, lastBrace + 1);
  json = json.replace(/,(\s*[}\]])/g, '$1');
  json = json.replace(/\}(\s*)\{/g, '},$1{');
  json = json.replace(/\](\s*)\[/g, '],$1[');
  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) json += ']';
  for (let i = 0; i < openBraces - closeBraces; i++) json += '}';
  return json;
}

async function parseMenuWithGroq(prompt: string): Promise<{ menu: ParsedMenu | null; error?: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { menu: null, error: 'GROQ_API_KEY not set' };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.2,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: 'You are a menu parser. Output ONLY valid JSON, no markdown or explanation.' },
            { role: 'user', content: prompt }
          ]
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
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
      let jsonText = extractJson(text);
      let parsed: any;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        try {
          parsed = JSON.parse(repairJson(jsonText));
        } catch (e2) {
          return { menu: null, error: `JSON parse error: ${e}` };
        }
      }
      try {
        return { menu: ParsedMenuSchema.parse(parsed) };
      } catch (validationError: any) {
        return { menu: null, error: `Validation: ${validationError?.message}` };
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error?.name === 'AbortError' && attempt < MAX_RETRIES - 1) continue;
      throw error;
    }
  }
  return { menu: null, error: 'Max retries exceeded' };
}

async function updateMenuItems(db: ReturnType<typeof getAdminDb>, menuId: string, parsedMenu: ParsedMenu): Promise<{ created: number; deleted: number }> {
  
  const existingResult = await db.query({
    menus: { $: { where: { id: menuId } }, menuItems: {} },
  });
  const existingItems = (existingResult.menus?.[0] as any)?.menuItems || [];

  if (existingItems.length > 0) {
    const deleteOps = existingItems.map((item: any) => db.tx.menuItems[item.id].delete());
    for (let i = 0; i < deleteOps.length; i += 100) {
      await db.transact(deleteOps.slice(i, i + 100));
    }
  }

  const createOps: any[] = [];
  let order = 0;
  for (const category of parsedMenu.categories) {
    for (const item of category.items) {
      const itemId = id();
      let description = item.description || null;
      if (item.variants && item.variants.length > 0) {
        const variantStr = item.variants.map(v => `${v.name}: ${v.price}`).join(' | ');
        description = description ? `${description}\n${variantStr}` : variantStr;
      }
      createOps.push(
        db.tx.menuItems[itemId]
          .update({
            categoryName: category.name,
            name: item.name,
            description,
            price: item.price || null,
            priceNumber: item.priceNumber || null,
            itemOrder: order++,
          })
          .link({ menu: menuId })
      );
    }
  }

  // Use smaller batches to avoid InstantDB timeout
  const TX_BATCH_SIZE = 50;
  for (let i = 0; i < createOps.length; i += TX_BATCH_SIZE) {
    await db.transact(createOps.slice(i, i + TX_BATCH_SIZE));
  }
  return { created: createOps.length, deleted: existingItems.length };
}

function isGarbled(menu: any): boolean {
  const items = menu.menuItems || [];
  return items.some((i: any) =>
    (i.name && i.name.length > 60) ||
    (i.categoryName && (i.categoryName.includes('$') || i.categoryName.length > 50))
  );
}

function needsCleaning(menu: any): boolean {
  const items = menu.menuItems || [];
  // Needs cleaning if: no items yet, OR has garbled items
  if (items.length === 0) return true;
  return isGarbled(menu);
}

function loadCheckpoint(): Set<string> {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      return new Set(data.placeIds || []);
    }
  } catch (e) {
    console.warn('Could not load checkpoint, starting fresh');
  }
  return new Set();
}

function saveCheckpoint(placeIds: Set<string>): void {
  try {
    fs.writeFileSync(
      CHECKPOINT_FILE,
      JSON.stringify({ placeIds: [...placeIds], updatedAt: new Date().toISOString() }, null, 2)
    );
  } catch (e) {
    console.warn('Could not save checkpoint:', e);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag);
  const getFlagValue = (flag: string, def: number) => {
    const index = argv.indexOf(flag);
    if (index >= 0 && argv[index + 1]) {
      const n = Number(argv[index + 1]);
      if (!Number.isNaN(n)) return n;
    }
    return def;
  };

  const limit = getFlagValue('--limit', 20);
  const write = hasFlag('--write');

  if (!process.env.GROQ_API_KEY) {
    console.error('GROQ_API_KEY is required');
    process.exit(1);
  }

  const processedPlaceIds = loadCheckpoint();
  console.log('Batch Menu Cleaning');
  console.log(`Limit: ${limit} menus`);
  console.log(`Already processed (skipping): ${processedPlaceIds.size} menus`);
  console.log(`Write: ${write ? 'ENABLED' : 'DRY RUN'}\n`);

  const db = getAdminDb();

  // Fetch menus in batches - prioritize garbled
  let processed = 0;
  let successCount = 0;
  let failCount = 0;
  let skippedCount = 0;
  let fetchOffset = 0;
  const BATCH_SIZE = 50;

  while (processed < limit) {
    const result = await db.query({
      menus: {
        $: { limit: BATCH_SIZE, offset: fetchOffset },
        menuItems: {}
      }
    });

    const menus = (result.menus || []) as any[];
    if (menus.length === 0) break;

    // Filter: must have rawText AND need cleaning (no items or garbled items)
    const candidates = menus
      .filter(m => m.rawText && m.rawText.length > 500 && needsCleaning(m))
      .sort((a, b) => (isGarbled(b) ? 1 : 0) - (isGarbled(a) ? 1 : 0));

    for (const menu of candidates) {
      // Skip already-processed menus (from checkpoint)
      if (processedPlaceIds.has(menu.placeId)) {
        skippedCount++;
        continue;
      }
      if (processed >= limit) break;

      // Get buffet name
      const buffetResult = await db.query({
        buffets: { $: { where: { placeId: menu.placeId } } }
      });
      const buffet = (buffetResult.buffets as any)?.[0];
      const restaurantName = buffet?.name || 'Restaurant';

      console.log(`\n[${processed + 1}/${limit}] ${restaurantName}`);
      const itemCount = menu.menuItems?.length || 0;
      const reason = itemCount === 0 ? 'no items' : 'garbled data';
      console.log(`  Items before: ${itemCount}, Reason: ${reason}`);

      const prompt = buildParsingPrompt(restaurantName, menu.rawText);
      const { menu: parsedMenu, error } = await parseMenuWithGroq(prompt);

      if (error) {
        console.log(`  ❌ ${error}`);
        failCount++;
        processed++;
        continue;
      }

      if (!parsedMenu || parsedMenu.categories.length === 0) {
        console.log(`  ⚠️ No categories parsed`);
        failCount++;
        processed++;
        continue;
      }

      const parsedItemCount = parsedMenu.categories.reduce((s, c) => s + c.items.length, 0);
      console.log(`  ✓ Parsed: ${parsedMenu.categories.length} categories, ${parsedItemCount} items`);

      if (write) {
        let dbSuccess = false;
        for (let attempt = 0; attempt < 3 && !dbSuccess; attempt++) {
          try {
            const { created, deleted } = await updateMenuItems(db, menu.id, parsedMenu);
            console.log(`  📝 DB: ${deleted} deleted, ${created} created`);
            processedPlaceIds.add(menu.placeId);
            saveCheckpoint(processedPlaceIds);
            dbSuccess = true;
          } catch (dbErr: any) {
            const isTimeout = dbErr?.body?.type === 'timeout' || dbErr?.status === 429;
            if (isTimeout && attempt < 2) {
              console.log(`  ⏳ DB timeout, waiting ${DB_RETRY_DELAY_MS / 1000}s before retry...`);
              await new Promise(r => setTimeout(r, DB_RETRY_DELAY_MS));
            } else {
              throw dbErr;
            }
          }
        }
      }

      successCount++;
      processed++;

      // Rate limit
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MENUS_MS));
    }

    fetchOffset += BATCH_SIZE;
    if (menus.length < BATCH_SIZE) break;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Done: ${successCount} success, ${failCount} failed, ${skippedCount} skipped (already processed)`);
  console.log(`Checkpoint: ${processedPlaceIds.size} total processed`);
  console.log(`Write: ${write ? 'ENABLED' : 'DRY RUN'}`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
