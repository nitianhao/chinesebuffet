/**
 * Sync health inspection data from JSON files to InstantDB
 * Requires INSTANT_ADMIN_TOKEN in .env.local
 */

const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');
const fs = require('fs');
const path = require('path');

// Load environment variables
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

async function syncHealthData() {
  try {
    if (!process.env.INSTANT_ADMIN_TOKEN) {
      throw new Error('INSTANT_ADMIN_TOKEN environment variable not set');
    }
    
    // Load buffets from JSON
    const buffetsByIdPath = path.join(__dirname, '../../data/buffets-by-id.json');
    const buffetsById = JSON.parse(fs.readFileSync(buffetsByIdPath, 'utf8'));
    
    // Get all buffets with health inspection data
    const buffetsWithHealth = Object.values(buffetsById).filter(b => b.healthInspection);
    
    console.log(`Found ${buffetsWithHealth.length} buffets with health inspection data`);
    
    if (buffetsWithHealth.length === 0) {
      console.log('No health inspection data found. Run add-health-data-to-json.js first.');
      return;
    }
    
    let updated = 0;
    let errors = 0;
    
    for (const buffet of buffetsWithHealth) {
      try {
        // Query by slug to get the InstantDB ID
        const result = await db.query({
          buffets: {
            $: {
              where: { slug: buffet.slug }
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
          console.log(`✓ Updated: ${buffet.name}`);
        } else {
          console.log(`⚠ Not found in DB: ${buffet.name}`);
        }
      } catch (error) {
        console.error(`✗ Error updating ${buffet.name}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n✓ Successfully updated ${updated} buffets`);
    if (errors > 0) {
      console.log(`  ✗ ${errors} errors`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('INSTANT_ADMIN_TOKEN')) {
      console.error('\nPlease set INSTANT_ADMIN_TOKEN environment variable in .env.local');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  syncHealthData();
}

module.exports = { syncHealthData };
















