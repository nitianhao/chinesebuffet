// Count how many buffet records have non-empty "images" field.
// Run: node scripts/count-images-field.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

function isFieldNotEmpty(fieldValue) {
  if (fieldValue == null) return false;
  if (typeof fieldValue === 'string') {
    const trimmed = fieldValue.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
      return true;
    } catch {
      return trimmed.length > 0;
    }
  }
  if (Array.isArray(fieldValue)) return fieldValue.length > 0;
  if (typeof fieldValue === 'object') return Object.keys(fieldValue).length > 0;
  return true;
}

async function main() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('INSTANT_ADMIN_TOKEN is required');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  let total = 0;
  let withImages = 0;
  let offset = 0;
  // Small batches: Instant DB returns full records (including huge images/reviews),
  // so large pages hit Node's "string longer than 0x1fffffe8" limit.
  const limit = 50;

  console.log('Counting buffets with non-empty "images" field...\n');

  while (true) {
    const result = await db.query({
      buffets: { $: { limit, offset } },
    });
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;

    for (const b of buffets) {
      total++;
      if (isFieldNotEmpty(b.images)) withImages++;
    }
    console.log(`  Scanned ${total} buffets, ${withImages} with non-empty images so far...`);
    if (buffets.length < limit) break;
    offset += limit;
  }

  console.log('\n--- Result ---');
  console.log(`Total buffet records: ${total}`);
  console.log(`Records with non-empty "images" field: ${withImages}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
