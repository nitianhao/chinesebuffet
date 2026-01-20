const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
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

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
});

function collectKeys(value, keys) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectKeys(item, keys));
    return;
  }
  if (typeof value === 'object') {
    Object.keys(value).forEach((k) => {
      keys.add(k);
      collectKeys(value[k], keys);
    });
  }
}

async function audit() {
  const result = await db.query({
    structuredData: { $: { limit: 100000 } },
  });

  const records = result.structuredData || [];
  const byGroup = new Map();
  const byType = new Map();

  for (const record of records) {
    const group = record.group ?? '(null)';
    const type = record.type ?? '(null)';
    const data = record.data;

    if (!byGroup.has(group)) byGroup.set(group, { count: 0, keys: new Set() });
    if (!byType.has(type)) byType.set(type, { count: 0, keys: new Set() });

    byGroup.get(group).count++;
    byType.get(type).count++;

    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      collectKeys(parsed, byGroup.get(group).keys);
      collectKeys(parsed, byType.get(type).keys);
    } catch {
      // ignore parse errors
    }
  }

  console.log('=== Groups ===');
  for (const [group, info] of byGroup.entries()) {
    console.log(`${group}: ${info.count} records`);
    const keys = Array.from(info.keys).slice(0, 25);
    if (keys.length) console.log(`  sample keys: ${keys.join(', ')}`);
  }

  console.log('\n=== Types ===');
  for (const [type, info] of byType.entries()) {
    console.log(`${type}: ${info.count} records`);
    const keys = Array.from(info.keys).slice(0, 25);
    if (keys.length) console.log(`  sample keys: ${keys.join(', ')}`);
  }
}

audit()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
