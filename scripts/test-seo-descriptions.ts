#!/usr/bin/env node
/**
 * Test script to generate 5 SEO descriptions for evaluation
 * Run: npx tsx scripts/test-seo-descriptions.ts
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { z } from 'zod';

// Load environment variables
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
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
      }
    }
  });
}

const possiblePaths = [
  path.join(__dirname, '../.env.local'),
  path.join(process.cwd(), '.env.local'),
  '.env.local'
];
for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    loadEnvFile(envPath);
    break;
  }
}

const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  INSTANT_ADMIN_TOKEN: process.env.INSTANT_ADMIN_TOKEN,
  INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
};

// Initialize providers
let geminiClient: any = null;
if (CONFIG.GEMINI_API_KEY) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    geminiClient = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
  } catch (e) {
    console.warn('⚠ Gemini package not available');
  }
}

const groqAvailable = !!CONFIG.GROQ_API_KEY;

if (!geminiClient && !groqAvailable) {
  console.error('ERROR: No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY');
  process.exit(1);
}

if (!CONFIG.INSTANT_ADMIN_TOKEN) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN is required');
  process.exit(1);
}

const db = init({
  appId: CONFIG.INSTANT_APP_ID,
  adminToken: CONFIG.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper functions (simplified versions from main script)
function parseJsonField(value: any): any {
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

const NEGATIVE_TERMS = new Set([
  'rude', 'dirty', 'cold', 'slow', 'overpriced', 'bad', 'awful', 'worst',
  'never', 'disappointed', 'terrible', 'horrible', 'disgusting', 'inedible',
]);

function containsNegativeTerm(text: string): boolean {
  const lower = text.toLowerCase();
  return Array.from(NEGATIVE_TERMS).some(term => lower.includes(term));
}

function filterPositiveReviews(reviews: any[]): any[] {
  return reviews.filter(review => {
    const rating = review.rating || review.stars;
    if (rating && rating >= 4) return true;
    if (rating && rating < 3) return false;
    const text = review.text || review.textTranslated || '';
    return !containsNegativeTerm(text);
  });
}

function extractPositiveHighlights(reviews: any[]): string[] {
  const highlights = new Map<string, number>();
  const positiveReviews = filterPositiveReviews(reviews);
  
  const highlightPatterns = [
    /(?:variety|selection|many options|extensive menu)/gi,
    /(?:seafood|sushi|sashimi|shrimp|crab)/gi,
    /(?:hibachi|grill|made to order)/gi,
    /(?:dessert|ice cream|fruit)/gi,
    /(?:clean|cleanliness|hygienic)/gi,
    /(?:friendly|helpful|attentive|staff|service)/gi,
    /(?:value|affordable|worth|price)/gi,
    /(?:family|kids|children)/gi,
  ];

  for (const review of positiveReviews) {
    const text = (review.text || review.textTranslated || '').toLowerCase();
    for (const pattern of highlightPatterns) {
      if (pattern.test(text)) {
        const match = text.match(pattern);
        if (match) {
          const key = match[0].toLowerCase();
          highlights.set(key, (highlights.get(key) || 0) + 1);
        }
      }
    }
  }

  return Array.from(highlights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([key]) => key);
}

function extractStructuredDataFacts(buffet: any): any {
  const facts: any = {
    name: buffet.name,
    city: buffet.cityName,
    state: buffet.state,
    neighborhood: buffet.neighborhood || null,
    category: buffet.categoryName || buffet.primaryType || null,
    price: buffet.price || null,
    hours: parseJsonField(buffet.hours) || null,
    website: buffet.website || null,
    attributes: [] as string[],
  };

  const structuredDataList = buffet.structuredData 
    ? (Array.isArray(buffet.structuredData) ? buffet.structuredData : [buffet.structuredData])
    : [];

  structuredDataList.forEach((item: any) => {
    if (item.data) {
      const data = parseJsonField(item.data);
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
          if (value === true || value === 'true') {
            facts.attributes.push(key);
          }
        });
      }
    }
  });

  return facts;
}

const OUTPUT_SCHEMA = z.object({
  description_md: z.string(),
  word_count: z.number().min(150).max(200),
  bold_phrases: z.array(z.string()).min(6).max(12),
});

async function generateWithGemini(prompt: string, seed: number): Promise<string> {
  if (!geminiClient) throw new Error('Gemini not available');
  const model = geminiClient.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
  const fullPrompt = `${prompt}\n\nCRITICAL: The description_md field MUST be exactly 150-200 words. Count carefully. This is mandatory. Output ONLY valid JSON, no markdown code fences, no extra text. Use this seed for variation: ${seed}`;
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.8 + (seed % 100) / 500,
      maxOutputTokens: 600, // Increased to ensure enough space for 150-200 words
    },
  });
  const response = await result.response;
  return response.text();
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(base: number): number {
  return base + Math.random() * base * 0.3;
}

async function generateWithGroq(prompt: string, seed: number, retryCount: number = 0): Promise<string> {
  if (!groqAvailable) throw new Error('Groq not available');
  const fullPrompt = `${prompt}\n\nCRITICAL: The description_md field MUST be exactly 150-200 words. Count carefully. This is mandatory. Output ONLY valid JSON, no markdown code fences, no extra text. Use this seed for variation: ${seed}`;
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: CONFIG.GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an SEO copywriter for local restaurant pages. Use ONLY the provided facts and positive review highlights. Do not invent features. Do not mention negatives. Write naturally but keyword-rich. Keep it readable. The description MUST be exactly 150-200 words - count carefully. Output ONLY valid JSON, no markdown, no extra text.',
        },
        { role: 'user', content: fullPrompt },
      ],
      temperature: 0.8 + (seed % 100) / 500,
      max_tokens: 600, // Increased to ensure enough space for 150-200 words
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      // Parse rate limit error message
      const errorText = await response.text();
      let errorData: any;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: { message: errorText } };
      }

      // Extract wait time from error message
      const message = errorData?.error?.message || '';
      const waitMatch = message.match(/try again in ([\d.]+)s/i);
      const waitSeconds = waitMatch ? parseFloat(waitMatch[1]) : 10;

      // Check retry-after header
      const retryAfter = response.headers.get('retry-after');
      const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : waitSeconds * 1000;

      if (retryCount < 3) {
        const waitMs = waitTime + jitter(1000);
        console.log(`  ⚠ Rate limit hit, waiting ${(waitMs / 1000).toFixed(1)}s before retry (attempt ${retryCount + 2}/4)...`);
        await sleep(waitMs);
        return generateWithGroq(prompt, seed, retryCount + 1);
      }

      throw new Error(`Rate limit exceeded. Please try again in ${waitSeconds}s`);
    }
    const text = await response.text();
    throw new Error(`Groq API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

const BANNED_OPENINGS = [
  "If you're looking for",
  "Look no further",
  "A hidden gem",
  "In the heart of",
];

function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_OPENINGS.some(phrase => lower.startsWith(phrase.toLowerCase()));
}

async function generateDescription(
  buffet: any,
  facts: any,
  reviewHighlights: string[],
  seed: number,
  retryCount: number = 0
): Promise<{ description: string; provider: string; model: string }> {
  const provider = geminiClient ? 'gemini' : 'groq';
  const prompt = `Generate an SEO description for a Chinese buffet restaurant.

FACTS:
- Name: ${facts.name}
- Location: ${facts.city}, ${facts.state}${facts.neighborhood ? ` (${facts.neighborhood})` : ''}
- Category: ${facts.category || 'Chinese Buffet'}
- Price: ${facts.price || 'Not specified'}
- Rating: ${buffet.rating || 'N/A'} (${buffet.reviewsCount || 0} reviews)
${facts.hours ? `- Hours: ${JSON.stringify(facts.hours)}` : ''}
${facts.website ? `- Website: ${facts.website}` : ''}
${facts.attributes.length > 0 ? `- Attributes: ${facts.attributes.join(', ')}` : ''}

POSITIVE REVIEW HIGHLIGHTS:
${reviewHighlights.length > 0 ? reviewHighlights.map(h => `- ${h}`).join('\n') : 'None available'}

REQUIREMENTS (MANDATORY):
1. EXACTLY 150-200 words in description_md (count every word - this is critical)
2. One or two short paragraphs (not bullets)
3. Bold EXACTLY 6-12 key phrases using **phrase** (not every word) - you MUST have at least 6 bold phrases
4. MUST include a bolded phrase containing "Chinese buffet" + city/state
5. Informative, keyword-heavy but natural
6. NO negative content
7. Avoid these banned openings: ${BANNED_OPENINGS.join(', ')}
8. Use seed ${seed} to vary sentence structure and ordering

IMPORTANT: 
- Write a FULL description. Do not cut it short. Aim for 170-180 words to be safe.
- You MUST include at least 6 bold phrases in the description_md text AND list them in the bold_phrases array.

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "description_md": "Full description with **bold** phrases...",
  "word_count": 173,
  "bold_phrases": ["Chinese buffet in ${facts.city}", "all-you-can-eat", ...]
}`;

  let rawOutput: string;
  try {
    if (provider === 'gemini') {
      rawOutput = await generateWithGemini(prompt, seed);
    } else {
      rawOutput = await generateWithGroq(prompt, seed);
    }
  } catch (error: any) {
    // If rate limited and we have both providers, try the other one
    if (error.message?.includes('rate limit') || error.message?.includes('429')) {
      if (provider === 'groq' && geminiClient) {
        console.log(`  ⚠ Groq rate limited, switching to Gemini...`);
        rawOutput = await generateWithGemini(prompt, seed);
      } else if (provider === 'gemini' && groqAvailable) {
        console.log(`  ⚠ Gemini rate limited, switching to Groq...`);
        rawOutput = await generateWithGroq(prompt, seed);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  // Clean JSON
  let jsonStr = rawOutput.trim();
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`  Failed to parse JSON. Raw output: ${jsonStr.substring(0, 200)}...`);
    throw new Error(`Invalid JSON: ${e}`);
  }

  // Extract bold phrases from description if not enough provided
  const boldMatches = parsed.description_md?.match(/\*\*([^*]+)\*\*/g) || [];
  const extractedBoldPhrases = boldMatches.map((m: string) => m.replace(/\*\*/g, ''));
  
      // If model didn't provide enough bold phrases, use extracted ones
      if (!parsed.bold_phrases || parsed.bold_phrases.length < 6) {
        if (extractedBoldPhrases.length >= 6) {
          parsed.bold_phrases = extractedBoldPhrases.slice(0, 12);
          console.log(`  ⚠ Model provided ${parsed.bold_phrases?.length || 0} bold phrases, using ${extractedBoldPhrases.length} extracted from description`);
        } else if (retryCount < 2) {
          console.log(`  ⚠ Not enough bold phrases (${parsed.bold_phrases?.length || 0}), retrying (attempt ${retryCount + 2}/3)...`);
          return generateDescription(buffet, facts, reviewHighlights, seed + 1000, retryCount + 1);
        }
      }
      
      // Ensure bold_phrases array is within 6-12 range
      if (parsed.bold_phrases && parsed.bold_phrases.length > 12) {
        parsed.bold_phrases = parsed.bold_phrases.slice(0, 12);
        console.log(`  ⚠ Truncated bold_phrases from ${parsed.bold_phrases.length} to 12`);
      }

  const validated = OUTPUT_SCHEMA.parse(parsed);

  const wordCount = validated.description_md.split(/\s+/).length;
  
  // Retry if word count is too low (up to 2 retries)
  if (wordCount < 150 && retryCount < 2) {
    console.log(`  ⚠ Word count ${wordCount} too low, retrying (attempt ${retryCount + 2}/3)...`);
    return generateDescription(buffet, facts, reviewHighlights, seed + 1000, retryCount + 1);
  }
  
  if (wordCount < 150 || wordCount > 200) {
    console.error(`  Generated description (${wordCount} words):`);
    console.error(`  ${validated.description_md.substring(0, 200)}...`);
    throw new Error(`Word count ${wordCount} not in range 150-200`);
  }

  if (containsNegativeTerm(validated.description_md)) {
    throw new Error('Description contains negative terms');
  }

  if (containsBannedPhrase(validated.description_md)) {
    throw new Error('Description contains banned opening phrase');
  }

  return {
    description: validated.description_md,
    provider,
    model: provider === 'gemini' ? CONFIG.GEMINI_MODEL : CONFIG.GROQ_MODEL,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('SEO Description Generator - Test Run (5 descriptions)');
  console.log('='.repeat(80));
  console.log(`Provider: ${geminiClient ? 'Gemini' : 'Groq'}\n`);

  // Fetch 5 buffets
  const result = await db.query({
    buffets: {
      $: { limit: 5 },
      reviewRecords: {},
      structuredData: {},
    },
  });

  const buffets = result.buffets || [];
  console.log(`Found ${buffets.length} buffets to process\n`);

  for (let i = 0; i < buffets.length; i++) {
    const buffet = buffets[i];
    console.log('\n' + '='.repeat(80));
    console.log(`BUFFET ${i + 1}/${buffets.length}: ${buffet.name}`);
    console.log(`Location: ${buffet.cityName}, ${buffet.state}`);
    console.log(`Rating: ${buffet.rating || 'N/A'} (${buffet.reviewsCount || 0} reviews)`);
    console.log('='.repeat(80));

    try {
      const facts = extractStructuredDataFacts(buffet);
      const reviews = buffet.reviewRecords || [];
      const { positiveHighlights } = { positiveHighlights: extractPositiveHighlights(reviews) };
      const seed = parseInt(createHash('md5').update(buffet.id).digest('hex').substring(0, 8), 16) % 10000;

      console.log(`\nGenerating description... (seed: ${seed})`);
      const result = await generateDescription(buffet, facts, positiveHighlights, seed);

      console.log(`\n✓ Generated using ${result.provider}/${result.model}`);
      console.log(`\n--- DESCRIPTION ---`);
      console.log(result.description);
      console.log(`\n--- END ---`);
      console.log(`\nWord count: ${result.description.split(/\s+/).length}`);
      console.log(`Bold phrases found: ${(result.description.match(/\*\*[^*]+\*\*/g) || []).length}`);

    } catch (error: any) {
      console.error(`\n✗ Error: ${error.message}`);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('Test complete! Review the descriptions above.');
  console.log('If satisfied, run the full script:');
  console.log('  npx tsx scripts/generate-seo-descriptions.ts --limit 5');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
