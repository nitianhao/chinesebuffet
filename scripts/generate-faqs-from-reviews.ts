/**
 * Generate FAQs from Reviews Script
 * 
 * Generates synthetic FAQ sections (8-12 Q&As) for buffet detail pages based on written reviews.
 * Each answer is grounded in actual review text with citations.
 * 
 * Example commands:
 *   npx tsx scripts/generate-faqs-from-reviews.ts
 *   npx tsx scripts/generate-faqs-from-reviews.ts --limit 10 --concurrency 3
 *   npx tsx scripts/generate-faqs-from-reviews.ts --buffetId <id> --write
 *   npx tsx scripts/generate-faqs-from-reviews.ts --limit 10 --model llama-3.3-70b-versatile
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

const DEFAULT_MODEL = 'llama-3.1-8b-instant'; // Cost-efficient model (use llama-3.3-70b-versatile for higher quality)
const DEFAULT_LIMIT = 10;
const DEFAULT_CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;
const MAX_REVIEWS_TO_SEND = 40; // Balanced for quality and cost
const MIN_REVIEW_TEXT_LENGTH = 30; // Slightly higher to filter out short reviews
const MAX_REVIEW_TEXT_LENGTH = 500; // Truncate very long reviews to save tokens

// Schema for LLM response
const CitationSchema = z.object({
  reviewId: z.string(),
  snippet: z.string().min(10)
});

const FAQItemSchema = z.object({
  question: z.string().min(10),
  answer: z.string().min(30),
  citations: z.array(CitationSchema).min(1).max(3),
  confidence: z.enum(['high', 'medium'])
});

const FAQResponseSchema = z.object({
  items: z.array(FAQItemSchema).min(1)
});

type FAQItem = z.infer<typeof FAQItemSchema>;
type FAQResponse = z.infer<typeof FAQResponseSchema>;

type BuffetRecord = {
  id: string;
  name?: string;
  cityName?: string;
  state?: string;
  questionsAndAnswers?: string | null;
  reviews?: string | any[]; // JSON string or array as fallback
  reviewRecords?: ReviewRecord[] | any; // Can be array or other structure
};

type ReviewRecord = {
  id: string;
  text?: string;
  textTranslated?: string;
  rating?: number;
  stars?: number;
  publishAt?: string;
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type GeneratedFAQ = {
  version: number;
  generatedAt: string;
  model: string;
  items: FAQItem[];
  jsonLd: {
    '@context': string;
    '@type': string;
    mainEntity: Array<{
      '@type': string;
      name: string;
      acceptedAnswer: {
        '@type': string;
        text: string;
      };
    }>;
  };
};

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

function repairJson(text: string): string {
  let json = text.trim();
  
  // Remove trailing commas before } or ]
  json = json.replace(/,\s*}/g, '}');
  json = json.replace(/,\s*]/g, ']');
  
  // Try to fix truncated JSON by closing open brackets/braces
  const openBraces = (json.match(/{/g) || []).length;
  const closeBraces = (json.match(/}/g) || []).length;
  const openBrackets = (json.match(/\[/g) || []).length;
  const closeBrackets = (json.match(/]/g) || []).length;
  
  // If JSON is truncated (more opens than closes), try to fix
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    // Find the last complete item in items array and truncate there
    const itemsMatch = json.match(/"items"\s*:\s*\[/);
    if (itemsMatch) {
      // Find all complete item objects
      const completeItemsRegex = /\{[^{}]*"question"[^{}]*"answer"[^{}]*"citations"[^{}]*\[[^\[\]]*\][^{}]*"confidence"[^{}]*\}/g;
      const completeItems = json.match(completeItemsRegex);
      
      if (completeItems && completeItems.length > 0) {
        // Reconstruct with only complete items
        json = `{"items":[${completeItems.join(',')}]}`;
      }
    }
  }
  
  // Add missing closing brackets
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    json += ']';
  }
  for (let i = 0; i < openBraces - closeBraces; i++) {
    json += '}';
  }
  
  return json;
}

function parseJsonField(value: any): any[] | null {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeReviewRecord(review: any): ReviewRecord | null {
  // Handle different review record structures
  if (!review) return null;
  
  // If it's already in the expected format
  if (review.id && (review.text || review.textTranslated)) {
    return {
      id: review.id,
      text: review.text,
      textTranslated: review.textTranslated,
      rating: review.rating,
      stars: review.stars,
      publishAt: review.publishAt
    };
  }
  
  // Try to extract from various possible structures
  const id = review.id || review.reviewId || `review-${Math.random().toString(36).substr(2, 9)}`;
  const text = review.text || review.textTranslated || review.comment || review.content || '';
  const textTranslated = review.textTranslated || review.text || '';
  
  if (!text && !textTranslated) return null;
  
  return {
    id,
    text: text || undefined,
    textTranslated: textTranslated || undefined,
    rating: review.rating || review.stars || review.score,
    stars: review.stars || review.rating || review.score,
    publishAt: review.publishAt || review.publishedAt || review.time || review.date
  };
}

function prepareReviewsForPrompt(reviews: ReviewRecord[]): Array<{ id: string; text: string }> {
  // Filter reviews with text, prioritize recent and higher rated
  const validReviews = reviews
    .filter((r) => {
      if (!r) return false;
      const text = r.textTranslated || r.text || '';
      return text.trim().length >= MIN_REVIEW_TEXT_LENGTH;
    })
    .sort((a, b) => {
      // Sort by rating (higher first), then by publish date (newer first)
      const ratingA = a.rating || a.stars || 0;
      const ratingB = b.rating || b.stars || 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
      const dateA = a.publishAt ? new Date(a.publishAt).getTime() : 0;
      const dateB = b.publishAt ? new Date(b.publishAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, MAX_REVIEWS_TO_SEND)
    .map((r) => {
      let text = (r.textTranslated || r.text || '').trim();
      // Truncate very long reviews to save tokens
      if (text.length > MAX_REVIEW_TEXT_LENGTH) {
        text = text.substring(0, MAX_REVIEW_TEXT_LENGTH) + '...';
      }
      return { id: r.id, text };
    });

  return validReviews;
}

function getReviewsFromBuffet(buffet: BuffetRecord): ReviewRecord[] {
  const reviews: ReviewRecord[] = [];
  
  // First, try reviewRecords (linked table)
  if (buffet.reviewRecords) {
    if (Array.isArray(buffet.reviewRecords)) {
      for (const record of buffet.reviewRecords) {
        const normalized = normalizeReviewRecord(record);
        if (normalized) reviews.push(normalized);
      }
    } else {
      // Handle case where reviewRecords might be a single object or different structure
      const normalized = normalizeReviewRecord(buffet.reviewRecords);
      if (normalized) reviews.push(normalized);
    }
  }
  
  // Fallback to reviews JSON field if reviewRecords is empty
  if (reviews.length === 0 && buffet.reviews) {
    const jsonReviews = parseJsonField(buffet.reviews);
    if (jsonReviews && jsonReviews.length > 0) {
      for (const review of jsonReviews) {
        const normalized = normalizeReviewRecord(review);
        if (normalized) reviews.push(normalized);
      }
    }
  }
  
  return reviews;
}

function buildPrompt(buffet: BuffetRecord, reviews: Array<{ id: string; text: string }>): string {
  const location = buffet.cityName && buffet.state 
    ? `${buffet.cityName}, ${buffet.state}` 
    : buffet.cityName || buffet.state || 'this location';

  // Compact review format to save tokens
  const reviewsCompact = reviews.map(r => `[${r.id}] ${r.text}`).join('\n');

  return `Generate 10-12 FAQ items for "${buffet.name || 'This buffet'}" in ${location} based ONLY on these reviews. Each answer needs a verbatim citation (10+ chars) from the reviews.

RULES:
- Use ONLY info from reviews. No inventing.
- Each answer must cite 1-2 reviews with exact quotes.
- Focus on: price, food quality, dishes, service, cleanliness, wait times, kid-friendly.

OUTPUT: Strict JSON only, no markdown:
{"items":[{"question":"...?","answer":"...","citations":[{"reviewId":"id","snippet":"exact quote 10+ chars"}],"confidence":"high"|"medium"}]}

REVIEWS:
${reviewsCompact}

JSON:`;
}

async function generateWithGroq(
  prompt: string,
  model: string
): Promise<{ text: string; tokens?: TokenUsage }> {
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
    rateLimitManager.markUnhealthy('groq', 'GROQ_API_KEY not set');
    throw new Error('GROQ_API_KEY is not set');
  }

  // Proactive throttling
  const estimatedTokens = rateLimitManager.estimateTokens(prompt, 4000);
  const proactiveWaitMs = rateLimitManager.shouldWaitForGroq(estimatedTokens);
  if (proactiveWaitMs > 0) {
    await rateLimitManager.globalSleep(proactiveWaitMs, `Groq proactive throttle (need ~${estimatedTokens} tokens)`);
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
          temperature: 0.6, // Slightly lower for more consistent output
          max_tokens: 3000, // Balanced for cost efficiency and avoiding truncation
          messages: [
            {
              role: 'system',
              content: 'Generate FAQ JSON from reviews. Return valid JSON only.'
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
        const sleepMs = Math.min(rateLimitManager.calculateSleepMs(headers, attempt), 3000);
        rateLimitManager.record429('groq', headers, sleepMs);
        
        if (attempt < MAX_RETRIES - 1) {
          await rateLimitManager.globalSleep(sleepMs, `Groq 429 (retry ${attempt + 1}/${MAX_RETRIES})`);
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
      
      let tokens: TokenUsage | undefined;
      if (data?.usage) {
        tokens = {
          promptTokens: data.usage.prompt_tokens || 0,
          completionTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0
        };
      }
      
      rateLimitManager.recordSuccess('groq');
      return { text, tokens };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (error?.name === 'AbortError' || error?.message?.includes('abort')) {
        if (attempt < MAX_RETRIES - 1) {
          continue;
        }
        throw new Error('Request timeout');
      }
      
      if (response && response.status >= 500 && attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      
      throw error;
    }
  }

  throw new Error('Groq unavailable');
}

function validateCitations(
  items: FAQItem[],
  reviews: Array<{ id: string; text: string }>
): FAQItem[] {
  const reviewMap = new Map(reviews.map(r => [r.id, r.text.toLowerCase()]));
  const validItems: FAQItem[] = [];

  for (const item of items) {
    let isValid = true;
    const validCitations: typeof item.citations = [];

    for (const citation of item.citations) {
      const reviewText = reviewMap.get(citation.reviewId);
      if (!reviewText) {
        console.warn(`  [warn] Citation references unknown reviewId: ${citation.reviewId}`);
        isValid = false;
        break;
      }

      // Check if snippet appears in review (case-insensitive, allow partial matches)
      const snippetLower = citation.snippet.toLowerCase();
      if (!reviewText.includes(snippetLower)) {
        console.warn(`  [warn] Citation snippet not found in review ${citation.reviewId}: "${citation.snippet.substring(0, 50)}..."`);
        isValid = false;
        break;
      }

      validCitations.push(citation);
    }

    if (isValid && validCitations.length > 0) {
      validItems.push({
        ...item,
        citations: validCitations
      });
    }
  }

  return validItems;
}

function filterToBestItems(items: FAQItem[], targetCount: number = 10): FAQItem[] {
  if (items.length <= targetCount) return items;

  // Sort by confidence (high first), then by number of citations
  const sorted = [...items].sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'high' ? -1 : 1;
    }
    return b.citations.length - a.citations.length;
  });

  // Try to diversify topics (simple heuristic: prefer different question starts)
  const selected: FAQItem[] = [];
  const questionStarts = new Set<string>();

  for (const item of sorted) {
    if (selected.length >= targetCount) break;
    
    const questionStart = item.question.substring(0, 20).toLowerCase();
    if (selected.length < 8 || !questionStarts.has(questionStart)) {
      selected.push(item);
      questionStarts.add(questionStart);
    }
  }

  // Fill remaining slots if needed
  for (const item of sorted) {
    if (selected.length >= targetCount) break;
    if (!selected.includes(item)) {
      selected.push(item);
    }
  }

  return selected.slice(0, targetCount);
}

function generateJsonLd(items: FAQItem[]): GeneratedFAQ['jsonLd'] {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}

async function generateFAQs(
  buffet: BuffetRecord,
  model: string
): Promise<{ faq: GeneratedFAQ | null; tokens?: TokenUsage; error?: string }> {
  // Get reviews from reviewRecords or fallback to reviews JSON field
  const reviews = getReviewsFromBuffet(buffet);
  
  if (reviews.length === 0) {
    // Debug: log what we found
    const hasReviewRecords = !!buffet.reviewRecords;
    const hasReviewsField = !!buffet.reviews;
    const reviewRecordsType = buffet.reviewRecords ? typeof buffet.reviewRecords : 'none';
    const reviewRecordsIsArray = Array.isArray(buffet.reviewRecords);
    const reviewRecordsLength = Array.isArray(buffet.reviewRecords) ? buffet.reviewRecords.length : 'N/A';
    
    console.warn(`  [debug] No reviews found for ${buffet.name || buffet.id}:`);
    console.warn(`    - reviewRecords exists: ${hasReviewRecords} (type: ${reviewRecordsType}, isArray: ${reviewRecordsIsArray}, length: ${reviewRecordsLength})`);
    console.warn(`    - reviews field exists: ${hasReviewsField}`);
    if (buffet.reviewRecords && !Array.isArray(buffet.reviewRecords)) {
      console.warn(`    - reviewRecords structure:`, JSON.stringify(buffet.reviewRecords).substring(0, 200));
    }
    return { faq: null, error: 'No reviews available' };
  }

  const preparedReviews = prepareReviewsForPrompt(reviews);
  if (preparedReviews.length === 0) {
    console.warn(`  [debug] Reviews found but none have sufficient text (${reviews.length} total)`);
    return { faq: null, error: 'No reviews with sufficient text' };
  }
  
  console.log(`  [debug] Using ${preparedReviews.length} reviews (from ${reviews.length} total)`);

  try {
    const prompt = buildPrompt(buffet, preparedReviews);
    const { text, tokens } = await generateWithGroq(prompt, model);

    // Extract JSON
    const { jsonText } = extractJsonFromText(text);
    let rawData: any;
    
    try {
      rawData = JSON.parse(jsonText);
    } catch (firstError) {
      // Try to repair the JSON
      console.warn(`  [warn] Initial JSON parse failed, attempting repair...`);
      try {
        const repairedJson = repairJson(jsonText);
        rawData = JSON.parse(repairedJson);
        console.log(`  [info] JSON repaired successfully`);
      } catch (repairError) {
        console.warn(`  [warn] JSON repair failed: ${repairError}`);
        console.warn(`  [debug] Raw response (first 500 chars): ${text.substring(0, 500)}`);
        return { faq: null, error: `Invalid JSON: ${firstError}` };
      }
    }

    // Validate and filter items leniently (don't fail on individual item issues)
    if (!rawData.items || !Array.isArray(rawData.items)) {
      return { faq: null, error: 'Response missing items array' };
    }

    // Filter out invalid items instead of failing entirely
    const validItems: FAQItem[] = [];
    for (const item of rawData.items) {
      try {
        // Validate individual item
        const validated = FAQItemSchema.parse(item);
        validItems.push(validated);
      } catch (error: any) {
        console.warn(`  [warn] Skipping invalid FAQ item: ${error?.message || error}`);
        continue;
      }
    }

    if (validItems.length === 0) {
      return { faq: null, error: 'No valid FAQ items found in response' };
    }

    // Validate citations
    const validatedItems = validateCitations(validItems, preparedReviews);
    
    if (validatedItems.length === 0) {
      return { faq: null, error: 'No items passed citation validation' };
    }

    // Filter to best 8-12 items
    const bestItems = filterToBestItems(validatedItems, 12);
    
    if (bestItems.length < 8) {
      console.warn(`  [warn] Only ${bestItems.length} grounded FAQs generated (target: 8-12)`);
    }

    // Generate JSON-LD
    const jsonLd = generateJsonLd(bestItems);

    const faq: GeneratedFAQ = {
      version: 1,
      generatedAt: new Date().toISOString(),
      model,
      items: bestItems,
      jsonLd
    };

    return { faq, tokens };
  } catch (error: any) {
    return { faq: null, error: String(error?.message || error) };
  }
}

function printFAQOutput(buffet: BuffetRecord, faq: GeneratedFAQ, tokens?: TokenUsage) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`[BUFFET] ${buffet.name || 'Unknown'} (ID: ${buffet.id})`);
  if (buffet.cityName && buffet.state) {
    console.log(`Location: ${buffet.cityName}, ${buffet.state}`);
  }
  console.log(`${'─'.repeat(80)}`);
  console.log(`Generated ${faq.items.length} FAQs using model: ${faq.model}`);
  if (tokens) {
    console.log(`Tokens: ${tokens.promptTokens} in / ${tokens.completionTokens} out / ${tokens.totalTokens} total`);
  }
  console.log(`${'─'.repeat(80)}\n`);

  faq.items.forEach((item, idx) => {
    console.log(`${idx + 1}. Q: ${item.question}`);
    console.log(`   A: ${item.answer}`);
    console.log(`   Citations (${item.citations.length}, confidence: ${item.confidence}):`);
    item.citations.forEach((cit, citIdx) => {
      console.log(`     ${citIdx + 1}. Review ${cit.reviewId}: "${cit.snippet}"`);
    });
    console.log('');
  });

  console.log(`${'='.repeat(80)}\n`);
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

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema
  });

  // Initialize rate limit manager
  const rateLimitManager = getRateLimitManager(concurrency);

  let buffets: BuffetRecord[] = [];
  
  if (buffetId) {
    // Fetch specific buffet
    const result = await db.query({
      buffets: {
        $: { where: { id: buffetId } },
        reviewRecords: { $: { limit: 100 } }
      }
    });
    buffets = (result.buffets || []) as BuffetRecord[];
    
    // Debug: log what we got
    if (buffets.length > 0) {
      const b = buffets[0];
      console.log(`[debug] Fetched buffet: ${b.name || b.id}`);
      console.log(`  - reviewRecords: ${b.reviewRecords ? (Array.isArray(b.reviewRecords) ? `${b.reviewRecords.length} items` : typeof b.reviewRecords) : 'none'}`);
      console.log(`  - reviews field: ${b.reviews ? (typeof b.reviews === 'string' ? 'string' : Array.isArray(b.reviews) ? `${b.reviews.length} items` : typeof b.reviews) : 'none'}`);
    }
  } else {
    // Keep fetching batches until we find enough buffets without FAQs
    console.log(`Fetching buffets until we find ${limit} without FAQs...`);
    
    const batchSize = 500;
    let offset = 0;
    let allBuffets: BuffetRecord[] = [];
    let foundCount = 0;
    const maxBatches = 100; // Safety limit to avoid infinite loops
    
    while (foundCount < limit && offset < maxBatches * batchSize) {
      const result = await db.query({
        buffets: {
          $: { limit: batchSize, offset },
          reviewRecords: { $: { limit: 100 } }
        }
      });
      
      const batch = (result.buffets || []) as BuffetRecord[];
      if (batch.length === 0) {
        console.log(`  No more buffets found at offset ${offset}`);
        break;
      }
      
      allBuffets = allBuffets.concat(batch);
      
      // Filter to those with reviews and without existing FAQs
      const matching = batch.filter(b => {
        // Skip if already has FAQs
        if (b.questionsAndAnswers && b.questionsAndAnswers.trim().length > 0) {
          return false;
        }
        // Must have reviews with text (try both reviewRecords and reviews field)
        const reviews = getReviewsFromBuffet(b);
        if (reviews.length === 0) {
          return false;
        }
        const hasText = reviews.some(r => {
          const text = r.textTranslated || r.text || '';
          return text.trim().length >= MIN_REVIEW_TEXT_LENGTH;
        });
        return hasText;
      });
      
      foundCount += matching.length;
      offset += batchSize;
      
      console.log(`  Fetched batch at offset ${offset - batchSize}: ${batch.length} buffets, ${matching.length} match criteria (total found: ${foundCount}/${limit})`);
      
      if (batch.length < batchSize) {
        // Last batch
        break;
      }
    }
    
    // Filter all fetched buffets to get final list
    buffets = allBuffets.filter(b => {
      // Skip if already has FAQs
      if (b.questionsAndAnswers && b.questionsAndAnswers.trim().length > 0) {
        return false;
      }
      // Must have reviews with text
      const reviews = getReviewsFromBuffet(b);
      if (reviews.length === 0) {
        return false;
      }
      const hasText = reviews.some(r => {
        const text = r.textTranslated || r.text || '';
        return text.trim().length >= MIN_REVIEW_TEXT_LENGTH;
      });
      return hasText;
    }).slice(0, limit);
    
    console.log(`\nFinal: ${buffets.length} buffets ready for FAQ generation (searched ${allBuffets.length} total)`);
  }

  if (buffets.length === 0) {
    console.log('\n❌ No buffets found with reviews.');
    console.log('\nPossible reasons:');
    console.log('  1. All buffets already have FAQs');
    console.log('  2. Reviews are not linked via reviewRecords relation');
    console.log('  3. Reviews exist but have no text content');
    console.log('\nTry running with a specific buffetId to debug:');
    console.log('  npx tsx scripts/generate-faqs-from-reviews.ts --buffetId <id>');
    process.exit(0);
  }

  console.log(`Processing ${buffets.length} buffet(s) with concurrency=${concurrency}, write=${write}, model=${model}\n`);

  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let totalTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const startTime = Date.now();

  async function processBuffet(buffet: BuffetRecord) {
    try {
      // Skip if FAQs already exist (unless --force flag is added in future)
      if (buffet.questionsAndAnswers && buffet.questionsAndAnswers.trim().length > 0) {
        console.log(`[SKIPPED] ${buffet.name || buffet.id}: FAQs already exist`);
        skippedCount++;
        return;
      }

      const { faq, tokens, error } = await generateFAQs(buffet, model);

      if (error) {
        console.error(`[FAILED] ${buffet.name || buffet.id}: ${error}`);
        failedCount++;
        return;
      }

      if (!faq) {
        console.log(`[SKIPPED] ${buffet.name || buffet.id}: No FAQs generated`);
        skippedCount++;
        return;
      }

      // Print output
      printFAQOutput(buffet, faq, tokens);

      // Track tokens
      if (tokens) {
        totalTokens.promptTokens += tokens.promptTokens;
        totalTokens.completionTokens += tokens.completionTokens;
        totalTokens.totalTokens += tokens.totalTokens;
      }

      // Write to database if --write flag is set
      if (write) {
        const jsonString = JSON.stringify(faq);
        await db.transact([db.tx.buffets[buffet.id].update({ questionsAndAnswers: jsonString })]);
        console.log(`[WRITTEN] ${buffet.name || buffet.id}: Saved to database\n`);
      } else {
        console.log(`[DRY RUN] ${buffet.name || buffet.id}: Not written (use --write to save)\n`);
      }

      successCount++;
    } catch (error: any) {
      console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
      failedCount++;
    } finally {
      processed++;
    }
  }

  // Process with concurrency control using batches
  for (let i = 0; i < buffets.length; i += concurrency) {
    const batch = buffets.slice(i, i + concurrency);
    await Promise.all(batch.map(buffet => processBuffet(buffet)));
  }

  const durationMin = (Date.now() - startTime) / 1000 / 60;
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SUMMARY`);
  console.log(`${'─'.repeat(80)}`);
  console.log(`Processed: ${processed}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Duration: ${durationMin.toFixed(1)} minutes`);
  console.log(`Total Tokens: ${totalTokens.totalTokens} (${totalTokens.promptTokens} in / ${totalTokens.completionTokens} out)`);
  console.log(`${'='.repeat(80)}\n`);

  rateLimitManager.maybePrintStats();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
