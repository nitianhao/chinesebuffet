// Query InstantDB to get exact slug format for buffets
import { init } from '@instantdb/admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN;

if (!ADMIN_TOKEN) {
  console.error('INSTANT_ADMIN_TOKEN is required');
  process.exit(1);
}

console.log('APP_ID:', APP_ID);
console.log('Has ADMIN_TOKEN:', !!ADMIN_TOKEN);

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
});

async function queryData() {
  console.log('\n1. Querying a single buffet by name pattern...\n');

  // Try querying buffets with a limit
  const { data, error } = await db.query({
    buffets: {
      $: {
        limit: 20,
      },
    },
  });

  if (error) {
    console.log('Error:', error);
    return;
  }

  if (!data?.buffets || data.buffets.length === 0) {
    console.log('No buffets found');
    
    // Let's list what collections exist
    console.log('\nTrying to query cities...');
    const { data: citiesData } = await db.query({
      cities: {
        $: {
          limit: 5,
        },
      },
    });
    console.log('Cities:', citiesData?.cities?.length || 0);
    
    return;
  }

  console.log(`Found ${data.buffets.length} buffets\n`);

  console.log('='.repeat(120));
  console.log('EXACT SLUG VALUES FROM DATABASE:');
  console.log('='.repeat(120));
  
  for (const buffet of data.buffets) {
    const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
    
    console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  placeId: "${buffet.placeId}"
  menu: ${buffet.menu ? 'YES (has data)' : 'NO'}
  Expected URL: ${expectedUrl}`);
  }
}

queryData().catch(console.error);
