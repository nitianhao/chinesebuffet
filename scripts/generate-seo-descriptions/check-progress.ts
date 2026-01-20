// Quick script to check how many buffets have SEO descriptions
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

async function checkProgress() {
  console.log('Checking progress...\n');
  
  // Check checkpoint file
  const checkpointPath = path.join(__dirname, 'checkpoint.json');
  if (fs.existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8'));
    console.log('=== CHECKPOINT FILE ===');
    console.log(`Processed: ${checkpoint.processedCount}`);
    console.log(`Errors: ${checkpoint.errorCount}`);
    console.log(`Last processed ID: ${checkpoint.lastProcessedId}`);
    const duration = ((Date.now() - checkpoint.startTime) / 1000 / 60).toFixed(1);
    console.log(`Duration: ${duration} minutes`);
    console.log('');
  } else {
    console.log('No checkpoint file found.\n');
  }
  
  // Check database
  console.log('Fetching buffets from database...');
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
  
  console.log(`\n\nTotal buffets: ${allBuffets.length}`);
  
  // Count buffets with descriptions
  let withDescription = 0;
  let withLongDescription = 0; // > 200 words
  
  for (const buffet of allBuffets) {
    if (buffet.description && buffet.description.trim().length > 50) {
      withDescription++;
      const wordCount = buffet.description.split(/\s+/).length;
      if (wordCount > 200) {
        withLongDescription++;
      }
    }
  }
  
  console.log('\n=== PROGRESS ===');
  console.log(`Buffets with descriptions: ${withDescription} (${((withDescription / allBuffets.length) * 100).toFixed(1)}%)`);
  console.log(`Buffets with long descriptions (>200 words): ${withLongDescription}`);
  console.log(`Buffets without descriptions: ${allBuffets.length - withDescription}`);
  console.log(`Remaining: ${allBuffets.length - withDescription}`);
}

checkProgress().catch(console.error);
