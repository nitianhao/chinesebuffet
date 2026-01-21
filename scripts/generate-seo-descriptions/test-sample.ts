// Test script to generate sample SEO descriptions for first 3 buffets
// This is a readonly test - does not modify the database

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../../src/instant.schema';

// Support multiple AI providers - will be initialized after env loading
let aiProvider: 'gemini' | 'groq' | 'openai' | null = null;
let aiClient: any = null;

// Load environment variables from .env.local
import * as fs from 'fs';
import * as path from 'path';

// Simple env file loader - handles various formats
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  let loadedCount = 0;
  content.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    
    // Handle KEY=VALUE format (with or without quotes)
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();
      
      // Remove surrounding quotes if present
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
    console.log(`Loaded ${loadedCount} environment variables from ${filePath}`);
    // Debug: show which keys were loaded (without values)
    const loadedKeys: string[] = [];
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          if (key && process.env[key]) {
            loadedKeys.push(key);
          }
        }
      }
    });
    console.log(`Loaded keys: ${loadedKeys.join(', ')}`);
  }
}

// Load .env.local from project root - try multiple paths
const possiblePaths = [
  path.join(__dirname, '../../.env.local'),
  path.join(process.cwd(), '.env.local'),
  '.env.local'
];

for (const envPath of possiblePaths) {
  if (fs.existsSync(envPath)) {
    loadEnvFile(envPath);
    break; // Load from first found file
  }
}

// Check for API keys from command line args
const apiKeyFromArg = process.argv.find(arg => arg.startsWith('--api-key='))?.split('=')[1];
if (apiKeyFromArg) {
  process.env.OPENAI_API_KEY = apiKeyFromArg;
}

const geminiKeyFromArg = process.argv.find(arg => arg.startsWith('--gemini-key='))?.split('=')[1];
if (geminiKeyFromArg) {
  process.env.GEMINI_API_KEY = geminiKeyFromArg;
}

const groqKeyFromArg = process.argv.find(arg => arg.startsWith('--groq-key='))?.split('=')[1];
if (groqKeyFromArg) {
  process.env.GROQ_API_KEY = groqKeyFromArg;
}

// Initialize AI provider (priority: Gemini free tier > Groq cheap > OpenAI)
const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
if (googleKey) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    aiClient = new GoogleGenerativeAI(googleKey);
    aiProvider = 'gemini';
    console.log('✓ Using Google Gemini (free tier)');
  } catch (e) {
    console.error('Error initializing Gemini:', e);
  }
} else {
  console.log('No Google API key found. Checked: GOOGLE_API_KEY, GEMINI_API_KEY');
}

if (!aiProvider && process.env.GROQ_API_KEY) {
  try {
    const Groq = require('groq-sdk');
    aiClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    aiProvider = 'groq';
    console.log('✓ Using Groq (fast & cheap)');
  } catch (e) {
    // Package not installed, continue
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
  
  // Also check structuredData if available
  const structuredDataList = buffet.structuredData 
    ? (Array.isArray(buffet.structuredData) ? buffet.structuredData : [buffet.structuredData])
    : [];
  
  // Organize structuredData by group
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

Requirements:
- Length: 200-350 words (flexible based on available data)
- Include location-based keywords naturally (e.g., "buffet in [City]", "[City] buffet")
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
- Structure: Opening hook → Main content (atmosphere/food variety/amenities) → Practical info (parking/payment/accessibility/service options) → Closing highlight

Format the description as flowing paragraphs, not bullet points. Make sure to naturally weave in ALL available information about amenities, payment methods, atmosphere, and accessibility.

BUFFET DATA:
{buffetData}

Generate the SEO-optimized description:`;

async function generateDescription(buffetData: string): Promise<string> {
  const prompt = SEO_PROMPT_TEMPLATE.replace('{buffetData}', buffetData);
  
  if (aiProvider === 'gemini') {
    // Try using the SDK first, which handles model selection better
    try {
      const model = aiClient.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text() || '';
    } catch (e: any) {
      // If SDK fails, try REST API with different endpoints
      const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      
      // Try the text-bison model (older but more stable)
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta2/models/text-bison-001:generateText?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: { text: prompt } })
        });
        
        if (response.ok) {
          const data = await response.json();
          return data.candidates?.[0]?.output || '';
        }
      } catch (restError) {
        // Fall through to error
      }
      
      throw new Error(`Gemini API error: ${e.message || 'Model not available. You may need to enable the Generative AI API in Google Cloud Console.'}`);
    }
  } else if (aiProvider === 'groq') {
    const response = await aiClient.chat.completions.create({
      model: 'llama-3.1-8b-instant', // Smaller, faster model with separate quota // Current model - fast and cheap
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
      max_tokens: 500,
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
      max_tokens: 500,
    });
    return response.choices[0]?.message?.content || '';
  }
  
  throw new Error('No AI provider configured');
}

async function main() {
  console.log('Fetching first 3 buffets from database...\n');
  
  try {
    // Query first 3 buffets with all related data
    const result = await db.query({
      buffets: {
        $: { limit: 3 },
        city: {},
        structuredData: {
          $: {},
        },
      },
    });
    
    const buffets = result.buffets || [];
    
    if (buffets.length === 0) {
      console.log('No buffets found in database.');
      return;
    }
    
    console.log(`Found ${buffets.length} buffets. Generating sample descriptions...\n`);
    console.log('='.repeat(80));
    
    for (let i = 0; i < buffets.length; i++) {
      const buffet = buffets[i];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`BUFFET ${i + 1}: ${buffet.name}`);
      console.log(`${'='.repeat(80)}\n`);
      
      // Show raw data
      console.log('RAW DATA:');
      const formattedData = formatBuffetDataForPrompt(buffet);
      console.log(formattedData);
      console.log('\n' + '-'.repeat(80) + '\n');
      
      // Extract additionalInfo for example
      const additionalInfo = extractAdditionalInfo(buffet);
      
      // Debug: Show what additionalInfo we found
      if (Object.keys(additionalInfo).length > 0) {
        console.log('ADDITIONAL INFO FOUND:');
        Object.keys(additionalInfo).forEach(key => {
          const items = additionalInfo[key]
            .filter((item: any) => Object.values(item)[0] === true)
            .map((item: any) => Object.keys(item)[0]);
          if (items.length > 0) {
            console.log(`  ${key}: ${items.join(', ')}`);
          }
        });
        console.log('');
      } else {
        console.log('NOTE: No additionalInfo found in database for this buffet.\n');
      }
      
      // Generate description
      console.log('GENERATED SEO DESCRIPTION:');
      if (!aiProvider || !aiClient) {
        console.log('(Skipped - No AI API key configured)');
        console.log('');
        console.log('To enable description generation, add one of these to .env.local:');
        console.log('  - GOOGLE_API_KEY=xxx (FREE tier available at https://makersuite.google.com/app/apikey)');
        console.log('  - GROQ_API_KEY=xxx (Cheap & fast, get at https://console.groq.com)');
        console.log('  - OPENAI_API_KEY=xxx (More expensive)');
        console.log('');
        console.log('Example of what the description would look like:');
        console.log('─'.repeat(80));
        
        const categories = parseJsonField(buffet.categories) || [];
        const categoryText = categories.length > 0 ? categories.slice(0, 2).join(' and ') : 'international';
        const reviewsTags = parseJsonField(buffet.reviewsTags) || [];
        const topTags = reviewsTags.slice(0, 3).map((t: any) => t.title).join(', ');
        
        console.log(`Experience an exceptional all-you-can-eat buffet experience at ${buffet.name} in ${buffet.cityName}, ${buffet.state}. This family-friendly buffet restaurant offers a diverse selection of ${categoryText} cuisine, perfect for casual dining and special occasions alike.`);
        console.log('');
        console.log(`With a ${buffet.rating || 'strong'} rating from ${buffet.reviewsCount || 'numerous'} customer reviews, ${buffet.name} has established itself as a go-to destination for buffet enthusiasts in ${buffet.cityName}. ${topTags ? `Popular menu items include ${topTags},` : ''} and the restaurant features ${additionalInfo.Amenities ? 'excellent amenities' : 'comfortable dining spaces'} and ${additionalInfo.Accessibility ? 'full accessibility accommodations' : 'welcoming atmosphere'}, ensuring a pleasant experience for all guests.`);
        console.log('');
        if (additionalInfo.Payments) {
          const payments = additionalInfo.Payments.filter((p: any) => Object.values(p)[0] === true).map((p: any) => Object.keys(p)[0]).join(', ');
          if (payments) {
            console.log(`Convenient payment options including ${payments} are accepted, and ${additionalInfo['Service options'] ? 'multiple service options' : 'dine-in service'} are available.`);
          }
        }
        console.log('─'.repeat(80));
      } else {
        try {
          let description = await generateDescription(formattedData);
          
          // Post-process to fix any "In the heart of" openings
          if (description) {
            const trimmed = description.trim();
            const lower = trimmed.toLowerCase();
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
                description = `${newOpening}. ${trimmed.substring(firstPeriod + 1).trim()}`;
              } else {
                description = `${newOpening}${trimmed.substring(200)}`;
              }
            }
          }
          
          console.log(description);
          console.log(`\nWord count: ${description.split(/\s+/).length}`);
        } catch (error) {
          console.error('Error generating description:', error);
        }
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    console.log('\nSample generation complete! Review the outputs above.');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main().catch(console.error);
