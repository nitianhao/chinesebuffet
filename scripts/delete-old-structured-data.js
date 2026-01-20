// Quick script to delete old structuredData records with type 'additionalServiceOptions'
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
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

(async () => {
  try {
    const result = await db.query({
      structuredData: {
        $: { where: { type: 'additionalServiceOptions' } }
      }
    });
    
    if (result.structuredData && result.structuredData.length > 0) {
      console.log(`Found ${result.structuredData.length} old record(s) to delete`);
      for (const record of result.structuredData) {
        await db.transact([db.tx.structuredData[record.id].delete()]);
        console.log(`✓ Deleted record ${record.id} (type: ${record.type})`);
      }
      console.log('✓ All old records deleted');
    } else {
      console.log('✓ No old records found');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
