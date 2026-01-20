import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function countHasTvRecords() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('INSTANT_ADMIN_TOKEN is required');
    process.exit(1);
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log("Fetching structuredData records with type = 'hasTv'...");
    
    // Query structuredData records filtered by type
    const result = await db.query({
      structuredData: {
        $: {
          where: { type: 'hasTv' },
          limit: 100000, // High limit to get all matching records
        }
      }
    });

    const records = result.structuredData || [];
    const count = records.length;

    console.log(`\n=== Result ===`);
    console.log(`Found ${count} records with type = 'hasTv'`);
    
    return count;
  } catch (error) {
    console.error('Error querying structuredData:', error);
    throw error;
  }
}

countHasTvRecords()
  .then((count) => {
    console.log(`\nTotal count: ${count}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
