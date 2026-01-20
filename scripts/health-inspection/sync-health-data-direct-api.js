/**
 * Sync health inspection data using direct HTTP API (bypasses schema validation)
 * This works even if the schema hasn't been synced yet
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');

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

const APP_ID = '709e0e09-3347-419b-8daa-bad6889e480d';
const ADMIN_TOKEN = process.env.INSTANT_ADMIN_TOKEN || 'b92eae55-f7ea-483c-b41d-4bb02a04629b';

const db = init({
  appId: APP_ID,
  adminToken: ADMIN_TOKEN,
  schema: schema.default || schema,
});

/**
 * Update buffet using direct HTTP API
 */
function updateBuffetDirectAPI(buffetId, healthInspectionData) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      type: 'tx',
      steps: [{
        type: 'update',
        entity: 'buffets',
        id: buffetId,
        attrs: {
          healthInspection: JSON.stringify(healthInspectionData)
        }
      }]
    });

    const options = {
      hostname: 'api.instantdb.com',
      path: '/admin/tx',
      method: 'POST',
      headers: {
        'app-id': APP_ID,
        'Authorization': `Bearer ${ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ success: true, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function syncHealthData() {
  try {
    // Load buffets from JSON
    const buffetsByIdPath = path.join(__dirname, '../../data/buffets-by-id.json');
    const buffetsById = JSON.parse(fs.readFileSync(buffetsByIdPath, 'utf8'));
    const buffetsWithHealth = Object.values(buffetsById).filter(b => b.healthInspection);

    console.log(`Found ${buffetsWithHealth.length} buffets with health inspection data\n`);

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
              where: { slug: buffet.slug },
              limit: 1
            }
          }
        });

        if (result.buffets && result.buffets.length > 0) {
          const dbBuffet = result.buffets[0];
          
          // Use direct HTTP API to bypass schema validation
          await updateBuffetDirectAPI(dbBuffet.id, buffet.healthInspection);
          
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

    console.log(`\n✅ Successfully updated ${updated} buffets`);
    if (errors > 0) {
      console.log(`  ✗ ${errors} errors`);
    }

    // Print test URLs
    if (updated > 0) {
      console.log('\n📋 Test URLs:');
      const cityData = require('../../data/buffets-by-city.json');
      buffetsWithHealth.forEach(b => {
        const citySlug = Object.keys(cityData).find(slug => 
          cityData[slug].buffets.some(b2 => b2.id === b.id)
        );
        if (citySlug) {
          console.log(`  http://localhost:3000/chinese-buffets/${citySlug}/${b.slug}`);
        }
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  syncHealthData();
}

module.exports = { syncHealthData, updateBuffetDirectAPI };
















