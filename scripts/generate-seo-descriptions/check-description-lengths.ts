// Check description lengths to see how many long descriptions we have
import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
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
      if (key && value) process.env[key] = value;
    }
  });
}

const envPath = path.join(__dirname, '../../.env.local');
if (fs.existsSync(envPath)) loadEnvFile(envPath);

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('ERROR: INSTANT_ADMIN_TOKEN is not set');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  schema: schema.default || schema,
});

async function checkDescriptionLengths() {
  console.log('Fetching all buffets and checking description lengths...\n');
  
  let allBuffets: any[] = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      buffets: {
        $: { limit, offset },
      },
    });
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;
    allBuffets = allBuffets.concat(buffets);
    if (buffets.length < limit) break;
    offset += limit;
    process.stdout.write(`\rFetched ${allBuffets.length} buffets...`);
  }
  
  console.log(`\n\nTotal buffets: ${allBuffets.length}\n`);
  
  // Analyze description lengths
  let withDescription = 0;
  let noDescription = 0;
  let shortDescriptions = 0; // < 150 words
  let mediumDescriptions = 0; // 150-200 words
  let longDescriptions = 0; // 200-300 words
  let veryLongDescriptions = 0; // > 300 words
  let totalWords = 0;
  const wordCounts: number[] = [];
  
  for (const buffet of allBuffets) {
    if (buffet.description && buffet.description.trim().length > 50) {
      withDescription++;
      const wordCount = buffet.description.split(/\s+/).length;
      wordCounts.push(wordCount);
      totalWords += wordCount;
      
      if (wordCount < 150) {
        shortDescriptions++;
      } else if (wordCount < 200) {
        mediumDescriptions++;
      } else if (wordCount <= 300) {
        longDescriptions++;
      } else {
        veryLongDescriptions++;
      }
    } else {
      noDescription++;
    }
  }
  
  const avgWords = withDescription > 0 ? (totalWords / withDescription).toFixed(1) : 0;
  const minWords = wordCounts.length > 0 ? Math.min(...wordCounts) : 0;
  const maxWords = wordCounts.length > 0 ? Math.max(...wordCounts) : 0;
  
  console.log('=== DESCRIPTION LENGTH ANALYSIS ===');
  console.log(`Buffets with descriptions: ${withDescription} (${((withDescription / allBuffets.length) * 100).toFixed(1)}%)`);
  console.log(`Buffets without descriptions: ${noDescription}`);
  console.log('');
  console.log('Word count distribution:');
  console.log(`  Short (< 150 words): ${shortDescriptions}`);
  console.log(`  Medium (150-200 words): ${mediumDescriptions}`);
  console.log(`  Long (200-300 words): ${longDescriptions}`);
  console.log(`  Very Long (> 300 words): ${veryLongDescriptions}`);
  console.log('');
  console.log(`Total long descriptions (200+ words): ${longDescriptions + veryLongDescriptions}`);
  console.log('');
  console.log('Statistics:');
  console.log(`  Average words: ${avgWords}`);
  console.log(`  Min words: ${minWords}`);
  console.log(`  Max words: ${maxWords}`);
  console.log('');
  console.log(`Remaining to process: ${noDescription} buffets`);
}

checkDescriptionLengths().catch(console.error);
