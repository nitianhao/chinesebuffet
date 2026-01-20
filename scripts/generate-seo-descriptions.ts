#!/usr/bin/env node
/**
 * SEO Description Generator for Buffet Detail Pages
 * 
 * Generates unique, keyword-rich SEO descriptions (150-200 words) for each buffet.
 * Features:
 * - Multi-provider support (Gemini primary, Groq fallback)
 * - Rate limiting with circuit breakers
 * - Checkpointing/resume capability
 * - Uniqueness checking and anti-repetition
 * - Review preprocessing (filter negatives, extract highlights)
 * - JSON output validation
 * - CLI flags for control
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { z } from 'zod';
import pLimit from 'p-limit';

// ============================================================================
// Configuration & Environment
// ============================================================================

// Load environment variables from .env.local
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

// Load .env.local
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

// Configuration from environment
const CONFIG = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  INSTANT_ADMIN_TOKEN: process.env.INSTANT_ADMIN_TOKEN,
  INSTANT_APP_ID: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '25000'),
  CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_MS || '120000'), // 2 minutes
  MAX_RETRIES: 3,
};

// ============================================================================
// CLI Arguments Parsing
// ============================================================================

interface CLIOptions {
  limit?: number;
  concurrency?: number;
  force: boolean;
  dryRun: boolean;
  where?: string;
}

function parseCLIArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--limit' && i + 1 < args.length) {
      options.limit = parseInt(args[++i]);
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      options.concurrency = parseInt(args[++i]);
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--where' && i + 1 < args.length) {
      options.where = args[++i];
    }
  }

  return options;
}

const CLI_OPTS = parseCLIArgs();

// ============================================================================
// AI Provider Setup
// ============================================================================

let geminiClient: any = null;
let groqAvailable = false;

// Initialize Gemini
if (CONFIG.GEMINI_API_KEY) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    geminiClient = new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY);
    console.log('✓ Gemini API initialized');
  } catch (e) {
    console.warn('⚠ Gemini package not available');
  }
}

// Groq is available via fetch (OpenAI-compatible)
if (CONFIG.GROQ_API_KEY) {
  groqAvailable = true;
  console.log('✓ Groq API available');
}

if (!geminiClient && !groqAvailable) {
  console.error('ERROR: No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY');
  process.exit(1);
}

if (!CONFIG.INSTANT_ADMIN_TOKEN) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN is required');
  process.exit(1);
}

// ============================================================================
// Database Setup
// ============================================================================

const db = init({
  appId: CONFIG.INSTANT_APP_ID,
  adminToken: CONFIG.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// ============================================================================
// Rate Limiting & Circuit Breakers
// ============================================================================

interface ProviderState {
  consecutive429s: number;
  coolingDownUntil: number;
  isAvailable: boolean;
}

const providerStates: Record<string, ProviderState> = {
  gemini: { consecutive429s: 0, coolingDownUntil: 0, isAvailable: true },
  groq: { consecutive429s: 0, coolingDownUntil: 0, isAvailable: true },
};

function isProviderAvailable(provider: string): boolean {
  const state = providerStates[provider];
  if (!state) return false;
  if (Date.now() < state.coolingDownUntil) return false;
  return state.isAvailable;
}

function markProvider429(provider: string) {
  const state = providerStates[provider];
  if (!state) return;
  state.consecutive429s++;
  if (state.consecutive429s >= 3) {
    state.coolingDownUntil = Date.now() + CONFIG.CIRCUIT_BREAKER_COOLDOWN_MS;
    state.isAvailable = false;
    console.warn(`⚠ ${provider} circuit breaker activated (cooldown ${CONFIG.CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s)`);
  }
}

function markProviderSuccess(provider: string) {
  const state = providerStates[provider];
  if (!state) return;
  state.consecutive429s = 0;
  if (!state.isAvailable && Date.now() >= state.coolingDownUntil) {
    state.isAvailable = true;
    console.log(`✓ ${provider} circuit breaker reset`);
  }
}

function getAvailableProvider(): 'gemini' | 'groq' | null {
  if (isProviderAvailable('gemini') && geminiClient) return 'gemini';
  if (isProviderAvailable('groq') && groqAvailable) return 'groq';
  return null;
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jitter(base: number): number {
  return base + Math.random() * base * 0.3;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = CONFIG.MAX_RETRIES,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries - 1) {
        const delay = jitter(baseDelay * Math.pow(2, attempt));
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// ============================================================================
// Request with Timeout
// ============================================================================

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = CONFIG.REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// ============================================================================
// Review Preprocessing
// ============================================================================

const NEGATIVE_TERMS = new Set([
  'rude', 'dirty', 'cold', 'slow', 'overpriced', 'bad', 'awful', 'worst',
  'never', 'disappointed', 'terrible', 'horrible', 'disgusting', 'inedible',
  'waste', 'money', 'avoid', 'poor', 'mediocre', 'lousy', 'pathetic'
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
    // If no rating, check text for negative terms
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
    /(?:fresh|hot|delicious|tasty|flavorful)/gi,
    /(?:atmosphere|ambiance|decor)/gi,
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

  // Return top 5-7 highlights by frequency
  return Array.from(highlights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)
    .map(([key]) => key);
}

function preprocessReviews(reviews: any[]): { positiveHighlights: string[]; reviewCount: number } {
  const positive = filterPositiveReviews(reviews);
  const highlights = extractPositiveHighlights(positive);
  return {
    positiveHighlights: highlights,
    reviewCount: positive.length,
  };
}

// ============================================================================
// Structured Data Preprocessing
// ============================================================================

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
  };

  // Extract from structuredData linked records
  const structuredDataList = buffet.structuredData 
    ? (Array.isArray(buffet.structuredData) ? buffet.structuredData : [buffet.structuredData])
    : [];

  const attributes: string[] = [];
  structuredDataList.forEach((item: any) => {
    if (item.data) {
      const data = parseJsonField(item.data);
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, value]) => {
          if (value === true || value === 'true') {
            attributes.push(key);
          }
        });
      }
    }
  });

  facts.attributes = attributes;
  return facts;
}

// ============================================================================
// Input Hash Generation
// ============================================================================

function generateInputHash(buffet: any, reviewHighlights: string[]): string {
  const data = {
    id: buffet.id,
    name: buffet.name,
    city: buffet.cityName,
    state: buffet.state,
    rating: buffet.rating,
    price: buffet.price,
    highlights: reviewHighlights.sort(),
  };
  return createHash('sha256').update(JSON.stringify(data)).digest('hex').substring(0, 16);
}

// ============================================================================
// Uniqueness Checking
// ============================================================================

const usedSentences = new Set<string>();
const recentDescriptions: string[] = [];
const MAX_RECENT_DESCRIPTIONS = 100;

function normalizeSentence(sentence: string): string {
  return sentence.toLowerCase().trim().replace(/[^\w\s]/g, '');
}

function getNGrams(text: string, n: number = 3): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const ngrams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  return ngrams;
}

function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function checkUniqueness(description: string): { isUnique: boolean; duplicateSentences: string[] } {
  const sentences = description.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 10);
  const duplicateSentences: string[] = [];

  for (const sentence of sentences) {
    const normalized = normalizeSentence(sentence);
    if (usedSentences.has(normalized)) {
      duplicateSentences.push(sentence);
    }
  }

  // Check similarity to recent descriptions
  const descNGrams = getNGrams(description);
  for (const recentDesc of recentDescriptions) {
    const recentNGrams = getNGrams(recentDesc);
    const similarity = jaccardSimilarity(descNGrams, recentNGrams);
    if (similarity > 0.35) {
      return { isUnique: false, duplicateSentences };
    }
  }

  return { isUnique: duplicateSentences.length === 0, duplicateSentences };
}

function recordDescription(description: string) {
  const sentences = description.split(/[.!?]+/).map(s => normalizeSentence(s.trim())).filter(s => s.length > 10);
  sentences.forEach(s => usedSentences.add(s));
  
  recentDescriptions.push(description);
  if (recentDescriptions.length > MAX_RECENT_DESCRIPTIONS) {
    recentDescriptions.shift();
  }
}

// Load persisted sentences
const SENTENCES_FILE = path.join(__dirname, 'output/seo-sentences.json');
if (fs.existsSync(SENTENCES_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(SENTENCES_FILE, 'utf-8'));
    if (Array.isArray(data.sentences)) {
      data.sentences.forEach((s: string) => usedSentences.add(s));
    }
  } catch (e) {
    // Ignore
  }
}

function saveSentences() {
  const data = { sentences: Array.from(usedSentences) };
  fs.writeFileSync(SENTENCES_FILE, JSON.stringify(data, null, 2));
}

// ============================================================================
// Banned Phrases
// ============================================================================

const BANNED_OPENINGS = [
  "If you're looking for",
  "Look no further",
  "A hidden gem",
  "In the heart of",
  "Located in the heart of",
  "Nestled in the heart of",
];

function containsBannedPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return BANNED_OPENINGS.some(phrase => lower.startsWith(phrase.toLowerCase()));
}

// ============================================================================
// AI Generation
// ============================================================================

const OUTPUT_SCHEMA = z.object({
  description_md: z.string(),
  word_count: z.number().min(150).max(200),
  bold_phrases: z.array(z.string()).min(6).max(12),
});

async function generateWithGemini(prompt: string, seed: number): Promise<string> {
  if (!geminiClient) throw new Error('Gemini not available');
  
  const model = geminiClient.getGenerativeModel({ model: CONFIG.GEMINI_MODEL });
  
  const fullPrompt = `${prompt}

CRITICAL: The description_md field MUST be exactly 150-200 words. Count carefully. This is mandatory. Output ONLY valid JSON, no markdown code fences, no extra text. Use this seed for variation: ${seed}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature: 0.8 + (seed % 100) / 500, // Vary between 0.8-1.0
      maxOutputTokens: 600, // Increased to ensure enough space for 150-200 words
    },
  });

  const response = await result.response;
  return response.text();
}

async function generateWithGroq(prompt: string, seed: number): Promise<string> {
  if (!groqAvailable) throw new Error('Groq not available');

  const fullPrompt = `${prompt}

IMPORTANT: Output ONLY valid JSON, no markdown code fences, no extra text. Use this seed for variation: ${seed}`;

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    {
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
          {
            role: 'user',
            content: fullPrompt,
          },
        ],
        temperature: 0.8 + (seed % 100) / 500,
        max_tokens: 600, // Increased to ensure enough space for 150-200 words
        response_format: { type: 'json_object' },
      }),
    }
  );

  if (!response.ok) {
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const waitMs = parseInt(retryAfter) * 1000;
        await sleep(waitMs + jitter(1000)); // Wait with jitter
        throw new Error('Rate limited - retry after wait');
      }
      // Check rate limit headers
      const resetTokens = response.headers.get('x-ratelimit-reset-tokens');
      const resetRequests = response.headers.get('x-ratelimit-reset-requests');
      if (resetTokens || resetRequests) {
        const resetTime = Math.min(
          resetTokens ? parseInt(resetTokens) : Infinity,
          resetRequests ? parseInt(resetRequests) : Infinity
        );
        const now = Math.floor(Date.now() / 1000);
        const waitSeconds = Math.max(0, resetTime - now);
        if (waitSeconds > 0) {
          await sleep(waitSeconds * 1000 + jitter(1000));
        }
        throw new Error('Rate limited - retry after wait');
      }
      // Default wait if no headers
      await sleep(jitter(5000));
      throw new Error('Rate limited - retry after wait');
    }
    const text = await response.text();
    throw new Error(`Groq API error: ${response.status} ${text}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

async function generateDescription(
  buffet: any,
  facts: any,
  reviewHighlights: string[],
  seed: number
): Promise<{ description: string; provider: string; model: string }> {
  // Build prompt
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

  let lastError: any;
  for (let attempt = 0; attempt < CONFIG.MAX_RETRIES; attempt++) {
    // Get available provider for this attempt (may change if previous was rate limited)
    let provider = getAvailableProvider();
    if (!provider) {
      throw new Error('No available provider');
    }

    try {
      let rawOutput: string;
      let usedProvider = provider;
      let usedModel = provider === 'gemini' ? CONFIG.GEMINI_MODEL : CONFIG.GROQ_MODEL;

      if (provider === 'gemini') {
        rawOutput = await generateWithGemini(prompt, seed);
        markProviderSuccess('gemini');
      } else {
        rawOutput = await generateWithGroq(prompt, seed);
        markProviderSuccess('groq');
      }

      // Clean JSON extraction
      let jsonStr = rawOutput.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Parse JSON
      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        throw new Error(`Invalid JSON: ${e}`);
      }

      // Extract bold phrases from description if not enough provided
      const boldMatches = parsed.description_md?.match(/\*\*([^*]+)\*\*/g) || [];
      const extractedBoldPhrases = boldMatches.map((m: string) => m.replace(/\*\*/g, ''));
      
      // If model didn't provide enough bold phrases, use extracted ones
      if (!parsed.bold_phrases || parsed.bold_phrases.length < 6) {
        if (extractedBoldPhrases.length >= 6) {
          parsed.bold_phrases = extractedBoldPhrases.slice(0, 12);
        } else if (attempt < CONFIG.MAX_RETRIES - 1) {
          // Retry if we can't extract enough either
          throw new Error(`Not enough bold phrases: ${parsed.bold_phrases?.length || 0} provided, ${extractedBoldPhrases.length} extracted`);
        }
      }
      
      // Ensure bold_phrases array is within 6-12 range (truncate if too many)
      if (parsed.bold_phrases && parsed.bold_phrases.length > 12) {
        parsed.bold_phrases = parsed.bold_phrases.slice(0, 12);
      }

      // Validate schema
      const validated = OUTPUT_SCHEMA.parse(parsed);

      // Additional validation
      const wordCount = validated.description_md.split(/\s+/).length;
      
      // Retry if word count is too low or bold phrases insufficient
      if ((wordCount < 150 || validated.bold_phrases.length < 6) && attempt < CONFIG.MAX_RETRIES - 1) {
        if (wordCount < 150) {
          console.log(`  ⚠ Word count ${wordCount} too low, retrying...`);
        } else {
          console.log(`  ⚠ Bold phrases ${validated.bold_phrases.length} insufficient, retrying...`);
        }
        await sleep(jitter(1000));
        continue; // Retry with same provider
      }
      
      if (wordCount < 150 || wordCount > 200) {
        throw new Error(`Word count ${wordCount} not in range 150-200`);
      }

      if (validated.bold_phrases.length < 6) {
        throw new Error(`Not enough bold phrases: ${validated.bold_phrases.length} (minimum 6)`);
      }

      if (validated.word_count !== wordCount) {
        throw new Error(`Word count mismatch: claimed ${validated.word_count}, actual ${wordCount}`);
      }

      // Check for required bold phrase
      const hasLocationBold = validated.bold_phrases.some(p => 
        p.toLowerCase().includes('chinese buffet') && 
        (p.toLowerCase().includes(facts.city.toLowerCase()) || p.toLowerCase().includes(facts.state.toLowerCase()))
      );
      if (!hasLocationBold) {
        throw new Error('Missing required bold phrase with "Chinese buffet" + location');
      }

      // Check for negative terms
      if (containsNegativeTerm(validated.description_md)) {
        throw new Error('Description contains negative terms');
      }

      // Check for banned openings
      if (containsBannedPhrase(validated.description_md)) {
        throw new Error('Description contains banned opening phrase');
      }

      return {
        description: validated.description_md,
        provider: usedProvider,
        model: usedModel,
      };

    } catch (error: any) {
      lastError = error;
      
      // Handle rate limits
      if (error.message?.includes('429') || error.message?.includes('rate limit') || error.status === 429) {
        if (provider === 'gemini') {
          markProvider429('gemini');
        } else {
          markProvider429('groq');
        }
        // Try fallback provider on next attempt
        const fallback = getAvailableProvider();
        if (fallback && fallback !== provider && attempt < CONFIG.MAX_RETRIES - 1) {
          // Will retry with fallback on next iteration
          await sleep(jitter(1000));
          continue;
        }
      }

      // For other errors, wait before retry
      if (attempt < CONFIG.MAX_RETRIES - 1) {
        await sleep(jitter(1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Generation failed after retries');
}

// ============================================================================
// Checkpointing
// ============================================================================

const PROGRESS_FILE = path.join(__dirname, 'output/seo-gen-progress.jsonl');

interface ProgressEntry {
  buffetId: string;
  timestamp: string;
  status: 'success' | 'failed';
  provider?: string;
  model?: string;
  error?: string;
}

function loadProgress(): Set<string> {
  const successful = new Set<string>();
  if (!fs.existsSync(PROGRESS_FILE)) return successful;

  try {
    const lines = fs.readFileSync(PROGRESS_FILE, 'utf-8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      const entry: ProgressEntry = JSON.parse(line);
      if (entry.status === 'success') {
        successful.add(entry.buffetId);
      }
    }
  } catch (e) {
    console.warn('⚠ Could not load progress file');
  }

  return successful;
}

function appendProgress(entry: ProgressEntry) {
  fs.appendFileSync(PROGRESS_FILE, JSON.stringify(entry) + '\n');
}

// ============================================================================
// Main Processing
// ============================================================================

async function fetchBuffetLinkedData(buffetId: string): Promise<{ reviews: any[]; structuredData: any[] }> {
  try {
    const result = await db.query({
      buffets: {
        $: { where: { id: buffetId } },
        reviewRecords: {
          $: { limit: 100 }, // Limit reviews to avoid huge payloads
        },
        structuredData: {},
      },
    });
    
    const buffet = result.buffets?.[0];
    return {
      reviews: buffet?.reviewRecords || [],
      structuredData: buffet?.structuredData || [],
    };
  } catch (error) {
    // If fetching linked data fails, return empty arrays
    console.warn(`  ⚠ Could not fetch linked data for buffet ${buffetId}`);
    return { reviews: [], structuredData: [] };
  }
}

async function processBuffet(buffet: any, concurrencyLimit: any): Promise<void> {
  return concurrencyLimit(async () => {
    const startTime = Date.now();
    
    try {
      // Check if already processed
      if (!CLI_OPTS.force && buffet.seoDescriptionMd) {
        appendProgress({
          buffetId: buffet.id,
          timestamp: new Date().toISOString(),
          status: 'success',
          provider: buffet.seoDescriptionProvider || 'unknown',
          model: buffet.seoDescriptionModel || 'unknown',
        });
        return;
      }

      // Fetch linked data separately to avoid program-limit-exceeded
      const { reviews, structuredData } = await fetchBuffetLinkedData(buffet.id);
      
      // Attach linked data to buffet object for processing
      buffet.reviewRecords = reviews;
      buffet.structuredData = structuredData;

      // Preprocess data
      const facts = extractStructuredDataFacts(buffet);
      const { positiveHighlights, reviewCount } = preprocessReviews(reviews);
      const inputHash = generateInputHash(buffet, positiveHighlights);

      // Check if input hash matches (skip if unchanged)
      if (!CLI_OPTS.force && buffet.seoDescriptionInputHash === inputHash && buffet.seoDescriptionMd) {
        appendProgress({
          buffetId: buffet.id,
          timestamp: new Date().toISOString(),
          status: 'success',
          provider: buffet.seoDescriptionProvider || 'unknown',
          model: buffet.seoDescriptionModel || 'unknown',
        });
        return;
      }

      // Generate seed for variation
      const seed = parseInt(createHash('md5').update(buffet.id).digest('hex').substring(0, 8), 16) % 10000;

      // Generate description
      let result = await generateDescription(buffet, facts, positiveHighlights, seed);
      let description = result.description;

      // Check uniqueness
      const uniqueness = checkUniqueness(description);
      if (!uniqueness.isUnique) {
        // One rewrite attempt
        console.log(`  ⚠ Duplicate detected, rewriting...`);
        const rewritePrompt = `Rewrite the following description with completely different structure and phrasing. Do NOT use these sentences: ${uniqueness.duplicateSentences.join('; ')}`;
        result = await generateDescription(buffet, facts, positiveHighlights, seed + 1000);
        description = result.description;
      }

      // Record for uniqueness tracking
      recordDescription(description);

      // Update database
      if (!CLI_OPTS.dryRun) {
        await db.transact([
          db.tx.buffets[buffet.id].update({
            seoDescriptionMd: description,
            seoDescriptionProvider: result.provider,
            seoDescriptionModel: result.model,
            seoDescriptionGeneratedAt: new Date().toISOString(),
            seoDescriptionInputHash: inputHash,
          }),
        ]);
      }

      const latency = Date.now() - startTime;
      appendProgress({
        buffetId: buffet.id,
        timestamp: new Date().toISOString(),
        status: 'success',
        provider: result.provider,
        model: result.model,
      });

      const wordCount = description.split(/\s+/).length;
      console.log(`✓ [${buffet.name}] ${wordCount} words, ${result.provider}/${result.model}, ${latency}ms`);

    } catch (error: any) {
      const latency = Date.now() - startTime;
      const errorMsg = error.message?.substring(0, 100) || String(error);
      
      appendProgress({
        buffetId: buffet.id,
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: errorMsg,
      });

      console.error(`✗ [${buffet.name}] Error: ${errorMsg} (${latency}ms)`);
      // Don't throw - continue processing
    }
  });
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main() {
  console.log('');
  console.log('='.repeat(80));
  console.log('  SEO Description Generator');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  Providers: ${geminiClient ? '✓ Gemini' : '✗ Gemini'} | ${groqAvailable ? '✓ Groq' : '✗ Groq'}`);
  console.log(`  Options: ${CLI_OPTS.dryRun ? 'DRY-RUN ' : ''}${CLI_OPTS.force ? 'FORCE ' : ''}limit=${CLI_OPTS.limit || 'all'} concurrency=${CLI_OPTS.concurrency || 3}`);
  console.log('');
  console.log('-'.repeat(80));

  // Load progress
  const processedIds = loadProgress();
  console.log(`  ✓ Loaded ${processedIds.size} previously processed buffets from checkpoint`);

  // Fetch ALL buffets using the same pattern as the working generate-all-descriptions.ts script
  console.log('  → Fetching buffets from database...');
  
  let allBuffets: any[] = [];
  let offset = 0;
  const batchLimit = 500; // Fetch in batches of 500 (matching working script pattern)
  const maxLimit = CLI_OPTS.limit || 100000;
  
  try {
    while (allBuffets.length < maxLimit) {
      // Simple query - exactly matching the working script pattern
      const query = {
        buffets: {
          $: { limit: batchLimit, offset },
        },
      };
      
      console.log(`    Fetching batch: offset=${offset}, limit=${batchLimit}...`);
      
      const result = await db.query(query);
      const batch = result.buffets || [];
      
      console.log(`    → Got ${batch.length} buffets`);
      
      if (batch.length === 0) {
        break;
      }
      
      allBuffets = allBuffets.concat(batch);
      offset += batchLimit;
      
      console.log(`  ✓ Total fetched so far: ${allBuffets.length}`);
      
      if (batch.length < batchLimit) {
        break; // Last batch
      }
      
      // Apply CLI limit
      if (CLI_OPTS.limit && allBuffets.length >= CLI_OPTS.limit) {
        allBuffets = allBuffets.slice(0, CLI_OPTS.limit);
        break;
      }
    }
  } catch (error: any) {
    console.error('');
    console.error('  ✗ ERROR fetching buffets from database:');
    console.error(`    Message: ${error.message}`);
    console.error(`    Status: ${error.status}`);
    if (error.body) {
      console.error(`    Body: ${JSON.stringify(error.body, null, 2)}`);
    }
    console.error('');
    console.error('  Possible solutions:');
    console.error('    1. Check your INSTANT_ADMIN_TOKEN is correct');
    console.error('    2. Check InstantDB service status');
    console.error('    3. Try running with --limit 10 to test with fewer records');
    console.error('');
    throw error;
  }
  
  console.log(`  ✓ Total buffets in database: ${allBuffets.length}`);
  console.log('');

  // Filter out already processed buffets
  let buffets = allBuffets;
  if (!CLI_OPTS.force) {
    buffets = allBuffets.filter(b => !processedIds.has(b.id) && !b.seoDescriptionMd);
    console.log(`  ✓ Filtered: ${allBuffets.length - buffets.length} already processed, ${buffets.length} remaining`);
  }
  
  if (buffets.length === 0) {
    console.log('');
    console.log('  ✓ All buffets already have SEO descriptions!');
    console.log('    Use --force to regenerate existing descriptions.');
    console.log('');
    return;
  }

  console.log('');
  console.log('-'.repeat(80));
  console.log(`  Starting processing of ${buffets.length} buffets...`);
  console.log('-'.repeat(80));
  console.log('');

  // Setup concurrency
  const concurrency = CLI_OPTS.concurrency || 3;
  const limit = pLimit(concurrency);
  console.log(`  Concurrency: ${concurrency} parallel requests`);
  console.log('');

  // Process with proper stats tracking
  const stats = {
    processed: 0,
    success: 0,
    failed: 0,
    startTime: Date.now(),
  };

  // Process buffets sequentially with concurrency control for better progress tracking
  for (let i = 0; i < buffets.length; i++) {
    const buffet = buffets[i];
    const startTime = Date.now();
    
    // Progress header
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const rate = stats.processed > 0 ? stats.processed / (elapsed / 60) : 0;
    const eta = rate > 0 ? (buffets.length - stats.processed) / rate : 0;
    
    console.log(`[${i + 1}/${buffets.length}] Processing: ${buffet.name} (${buffet.cityName}, ${buffet.state})`);
    
    try {
      await processBuffet(buffet, limit);
      stats.processed++;
      stats.success++;
    } catch (error: any) {
      stats.processed++;
      stats.failed++;
      console.error(`  ✗ Error: ${error.message?.substring(0, 80) || error}`);
    }
    
    // Detailed progress every 5 records
    if (stats.processed % 5 === 0 || i === buffets.length - 1) {
      const provider = getAvailableProvider() || 'none';
      console.log('');
      console.log(`  ─── Progress: ${stats.processed}/${buffets.length} (${((stats.processed / buffets.length) * 100).toFixed(1)}%) ───`);
      console.log(`  Success: ${stats.success} | Failed: ${stats.failed} | Rate: ${rate.toFixed(1)}/min | ETA: ${eta.toFixed(1)} min`);
      console.log(`  Active provider: ${provider}`);
      console.log('');
    }
  }

  // Save sentences for uniqueness tracking
  saveSentences();

  // Final summary
  const duration = ((Date.now() - stats.startTime) / 1000 / 60).toFixed(1);
  const avgRate = stats.processed > 0 ? (stats.processed / parseFloat(duration)).toFixed(1) : '0';

  console.log('');
  console.log('='.repeat(80));
  console.log('  PROCESSING COMPLETE');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  Total processed: ${stats.processed}`);
  console.log(`  Successful:      ${stats.success}`);
  console.log(`  Failed:          ${stats.failed}`);
  console.log(`  Duration:        ${duration} minutes`);
  console.log(`  Average rate:    ${avgRate} buffets/min`);
  console.log('');
  console.log(`  Progress log:    ${PROGRESS_FILE}`);
  console.log(`  Sentences log:   ${SENTENCES_FILE}`);
  console.log('');
  console.log('='.repeat(80));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
