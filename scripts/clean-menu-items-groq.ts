/**
 * Clean Menu Items with Groq LLM
 * 
 * Uses Groq LLM to clean and improve menu data quality:
 * - Fix prices (add missing decimals: $850 → $8.50)
 * - Separate concatenated items
 * - Remove non-menu content
 * - Improve category names
 * 
 * Usage:
 *   npx tsx scripts/clean-menu-items-groq.ts
 *   npx tsx scripts/clean-menu-items-groq.ts --limit 20
 *   npx tsx scripts/clean-menu-items-groq.ts --buffetId <id> --write
 *   npx tsx scripts/clean-menu-items-groq.ts --dryrun
 *   npx tsx scripts/clean-menu-items-groq.ts --model llama-3.3-70b-versatile
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { getRateLimitManager } from './lib/rateLimitManager';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Cost-efficient model
const DEFAULT_LIMIT = 20;
const DEFAULT_CONCURRENCY = 2;
const REQUEST_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const MAX_ITEMS_TO_SEND = 100; // Limit items sent to LLM to manage context

// Schema for cleaned menu item
const CleanedItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.string().optional().nullable(),
  priceNumber: z.number().optional().nullable(),
  categoryName: z.string().min(1),
});

const CleanedMenuSchema = z.object({
  categories: z.array(z.object({
    name: z.string(),
    items: z.array(z.object({
      name: z.string(),
      description: z.string().optional().nullable(),
      price: z.string().optional().nullable(),
      priceNumber: z.number().optional().nullable(),
    })),
  })),
});

type CleanedMenu = z.infer<typeof CleanedMenuSchema>;

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price?: string | null;
  priceNumber?: number | null;
  categoryName?: string;
  itemOrder?: number;
}

interface Menu {
  id: string;
  placeId: string;
  sourceUrl?: string;
  contentType?: string;
  menuItems?: MenuItem[];
}

interface Buffet {
  id: string;
  name: string;
  placeId?: string;
  cityName?: string;
  state?: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Initialize admin client
function getAdminDb() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
  
  return init({
    appId,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });
}

/**
 * Build prompt for Groq to clean menu data
 */
function buildCleaningPrompt(buffetName: string, menuItems: MenuItem[]): string {
  // Format items compactly
  const itemsCompact = menuItems.map(item => {
    const parts = [item.name];
    if (item.description) parts.push(`desc: ${item.description}`);
    if (item.price) parts.push(`price: ${item.price}`);
    if (item.priceNumber !== null && item.priceNumber !== undefined) parts.push(`num: ${item.priceNumber}`);
    if (item.categoryName) parts.push(`cat: ${item.categoryName}`);
    return parts.join(' | ');
  }).join('\n');

  return `Clean and structure this restaurant menu data for "${buffetName}".

CLEANING RULES:
1. Fix prices: If price looks too high (like $850, $1495), it's missing a decimal. Fix to $8.50, $14.95
2. Remove non-food items: addresses, phone numbers, navigation text, "keyboard shortcuts", "map data", URLs
3. Remove garbled/OCR errors: items with only symbols, random letters, or incomprehensible text like "Qt", "Sc Se Egg Fle"
4. Separate concatenated items: "Crab Rangoons4. Garlic Ribs$9.49" → two separate items
5. Assign proper categories: Group items into categories like "Appetizers", "Soups", "Entrees", "Seafood", "Chicken", "Beef & Pork", "Vegetable", "Noodles & Rice", "Desserts", "Beverages"
6. Keep item names clean and readable
7. Preserve accurate prices when they exist

OUTPUT: Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"categories":[{"name":"Category Name","items":[{"name":"Item Name","description":"optional description","price":"$X.XX","priceNumber":X.XX}]}]}

RAW MENU DATA:
${itemsCompact}

JSON:`;
}

/**
 * Extract JSON from text response
 */
function extractJsonFromText(text: string): { jsonText: string; extracted: boolean } {
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

/**
 * Repair truncated JSON
 */
function repairJson(text: string): string {
  let json = text.trim();
  
  // Remove trailing commas before } or ]
  json = json.replace(/,\s*}/g, '}');
  json = json.replace(/,\s*]/g, ']');
  
  // Count open/close brackets
  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  
  // Add missing closing brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    json += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    json += '}';
  }
  
  return json;
}

/**
 * Call Groq API to clean menu
 */
async function cleanMenuWithGroq(
  prompt: string,
  model: string
): Promise<{ cleanedMenu: CleanedMenu | null; tokens?: TokenUsage; error?: string }> {
  const rateLimitManager = getRateLimitManager();
  
  // Check if Groq is in cooldown
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
    return { cleanedMenu: null, error: 'GROQ_API_KEY not set' };
  }

  // Proactive throttling
  const estimatedTokens = rateLimitManager.estimateTokens(prompt, 4000);
  const proactiveWaitMs = rateLimitManager.shouldWaitForGroq(estimatedTokens);
  if (proactiveWaitMs > 0) {
    await rateLimitManager.globalSleep(proactiveWaitMs, `Groq proactive throttle`);
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response | null = null;
    
    try {
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0.3, // Low temperature for more consistent output
          max_tokens: 4000,
          messages: [
            {
              role: 'system',
              content: 'You are a menu data cleaner. Output ONLY valid JSON, no explanations or markdown.'
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

      // Parse rate limit headers
      const headers = rateLimitManager.parseGroqHeaders(response.headers);
      rateLimitManager.updateGroqState(headers);

      if (response.status === 429) {
        const sleepMs = Math.min(rateLimitManager.calculateSleepMs(headers, attempt), 5000);
        rateLimitManager.record429('groq', headers, sleepMs);
        
        if (attempt < MAX_RETRIES - 1) {
          await rateLimitManager.globalSleep(sleepMs, `Groq 429 (retry ${attempt + 1}/${MAX_RETRIES})`);
          continue;
        }
        
        return { cleanedMenu: null, error: 'Groq rate limited' };
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_RETRIES - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          continue;
        }
        return { cleanedMenu: null, error: `Groq error: ${response.status}` };
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
      
      rateLimitManager.recordSuccess('groq');
      
      // Parse JSON response
      const { jsonText } = extractJsonFromText(text);
      let rawData: any;
      
      try {
        rawData = JSON.parse(jsonText);
      } catch (firstError) {
        console.warn(`  [warn] Initial JSON parse failed, attempting repair...`);
        try {
          const repairedJson = repairJson(jsonText);
          rawData = JSON.parse(repairedJson);
        } catch (repairError) {
          return { cleanedMenu: null, tokens, error: `Invalid JSON: ${firstError}` };
        }
      }

      // Validate response
      try {
        const validated = CleanedMenuSchema.parse(rawData);
        return { cleanedMenu: validated, tokens };
      } catch (validationError: any) {
        return { cleanedMenu: null, tokens, error: `Validation error: ${validationError?.message}` };
      }
      
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error?.name === 'AbortError') {
        if (attempt < MAX_RETRIES - 1) continue;
        return { cleanedMenu: null, error: 'Request timeout' };
      }
      
      throw error;
    }
  }

  return { cleanedMenu: null, error: 'Max retries exceeded' };
}

/**
 * Update menu items in database with cleaned data
 */
async function updateMenuItems(
  db: ReturnType<typeof init>,
  menuId: string,
  cleanedMenu: CleanedMenu
): Promise<{ created: number; deleted: number }> {
  // First, delete existing menu items
  const existingResult = await db.query({
    menus: {
      $: { where: { id: menuId } },
      menuItems: {},
    },
  });
  
  const existingItems = existingResult.menus?.[0]?.menuItems || [];
  
  if (existingItems.length > 0) {
    const deleteOps = existingItems.map((item: any) =>
      db.tx.menuItems[item.id].delete()
    );
    await db.transact(deleteOps);
  }
  
  // Create new menu items from cleaned data
  const createOps: any[] = [];
  let order = 0;
  
  for (const category of cleanedMenu.categories) {
    for (const item of category.items) {
      const itemId = db.id();
      createOps.push(
        db.tx.menuItems[itemId]
          .update({
            categoryName: category.name,
            name: item.name,
            description: item.description || null,
            price: item.price || null,
            priceNumber: item.priceNumber || null,
            itemOrder: order++,
          })
          .link({ menu: menuId })
      );
    }
  }
  
  // Batch create in groups of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < createOps.length; i += BATCH_SIZE) {
    const batch = createOps.slice(i, i + BATCH_SIZE);
    await db.transact(batch);
  }
  
  return { created: createOps.length, deleted: existingItems.length };
}

/**
 * Print cleaned menu preview
 */
function printCleanedMenuPreview(buffetName: string, cleanedMenu: CleanedMenu): void {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`CLEANED MENU: ${buffetName}`);
  console.log(`${'─'.repeat(60)}`);
  
  for (const category of cleanedMenu.categories) {
    console.log(`\n[${category.name}] (${category.items.length} items)`);
    for (const item of category.items.slice(0, 5)) {
      const price = item.price ? ` - ${item.price}` : '';
      console.log(`  • ${item.name}${price}`);
    }
    if (category.items.length > 5) {
      console.log(`  ... and ${category.items.length - 5} more items`);
    }
  }
  
  console.log(`${'─'.repeat(60)}\n`);
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
  const write = hasFlag('--write');
  const dryrun = hasFlag('--dryrun');
  const buffetId = getFlagValue('--buffetId', '') as string;
  const model = getFlagValue('--model', DEFAULT_MODEL) as string;

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN.');
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error('Missing GROQ_API_KEY.');
    process.exit(1);
  }

  console.log(`Menu Cleaning with Groq LLM`);
  console.log(`Model: ${model}`);
  console.log(`Write mode: ${write ? 'ENABLED' : 'DISABLED (dry run)'}`);
  console.log(`Limit: ${limit} menus\n`);

  const db = getAdminDb();

  // Query menus with menuItems
  let menus: Menu[] = [];
  
  if (buffetId) {
    // Get specific buffet's menu
    const buffetResult = await db.query({
      buffets: {
        $: { where: { id: buffetId } },
      },
    });
    
    const buffet = buffetResult.buffets?.[0] as Buffet | undefined;
    if (!buffet || !buffet.placeId) {
      console.error(`Buffet not found or has no placeId: ${buffetId}`);
      process.exit(1);
    }
    
    const menuResult = await db.query({
      menus: {
        $: { where: { placeId: buffet.placeId } },
        menuItems: {},
      },
    });
    
    menus = (menuResult.menus || []) as Menu[];
  } else {
    // Get all menus with menuItems
    const result = await db.query({
      menus: {
        $: { limit: limit * 2 },
        menuItems: {},
      },
    });
    
    menus = (result.menus || []).filter((m: any) => m.menuItems && m.menuItems.length > 0) as Menu[];
  }

  console.log(`Found ${menus.length} menus with menuItems\n`);

  if (menus.length === 0) {
    console.log('No menus to process.');
    process.exit(0);
  }

  // Get buffet names - fetch all buffets to ensure we can match
  const placeIds = [...new Set(menus.map(m => m.placeId))];
  console.log(`Looking up buffets for ${placeIds.length} unique placeIds...`);
  
  // Fetch buffets in batches to get all that might match
  const buffetsByPlaceId = new Map<string, Buffet>();
  let offset = 0;
  const BATCH_SIZE = 500;
  
  while (true) {
    const buffetResult = await db.query({
      buffets: {
        $: { limit: BATCH_SIZE, offset },
      },
    });
    
    const batch = (buffetResult.buffets || []) as Buffet[];
    if (batch.length === 0) break;
    
    for (const buffet of batch) {
      if (buffet.placeId && placeIds.includes(buffet.placeId)) {
        buffetsByPlaceId.set(buffet.placeId, buffet);
      }
    }
    
    // If we've found all the buffets we need, stop
    if (buffetsByPlaceId.size === placeIds.length) break;
    
    offset += BATCH_SIZE;
    
    // Safety limit
    if (offset > 5000) break;
  }
  
  console.log(`Found ${buffetsByPlaceId.size} matching buffets\n`);

  // Process menus
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  let totalItemsCleaned = 0;
  let totalTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const startTime = Date.now();

  for (const menu of menus) {
    if (processed >= limit) break;

    const buffet = buffetsByPlaceId.get(menu.placeId);
    if (!buffet) {
      console.log(`Skipping menu ${menu.id} - no matching buffet`);
      continue;
    }

    const menuItems = (menu.menuItems || []).slice(0, MAX_ITEMS_TO_SEND);
    
    console.log(`\n[${processed + 1}/${limit}] Processing: ${buffet.name}`);
    console.log(`  Items: ${menuItems.length}`);

    try {
      // Build prompt and call Groq
      const prompt = buildCleaningPrompt(buffet.name, menuItems);
      const { cleanedMenu, tokens, error } = await cleanMenuWithGroq(prompt, model);

      if (tokens) {
        totalTokens.promptTokens += tokens.promptTokens;
        totalTokens.completionTokens += tokens.completionTokens;
        totalTokens.totalTokens += tokens.totalTokens;
        console.log(`  Tokens: ${tokens.totalTokens} (${tokens.promptTokens} in / ${tokens.completionTokens} out)`);
      }

      if (error) {
        console.error(`  ❌ Error: ${error}`);
        failedCount++;
        processed++;
        continue;
      }

      if (!cleanedMenu || cleanedMenu.categories.length === 0) {
        console.log(`  ⚠️ No cleaned data returned`);
        failedCount++;
        processed++;
        continue;
      }

      // Count cleaned items
      const cleanedItemCount = cleanedMenu.categories.reduce(
        (sum, cat) => sum + cat.items.length, 0
      );
      
      console.log(`  ✓ Cleaned: ${cleanedItemCount} items in ${cleanedMenu.categories.length} categories`);
      
      // Print preview
      if (dryrun || !write) {
        printCleanedMenuPreview(buffet.name, cleanedMenu);
      }

      // Write to database if enabled
      if (write && !dryrun) {
        const { created, deleted } = await updateMenuItems(db, menu.id, cleanedMenu);
        console.log(`  📝 Database updated: ${deleted} deleted, ${created} created`);
        totalItemsCleaned += created;
      } else {
        console.log(`  [DRY RUN] Would update ${cleanedItemCount} items`);
        totalItemsCleaned += cleanedItemCount;
      }

      successCount++;
    } catch (error: any) {
      console.error(`  ❌ Error: ${error?.message || error}`);
      failedCount++;
    }

    processed++;
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  const durationMin = (Date.now() - startTime) / 1000 / 60;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Items cleaned: ${totalItemsCleaned}`);
  console.log(`Duration: ${durationMin.toFixed(1)} minutes`);
  console.log(`Total Tokens: ${totalTokens.totalTokens} (${totalTokens.promptTokens} in / ${totalTokens.completionTokens} out)`);
  console.log(`Write mode: ${write ? 'ENABLED' : 'DISABLED'}`);
  console.log(`${'='.repeat(60)}\n`);

  getRateLimitManager().maybePrintStats();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
