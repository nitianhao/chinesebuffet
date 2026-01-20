// Full production script to generate SEO descriptions for all buffets
// Processes all buffets in the database and updates the description field

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';

// Support multiple AI providers
let aiProvider: 'gemini' | 'groq' | 'openai' | null = null;
let aiClient: any = null;

// Load environment variables from .env.local
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  let loadedCount = 0;
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();
      
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (key && value) {
        process.env[key] = value;
        loadedCount++;
      }
    }
  });
  if (loadedCount > 0) {
    console.log(`Loaded ${loadedCount} environment variables from .env.local`);
  }
}

// Load .env.local
const possiblePaths = [
  path.join(__dirname, '../../.env.local'),
  path.join(process.cwd(), '.env.local'),
  '.env.local'
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    loadEnvFile(envPath);
    break;
  }
}

// Initialize AI provider
if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    aiClient = new GoogleGenerativeAI(apiKey);
    aiProvider = 'gemini';
    console.log('✓ Using Google Gemini (free tier)');
  } catch (e) {
    // Package not installed
  }
}

if (!aiProvider && process.env.GROQ_API_KEY) {
  try {
    const Groq = require('groq-sdk');
    aiClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    aiProvider = 'groq';
    console.log('✓ Using Groq (fast & cheap)');
  } catch (e) {
    // Package not installed
  }
}

if (!aiProvider && process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai').default || require('openai');
    aiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    aiProvider = 'openai';
    console.log('✓ Using OpenAI GPT-4 Turbo');
  } catch (e) {
    // Package not installed
  }
}

if (!aiProvider || !aiClient) {
  console.error('ERROR: No AI provider configured. Please set one of:');
  console.error('  - GROQ_API_KEY (recommended - cheap & fast)');
  console.error('  - GOOGLE_API_KEY (free tier available)');
  console.error('  - OPENAI_API_KEY');
  process.exit(1);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  schema: schema.default || schema,
});

function parseJsonField(value: any): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

function extractAdditionalInfo(buffet: any): any {
  const additionalInfo = parseJsonField(buffet.additionalInfo) || {};
  
  const structuredDataList = buffet.structuredData 
    ? (Array.isArray(buffet.structuredData) ? buffet.structuredData : [buffet.structuredData])
    : [];
  
  structuredDataList.forEach((item: any) => {
    if (item.group && item.data) {
      const groupData = parseJsonField(item.data);
      if (groupData && typeof groupData === 'object') {
        additionalInfo[item.group] = Object.entries(groupData).map(([key, value]) => ({
          [key]: value
        }));
      }
    }
  });
  
  return additionalInfo;
}

function formatBuffetDataForPrompt(buffet: any): string {
  const additionalInfo = extractAdditionalInfo(buffet);
  const reviewsTags = parseJsonField(buffet.reviewsTags) || [];
  const reviewsDistribution = parseJsonField(buffet.reviewsDistribution) || {};
  const hours = parseJsonField(buffet.hours) || [];
  const categories = parseJsonField(buffet.categories) || [];
  
  let data = `BUFFET: ${buffet.name}\n`;
  data += `LOCATION: ${buffet.cityName}, ${buffet.state}\n`;
  data += `ADDRESS: ${buffet.address}\n`;
  data += `RATING: ${buffet.rating || 'N/A'} (${buffet.reviewsCount || 0} reviews)\n`;
  data += `PRICE: ${buffet.price || 'N/A'}\n`;
  data += `CATEGORIES: ${categories.join(', ')}\n`;
  
  if (hours.length > 0) {
    data += `HOURS: ${hours.map((h: any) => `${h.day}: ${h.hours}`).join(', ')}\n`;
  }
  
  if (reviewsTags.length > 0) {
    data += `POPULAR REVIEW TAGS: ${reviewsTags.map((t: any) => `${t.title} (${t.count})`).join(', ')}\n`;
  }
  
  if (Object.keys(reviewsDistribution).length > 0) {
    data += `REVIEW DISTRIBUTION: `;
    const dist = [];
    if (reviewsDistribution.fiveStar) dist.push(`5★: ${reviewsDistribution.fiveStar}`);
    if (reviewsDistribution.fourStar) dist.push(`4★: ${reviewsDistribution.fourStar}`);
    if (reviewsDistribution.threeStar) dist.push(`3★: ${reviewsDistribution.threeStar}`);
    if (reviewsDistribution.twoStar) dist.push(`2★: ${reviewsDistribution.twoStar}`);
    if (reviewsDistribution.oneStar) dist.push(`1★: ${reviewsDistribution.oneStar}`);
    data += dist.join(', ') + '\n';
  }
  
  // Additional Info sections
  if (additionalInfo['Service options']) {
    const serviceOpts = additionalInfo['Service options']
      .filter((opt: any) => Object.values(opt)[0] === true)
      .map((opt: any) => Object.keys(opt)[0])
      .join(', ');
    if (serviceOpts) data += `SERVICE OPTIONS: ${serviceOpts}\n`;
  }
  
  if (additionalInfo.Highlights) {
    const highlights = additionalInfo.Highlights
      .filter((h: any) => Object.values(h)[0] === true)
      .map((h: any) => Object.keys(h)[0])
      .join(', ');
    if (highlights) data += `HIGHLIGHTS: ${highlights}\n`;
  }
  
  if (additionalInfo.Offerings) {
    const offerings = additionalInfo.Offerings
      .filter((o: any) => Object.values(o)[0] === true)
      .map((o: any) => Object.keys(o)[0])
      .join(', ');
    if (offerings) data += `OFFERINGS: ${offerings}\n`;
  }
  
  if (additionalInfo['Dining options']) {
    const diningOpts = additionalInfo['Dining options']
      .filter((d: any) => Object.values(d)[0] === true)
      .map((d: any) => Object.keys(d)[0])
      .join(', ');
    if (diningOpts) data += `DINING OPTIONS: ${diningOpts}\n`;
  }
  
  if (additionalInfo.Amenities) {
    const amenities = additionalInfo.Amenities
      .filter((a: any) => Object.values(a)[0] === true)
      .map((a: any) => Object.keys(a)[0])
      .join(', ');
    if (amenities) data += `AMENITIES: ${amenities}\n`;
  }
  
  if (additionalInfo.Atmosphere) {
    const atmosphere = additionalInfo.Atmosphere
      .filter((a: any) => Object.values(a)[0] === true)
      .map((a: any) => Object.keys(a)[0])
      .join(', ');
    if (atmosphere) data += `ATMOSPHERE: ${atmosphere}\n`;
  }
  
  if (additionalInfo.Crowd) {
    const crowd = additionalInfo.Crowd
      .filter((c: any) => Object.values(c)[0] === true)
      .map((c: any) => Object.keys(c)[0])
      .join(', ');
    if (crowd) data += `CROWD: ${crowd}\n`;
  }
  
  if (additionalInfo.Planning) {
    const planning = additionalInfo.Planning
      .filter((p: any) => Object.values(p)[0] === true)
      .map((p: any) => Object.keys(p)[0])
      .join(', ');
    if (planning) data += `PLANNING: ${planning}\n`;
  }
  
  if (additionalInfo.Payments) {
    const payments = additionalInfo.Payments
      .filter((p: any) => Object.values(p)[0] === true)
      .map((p: any) => Object.keys(p)[0])
      .join(', ');
    if (payments) data += `PAYMENT OPTIONS: ${payments}\n`;
  }
  
  if (additionalInfo.Accessibility) {
    const accessibility = additionalInfo.Accessibility
      .filter((a: any) => Object.values(a)[0] === true)
      .map((a: any) => Object.keys(a)[0])
      .join(', ');
    if (accessibility) data += `ACCESSIBILITY: ${accessibility}\n`;
  }
  
  return data;
}

const SEO_PROMPT_TEMPLATE = `You are an SEO content writer specializing in restaurant descriptions. Generate a keyword-rich, SEO-optimized description for a buffet restaurant based on the provided data.

CRITICAL REQUIREMENTS:
- Length: 200-350 words (flexible based on available data)
- OPENING VARIATION (MANDATORY): You MUST use a DIFFERENT opening style for each description. DO NOT use "In the heart of [City]" or "In the heart of [City], lies..." - these are FORBIDDEN.

  Use one of these varied opening styles (rotate through them):
  * "Discover [Buffet Name], a premier buffet destination in [City] that..."
  * "Looking for the best buffet in [City]? [Buffet Name] offers an exceptional..."
  * "[Buffet Name] stands out as one of [City]'s top-rated buffet restaurants, featuring..."
  * "Experience authentic [cuisine type] cuisine at [Buffet Name], located in [City]..."
  * "Nestled in [City], [Buffet Name] brings you an exceptional all-you-can-eat experience with..."
  * "With a [rating] rating from [X] reviews, [Buffet Name] has become a favorite buffet in [City]..."
  * "Whether you're a local or visiting [City], [Buffet Name] is a must-visit buffet restaurant that..."
  * "Step into [Buffet Name], where [City] residents and visitors discover an incredible buffet experience..."
  * "[Buffet Name] has been serving [City] with delicious all-you-can-eat options since..."
  * "For those seeking variety and value in [City], [Buffet Name] delivers an impressive buffet featuring..."
  
  IMPORTANT: Start with the buffet name or a question, NOT with location phrases like "In the heart of" or "Located in the heart of".
- UNIQUENESS: Each description must be completely unique. Never copy phrases, sentence structures, or patterns from other descriptions. Use different vocabulary, sentence lengths, and flow patterns. Vary your paragraph structure.
- Include location-based keywords naturally (e.g., "buffet in [City]", "[City] buffet", "best buffet [City]")
- Incorporate food-related keywords: "all-you-can-eat", "buffet", "family style", "international cuisine", etc.
- MUST explicitly mention:
  * AMENITIES (if provided): Wi-Fi, TV, outdoor seating, restrooms, etc.
  * PAYMENT OPTIONS (if provided): credit cards, mobile pay, cash, etc.
  * ATMOSPHERE (if provided): casual, upscale, family-friendly, romantic, etc.
  * ACCESSIBILITY (if provided): wheelchair accessible, etc.
  * SERVICE OPTIONS (if provided): dine-in, takeout, delivery, etc.
  * HIGHLIGHTS (if provided): live music, special features, etc.
- Use review insights and ratings when available
- Write in natural, engaging language (avoid keyword stuffing)
- Structure: Varied opening hook → Main content (atmosphere/food variety/amenities) → Practical info (parking/payment/accessibility/service options) → Unique closing highlight

Format the description as flowing paragraphs, not bullet points. Make sure to naturally weave in ALL available information about amenities, payment methods, atmosphere, and accessibility. Each description must be completely original and unique.

BUFFET DATA:
{buffetData}

Generate a unique, SEO-optimized description with a varied opening:`;

function fixOpening(description: string, buffetName: string, cityName: string): string {
  let trimmed = description.trim();
  
  // Check if it starts with forbidden patterns and replace
  if (trimmed.toLowerCase().startsWith('in the heart of')) {
    const openings = [
      `${buffetName} is a premier buffet destination in ${cityName} that`,
      `Discover ${buffetName}, where ${cityName} residents and visitors`,
      `Looking for the best buffet in ${cityName}? ${buffetName} offers`,
      `With an impressive reputation, ${buffetName} has become`,
      `${buffetName} stands out as one of ${cityName}'s top-rated buffets,`,
      `Experience exceptional dining at ${buffetName}, a beloved buffet in ${cityName} that`,
      `${buffetName} brings authentic flavors to ${cityName} with`,
      `Step into ${buffetName}, a favorite buffet in ${cityName} that`,
      `${buffetName} has been delighting ${cityName} diners with`,
      `For those seeking variety and value in ${cityName}, ${buffetName} delivers`,
    ];
    const newOpening = openings[Math.floor(Math.random() * openings.length)];
    
    // Find where the first sentence ends (first period)
    const firstPeriodIndex = trimmed.indexOf('.');
    if (firstPeriodIndex > 0 && firstPeriodIndex < 200) {
      // Get the content after the opening phrase but before the period
      // Try to extract meaningful content after "lies a culinary gem" or similar
      const firstSentence = trimmed.substring(0, firstPeriodIndex);
      const match = firstSentence.match(/(?:lies|you'll find|there is|sits) (.+?)(?: -|,|$)/i);
      
      if (match && match[1]) {
        // Found content after the opening phrase
        const content = match[1].trim();
        const restOfText = trimmed.substring(firstPeriodIndex + 1).trim();
        return `${newOpening} ${content}. ${restOfText}`;
      } else {
        // Just replace the first sentence
        const restOfText = trimmed.substring(firstPeriodIndex + 1).trim();
        return `${newOpening}. ${restOfText}`;
      }
    } else {
      // No period found in reasonable distance, replace first 200 chars
      const restOfText = trimmed.substring(Math.min(200, trimmed.length));
      return `${newOpening}${restOfText}`;
    }
  }
  
  return description;
}

async function generateDescription(buffetData: string, retries = 3): Promise<string> {
  // Extract buffet name and city to personalize the prompt
  const buffetNameMatch = buffetData.match(/BUFFET: (.+)/);
  const cityMatch = buffetData.match(/LOCATION: ([^,]+),/);
  const buffetName = buffetNameMatch ? buffetNameMatch[1] : 'this buffet';
  const cityName = cityMatch ? cityMatch[1] : 'the city';
  
  // Add specific variation instruction to ensure unique openings
  const openingInstructions = [
    `Start your description with "${buffetName}" followed by what makes it special.`,
    `Begin with a question like "Looking for the best buffet experience?" then introduce ${buffetName}.`,
    `Open by highlighting ${buffetName}'s rating and reputation first.`,
    `Start with the type of cuisine ${buffetName} offers.`,
    `Begin by describing what makes ${buffetName} unique.`,
    `Open with ${buffetName}'s atmosphere and ambiance.`,
    `Start with the value proposition of ${buffetName}.`,
  ];
  
  const randomInstruction = openingInstructions[Math.floor(Math.random() * openingInstructions.length)];
  
  const enhancedPrompt = `CRITICAL: DO NOT start with "In the heart of [City]" or "In the heart of [City], lies". These are FORBIDDEN phrases.\n\n` +
    SEO_PROMPT_TEMPLATE.replace('{buffetData}', buffetData) + 
    `\n\nSPECIFIC INSTRUCTION: ${randomInstruction}\n` +
    `You MUST start with one of these patterns:\n` +
    `- "${buffetName} is..."\n` +
    `- "Discover ${buffetName}..."\n` +
    `- "Looking for...? ${buffetName}..."\n` +
    `- "With a [rating] rating, ${buffetName}..."\n` +
    `- "${buffetName} offers..."\n` +
    `Make this description completely unique.`;
  
  const prompt = enhancedPrompt;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (aiProvider === 'gemini') {
        const model = aiClient.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text() || '';
      } else if (aiProvider === 'groq') {
        const response = await aiClient.chat.completions.create({
          model: 'llama-3.1-8b-instant', // Smaller, faster model with separate quota
          messages: [
            {
              role: 'system',
              content: 'You are an expert SEO content writer specializing in restaurant descriptions. Generate natural, keyword-rich content that appeals to both search engines and readers. CRITICAL: Never start descriptions with "In the heart of [City]" or "In the heart of [City], lies" - these phrases are FORBIDDEN. Always use varied, creative openings that start with the restaurant name, a question, or a unique feature. Each description must be completely unique with different sentence structures and vocabulary.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.9, // Higher temperature for more variation
          max_tokens: 600,
        });
        return response.choices[0]?.message?.content || '';
      } else if (aiProvider === 'openai') {
        const response = await aiClient.chat.completions.create({
          model: 'gpt-4-turbo-preview',
          messages: [
            {
              role: 'system',
              content: 'You are an expert SEO content writer specializing in restaurant descriptions. Generate natural, keyword-rich content that appeals to both search engines and readers.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 600,
        });
        return response.choices[0]?.message?.content || '';
      }
    } catch (error: any) {
      // Handle rate limit errors with exponential backoff
      if (error.status === 429 || (error.message && error.message.includes('rate limit'))) {
        const waitTime = Math.min(3000 * Math.pow(2, attempt), 30000); // Max 30 seconds
        if (attempt < retries - 1) {
          console.log(`  Rate limit hit, waiting ${waitTime/1000}s before retry...`);
          await delay(waitTime);
          continue;
        }
      }
      
      if (attempt === retries - 1) {
        throw error;
      }
      
      // For other errors, wait a bit and retry
      await delay(1000 * (attempt + 1));
    }
  }
  
  throw new Error('No AI provider configured');
}

// Rate limiting helper
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Checkpoint file for resuming
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoint.json');

interface Checkpoint {
  lastProcessedId: string | null;
  processedCount: number;
  errorCount: number;
  startTime: number;
}

function loadCheckpoint(): Checkpoint | null {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

async function updateBuffetDescription(buffetId: string, description: string) {
  try {
    await db.transact([
      db.tx.buffets[buffetId].update({ description })
    ]);
    return true;
  } catch (error) {
    console.error(`Error updating buffet ${buffetId}:`, error);
    return false;
  }
}

async function main() {
  const checkpoint = loadCheckpoint();
  const startTime = checkpoint?.startTime || Date.now();
  let processedCount = checkpoint?.processedCount || 0;
  let errorCount = checkpoint?.errorCount || 0;
  let lastProcessedId = checkpoint?.lastProcessedId || null;
  
  console.log('='.repeat(80));
  console.log('SEO Description Generation - Full Production Run');
  console.log('='.repeat(80));
  console.log(`AI Provider: ${aiProvider}`);
  if (checkpoint) {
    console.log(`Resuming from checkpoint: ${processedCount} processed, ${errorCount} errors`);
  }
  console.log('');
  
  try {
    // Fetch ALL buffets (not just those with structuredData)
    console.log('Fetching all buffets from database...');
    let allBuffets: any[] = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const query: any = {
        buffets: {
          $: { limit, offset },
        },
      };
      
      const result = await db.query(query);
      const buffets = result.buffets || [];
      
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      offset += limit;
      
      process.stdout.write(`\rFetched ${allBuffets.length} buffets so far...`);
      
      if (buffets.length < limit) break;
    }
    
    console.log(`\nTotal buffets found: ${allBuffets.length}\n`);
    console.log('NOTE: Processing ALL buffets, replacing existing descriptions if any.\n');
    
    // Filter out already processed if resuming from checkpoint
    if (lastProcessedId) {
      const lastIndex = allBuffets.findIndex(b => b.id === lastProcessedId);
      if (lastIndex >= 0) {
        allBuffets = allBuffets.slice(lastIndex + 1);
        console.log(`Resuming from buffet ${lastProcessedId}, ${allBuffets.length} remaining\n`);
      }
    }
    
    const totalBuffets = allBuffets.length;
    let currentIndex = 0;
    
    // Process with optimized rate limiting
    // Groq free tier: 12K tokens/min, ~2000 tokens per request = ~6 requests/min
    // Use 2 second delay for safety (30 requests/min max, well under limit)
    const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds between requests - optimized for speed
    
    // Process sequentially to respect rate limits
    for (const buffet of allBuffets) {
      currentIndex++;
      const progress = ((processedCount + currentIndex) / (processedCount + totalBuffets) * 100).toFixed(1);
      
      try {
        const formattedData = formatBuffetDataForPrompt(buffet);
        let description = await generateDescription(formattedData);
        
        // Post-process to fix any "In the heart of" openings - SIMPLE DIRECT REPLACEMENT
        if (description) {
          const trimmed = description.trim();
          const lower = trimmed.toLowerCase();
          
          // Direct check and replace
          if (lower.startsWith('in the heart of')) {
            const firstPeriod = trimmed.indexOf('.');
            const openings = [
              `${buffet.name} is a premier buffet destination in ${buffet.cityName} that`,
              `Discover ${buffet.name}, where ${buffet.cityName} residents and visitors`,
              `Looking for the best buffet in ${buffet.cityName}? ${buffet.name} offers`,
              `With an impressive reputation, ${buffet.name} has become`,
              `${buffet.name} stands out as one of ${buffet.cityName}'s top-rated buffets,`,
            ];
            const newOpening = openings[Math.floor(Math.random() * openings.length)];
            
            if (firstPeriod > 0 && firstPeriod < 400) {
              const rest = trimmed.substring(firstPeriod + 1).trim();
              description = `${newOpening}. ${rest}`;
            } else {
              description = `${newOpening}${trimmed.substring(200)}`;
            }
          }
        }
        
        if (description && description.trim().length > 50) {
          const success = await updateBuffetDescription(buffet.id, description);
          if (success) {
            processedCount++;
            lastProcessedId = buffet.id;
            console.log(`[${progress}%] ✓ ${buffet.name} (${buffet.cityName}, ${buffet.state}) - ${description.split(/\s+/).length} words`);
          } else {
            errorCount++;
            console.log(`[${progress}%] ✗ ${buffet.name} - Database update failed`);
          }
        } else {
          errorCount++;
          console.log(`[${progress}%] ✗ ${buffet.name} - Generated description too short`);
        }
        } catch (error: any) {
          errorCount++;
          const errorMsg = error.message?.substring(0, 100) || String(error).substring(0, 100);
          console.log(`[${progress}%] ✗ ${buffet.name} - Error: ${errorMsg}`);
          
          // If rate limit error, wait longer before continuing
          if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
            console.log(`  Rate limit hit, waiting 30 seconds...`);
            await delay(30000);
          }
        }
      
      // Save checkpoint every 50 buffets
      if ((processedCount + currentIndex) % 50 === 0) {
        saveCheckpoint({
          lastProcessedId,
          processedCount: processedCount + currentIndex,
          errorCount,
          startTime
        });
        console.log(`  Checkpoint saved: ${processedCount + currentIndex} processed, ${errorCount} errors`);
      }
      
      // Rate limiting - wait between requests to avoid hitting limits
      // Only delay if not the last item
      if (currentIndex < allBuffets.length) {
        await delay(DELAY_BETWEEN_REQUESTS);
      }
      
      // Show progress every 10 buffets
      if (currentIndex % 10 === 0) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const rate = processedCount > 0 ? (processedCount / ((Date.now() - startTime) / 1000 / 60)).toFixed(1) : '0';
        console.log(`\n[Progress Update] Processed: ${processedCount + currentIndex}/${totalBuffets} | Success: ${processedCount} | Errors: ${errorCount} | Rate: ${rate} buffets/min | Elapsed: ${elapsed} min\n`);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n' + '='.repeat(80));
    console.log('GENERATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`Total processed: ${processedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Duration: ${duration} minutes`);
    console.log(`Average: ${(processedCount / parseFloat(duration)).toFixed(1)} buffets/minute`);
    console.log('');
    
    // Clean up checkpoint file
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log('Checkpoint file cleaned up.');
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
    // Save checkpoint on error
    saveCheckpoint({
      lastProcessedId,
      processedCount,
      errorCount,
      startTime
    });
    console.log('\nCheckpoint saved. Run the script again to resume.');
    process.exit(1);
  }
}

main().catch(console.error);
