/**
 * Quick script to find a buffet ID that has reviews
 * Usage: npx tsx scripts/find-buffet-with-reviews.ts
 */

import { init } from '@instantdb/admin';
// @ts-ignore
import schema from '../src/instant.schema';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

async function findBuffetWithReviews() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Missing INSTANT_ADMIN_TOKEN.');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema
  });

  console.log('Finding buffets with reviews...\n');

  const result = await db.query({
    buffets: {
      $: { limit: 50 },
      reviewRecords: { $: { limit: 10 } }
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

  const withReviews = buffets.filter(b => {
    const reviews = b.reviewRecords || [];
    return reviews.length > 0 && reviews.some(r => {
      const text = r.textTranslated || r.text || '';
      return text.trim().length >= 20;
    });
  });

  if (withReviews.length === 0) {
    console.log('❌ No buffets found with reviews');
    return;
  }

  console.log(`Found ${withReviews.length} buffets with reviews:\n`);

  withReviews.slice(0, 10).forEach((buffet, i) => {
    const reviewCount = buffet.reviewRecords?.length || 0;
    const hasFAQs = buffet.questionsAndAnswers && buffet.questionsAndAnswers.trim().length > 0;
    console.log(`${i + 1}. ${buffet.name || 'Unknown'}`);
    console.log(`   ID: ${buffet.id}`);
    console.log(`   Location: ${buffet.cityName || 'N/A'}, ${buffet.state || 'N/A'}`);
    console.log(`   Reviews: ${reviewCount}`);
    console.log(`   Has FAQs: ${hasFAQs ? 'Yes' : 'No'}`);
    console.log(`   Command: npx tsx scripts/generate-faqs-from-reviews.ts --buffetId ${buffet.id}${hasFAQs ? '' : ' --write'}`);
    console.log('');
  });
}

findBuffetWithReviews().catch(console.error);
