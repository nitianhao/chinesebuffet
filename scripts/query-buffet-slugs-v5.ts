// Query InstantDB to get exact slug format for buffets
import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import rules from '../src/instant.perms';
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

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function queryData() {
  console.log('\nQuerying buffets with city links...\n');

  const { data, error } = await db.query({
    buffets: {
      $: {
        limit: 30,
      },
      city: {},
    },
  });

  if (error) {
    console.log('Error:', error);
    return;
  }

  if (!data?.buffets || data.buffets.length === 0) {
    console.log('No buffets found');
    return;
  }

  console.log(`Found ${data.buffets.length} buffets\n`);

  // Filter buffets that have menu data
  const buffetsWithMenu = data.buffets.filter((b: any) => b.menu && b.menu !== '{}' && b.menu !== 'null');
  console.log(`Buffets with menu data: ${buffetsWithMenu.length}\n`);

  console.log('='.repeat(120));
  console.log('EXACT SLUG VALUES FROM DATABASE:');
  console.log('='.repeat(120));
  
  // Show all buffets
  for (const buffet of data.buffets) {
    const citySlug = `${buffet.cityName?.toLowerCase().replace(/\s+/g, '-')}-${buffet.stateAbbr?.toLowerCase()}`;
    const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
    const menuInfo = buffet.menu ? 'YES' : 'NO';
    
    console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  placeId: "${buffet.placeId}"
  hasMenu: ${menuInfo}
  Expected URL: ${expectedUrl}`);
  }
}

queryData().catch(console.error);
