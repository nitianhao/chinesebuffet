// Query InstantDB to get exact slug format for buffets with menu data

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function queryBuffets() {
  console.log('Connecting to InstantDB...');
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  try {
    console.log('Fetching buffets with menu data...\n');
    
    // Fetch buffets in batches
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    while (true) {
      const result = await db.query({
        buffets: {
          $: {
            limit: limit,
            offset: offset,
          }
        }
      });
      
      const buffets = result.buffets || [];
      if (buffets.length === 0) break;
      
      allBuffets = allBuffets.concat(buffets);
      console.log(`  Fetched ${allBuffets.length} buffets so far...`);
      
      if (buffets.length < limit) break;
      offset += limit;
    }

    console.log(`\nTotal buffets: ${allBuffets.length}\n`);

    // Filter buffets that have menu data
    const buffetsWithMenu = allBuffets.filter(buffet => {
      if (!buffet.menu) return false;
      try {
        const menuData = JSON.parse(buffet.menu);
        return menuData && typeof menuData === 'object' && Object.keys(menuData).length > 0;
      } catch {
        return false;
      }
    });

    console.log(`Buffets with menu data: ${buffetsWithMenu.length}\n`);

    console.log('='.repeat(120));
    console.log('EXACT SLUG VALUES FROM DATABASE:');
    console.log('='.repeat(120));

    // Show sample buffets with menu data
    const sample = buffetsWithMenu.slice(0, 30);
    
    for (const buffet of sample) {
      const citySlug = `${(buffet.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(buffet.stateAbbr || '').toLowerCase()}`;
      const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      
      console.log(`
Name: ${buffet.name}
  slug: "${buffet.slug}"
  cityName: "${buffet.cityName}"
  stateAbbr: "${buffet.stateAbbr}"
  placeId: "${buffet.placeId}"
  Expected URL: ${expectedUrl}`);
    }

    // Summary table
    console.log('\n' + '='.repeat(120));
    console.log('SUMMARY TABLE (all buffets with menu data):');
    console.log('='.repeat(120));
    
    console.log('\n| slug                                     | cityName           | stateAbbr | Expected URL');
    console.log('|' + '-'.repeat(42) + '|' + '-'.repeat(20) + '|' + '-'.repeat(11) + '|' + '-'.repeat(60));
    
    for (const buffet of buffetsWithMenu) {
      const citySlug = `${(buffet.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(buffet.stateAbbr || '').toLowerCase()}`;
      const expectedUrl = `/chinese-buffets/${citySlug}/${buffet.slug}`;
      console.log(`| ${(buffet.slug || '').padEnd(40)} | ${(buffet.cityName || '').padEnd(18)} | ${(buffet.stateAbbr || '').padEnd(9)} | ${expectedUrl}`);
    }

    console.log('\n' + '='.repeat(120));
    console.log('SLUG FORMAT ANALYSIS:');
    console.log('='.repeat(120));
    
    // Analyze slug patterns
    const slugsWithCityCode = buffetsWithMenu.filter(b => {
      // Check if slug contains city code pattern like "los-angeles-ca-"
      const cityPattern = `${(b.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(b.stateAbbr || '').toLowerCase()}`;
      return (b.slug || '').startsWith(cityPattern);
    });
    
    console.log(`\nSlugs that START with city code: ${slugsWithCityCode.length} / ${buffetsWithMenu.length}`);
    
    // Sample slug patterns
    console.log('\nSample slug patterns:');
    buffetsWithMenu.slice(0, 10).forEach(b => {
      const cityPattern = `${(b.cityName || '').toLowerCase().replace(/\s+/g, '-')}-${(b.stateAbbr || '').toLowerCase()}`;
      const containsCity = (b.slug || '').includes(cityPattern);
      console.log(`  "${b.slug}" ${containsCity ? '(CONTAINS city code)' : '(NO city code in slug)'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

queryBuffets().catch(console.error);
