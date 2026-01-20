// Check a specific buffet that we know has reviews
const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {}

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function checkSpecificBuffet() {
  // Check "China Buffet" which we saw has reviews
  const buffetId = '8b9fa35a-9f77-4992-9aa7-ae1012a4b9af';
  
  console.log(`Checking buffet ID: ${buffetId}\n`);
  
  const result = await db.query({
    buffets: {
      $: { where: { id: buffetId } },
      reviewRecords: {},
    },
  });
  
  const buffet = result.buffets?.[0];
  if (buffet) {
    console.log(`Buffet: ${buffet.name}`);
    console.log(`Review count via reviewRecords: ${buffet.reviewRecords?.length || 0}`);
    
    if (buffet.reviewRecords && buffet.reviewRecords.length > 0) {
      console.log('\nFirst review:');
      console.log(`  Name: ${buffet.reviewRecords[0].name}`);
      console.log(`  Stars: ${buffet.reviewRecords[0].stars}`);
    }
  } else {
    console.log('Buffet not found');
  }
}

checkSpecificBuffet().catch(console.error);







