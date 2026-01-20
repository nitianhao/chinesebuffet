/**
 * Auto-sync health inspection data once schema is ready
 * This script will retry until the schema is synced
 */

const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');
const fs = require('fs');
const path = require('path');

// Load environment
try {
  const envPath = path.join(__dirname, '../../.env.local');
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
} catch (error) {
  // Silently fail
}

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function syncWhenReady() {
  const buffetsByIdPath = path.join(__dirname, '../../data/buffets-by-id.json');
  const buffetsById = JSON.parse(fs.readFileSync(buffetsByIdPath, 'utf8'));
  const buffetsWithHealth = Object.values(buffetsById).filter(b => b.healthInspection);
  
  console.log(`Found ${buffetsWithHealth.length} buffets with health inspection data\n`);
  console.log('Waiting for schema to sync...');
  console.log('(Make sure your Next.js app is running: npm run dev)\n');
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Attempt ${attempts}/${maxAttempts}...`);
    
    let success = false;
    let updated = 0;
    
    for (const buffet of buffetsWithHealth) {
      try {
        const result = await db.query({
          buffets: {
            $: {
              where: { slug: buffet.slug },
              limit: 1
            }
          }
        });
        
        if (result.buffets && result.buffets.length > 0) {
          const dbBuffet = result.buffets[0];
          
          await db.transact([
            db.tx.buffets[dbBuffet.id].update({
              healthInspection: JSON.stringify(buffet.healthInspection),
            }),
          ]);
          
          updated++;
          success = true;
          console.log(`  ✓ Updated: ${buffet.name}`);
        }
      } catch (error) {
        if (!error.message.includes('Attributes are missing')) {
          console.log(`  ✗ Error: ${error.message}`);
        }
      }
    }
    
    if (success && updated === buffetsWithHealth.length) {
      console.log(`\n✅ Successfully updated all ${updated} buffets!`);
      console.log('\nTest URLs:');
      buffetsWithHealth.forEach(b => {
        const cityData = require('../../data/buffets-by-city.json');
        const citySlug = Object.keys(cityData).find(slug => 
          cityData[slug].buffets.some(b2 => b2.id === b.id)
        );
        if (citySlug) {
          console.log(`  http://localhost:3000/chinese-buffets/${citySlug}/${b.slug}`);
        }
      });
      return;
    }
    
    if (attempts < maxAttempts) {
      console.log('Schema not ready yet, waiting 3 seconds...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n⚠ Schema sync timeout. Please ensure:');
  console.log('  1. Your Next.js app is running (npm run dev)');
  console.log('  2. The schema has been synced');
  console.log('  3. Then run this script again');
}

if (require.main === module) {
  syncWhenReady().catch(console.error);
}

module.exports = { syncWhenReady };
















