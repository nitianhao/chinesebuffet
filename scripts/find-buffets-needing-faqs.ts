/**
 * Find buffets that have reviews but no FAQs
 * 
 * This script helps identify buffets that need FAQ generation.
 * 
 * Usage:
 *   npx tsx scripts/find-buffets-needing-faqs.ts
 *   npx tsx scripts/find-buffets-needing-faqs.ts --limit 50
 *   npx tsx scripts/find-buffets-needing-faqs.ts --output ids.txt
 */

import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const MIN_REVIEW_TEXT_LENGTH = 20;

async function findBuffetsNeedingFAQs() {
  const argv = process.argv.slice(2);
  const getFlagValue = (flag: string, defaultValue: number | string) => {
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

  const limit = getFlagValue('--limit', 100) as number;
  const outputFile = getFlagValue('--output', '') as string;

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN.');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema
  });

  console.log(`Finding buffets with reviews but no FAQs (limit: ${limit})...\n`);

  // Fetch buffets with reviews
  const fetchLimit = Math.max(limit * 3, 500);
  const result = await db.query({
    buffets: {
      $: { limit: fetchLimit },
      reviewRecords: { $: { limit: 100 } }
    }
  });

  const buffets = (result.buffets || []) as Array<{
    id: string;
    name?: string;
    cityName?: string;
    state?: string;
    questionsAndAnswers?: string | null;
    reviewRecords?: Array<{ id: string; text?: string; textTranslated?: string }>;
  }>;

  console.log(`Fetched ${buffets.length} buffets from database\n`);

  // Filter: has reviews with text, but no FAQs
  const needingFAQs = buffets.filter(b => {
    // Must NOT have FAQs
    if (b.questionsAndAnswers && b.questionsAndAnswers.trim().length > 0) {
      return false;
    }

    // Must have reviews with text
    const reviews = b.reviewRecords || [];
    if (reviews.length === 0) {
      return false;
    }

    const hasText = reviews.some(r => {
      const text = r.textTranslated || r.text || '';
      return text.trim().length >= MIN_REVIEW_TEXT_LENGTH;
    });

    return hasText;
  }).slice(0, limit);

  console.log(`Found ${needingFAQs.length} buffets needing FAQs:\n`);

  if (needingFAQs.length === 0) {
    console.log('No buffets found. This could mean:');
    console.log('  1. All buffets with reviews already have FAQs');
    console.log('  2. Reviews are not linked via reviewRecords relation');
    console.log('  3. Reviews exist but have no text content');
    return;
  }

  // Output results
  const output: string[] = [];
  
  needingFAQs.forEach((buffet, i) => {
    const reviewCount = buffet.reviewRecords?.length || 0;
    const info = {
      index: i + 1,
      id: buffet.id,
      name: buffet.name || 'Unknown',
      location: `${buffet.cityName || 'N/A'}, ${buffet.state || 'N/A'}`,
      reviewCount
    };

    console.log(`${info.index}. ${info.name}`);
    console.log(`   ID: ${info.id}`);
    console.log(`   Location: ${info.location}`);
    console.log(`   Reviews: ${info.reviewCount}`);
    console.log(`   Command: npx tsx scripts/generate-faqs-from-reviews.ts --buffetId ${info.id} --write`);
    console.log('');

    output.push(info.id);
  });

  // Write to file if requested
  if (outputFile) {
    fs.writeFileSync(outputFile, output.join('\n') + '\n');
    console.log(`\n✅ Wrote ${output.length} buffet IDs to ${outputFile}`);
  }

  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`Total buffets fetched: ${buffets.length}`);
  console.log(`Buffets needing FAQs: ${needingFAQs.length}`);
  console.log(`\nTo generate FAQs for all of them:`);
  console.log(`  npx tsx scripts/generate-faqs-from-reviews.ts --limit ${needingFAQs.length} --write`);
}

findBuffetsNeedingFAQs().catch(console.error);
