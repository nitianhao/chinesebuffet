// Script to count buffets with images field filled
// Run with: node check-images-count.js
const { init } = require('@instantdb/admin');
const schema = require('./src/instant.schema.ts');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPaths = [
  path.join(__dirname, '.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, 'env.local.txt'),
  path.join(process.cwd(), 'env.local.txt'),
];

for (const envPath of envPaths) {
  try {
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
      break; // Stop after first successful load
    }
  } catch (error) {
    // Continue to next path
  }
}

async function countImages() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('Fetching all buffets...');
  
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  
  // Fetch all buffets in batches
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

  const buffets = allBuffets;
  console.log(`\nTotal buffets: ${buffets.length}\n`);

  let countWithImages = 0;
  let countWithEmptyImages = 0;
  let countWithNullImages = 0;
  let totalImageCount = 0;

  // Check each buffet
  for (const buffet of buffets) {
    if (!buffet.images) {
      countWithNullImages++;
      continue;
    }

    // Parse images if it's a string (JSON)
    let imagesArray = null;
    if (typeof buffet.images === 'string') {
      try {
        const parsed = JSON.parse(buffet.images);
        if (Array.isArray(parsed)) {
          imagesArray = parsed;
        }
      } catch (e) {
        // Not valid JSON, treat as empty
        countWithEmptyImages++;
        continue;
      }
    } else if (Array.isArray(buffet.images)) {
      imagesArray = buffet.images;
    }

    // Check if images array has any valid entries
    if (imagesArray && imagesArray.length > 0) {
      // Filter out empty/null entries
      const validImages = imagesArray.filter(img => {
        if (!img) return false;
        // Check if it's an object with photoUrl
        if (typeof img === 'object' && img.photoUrl) {
          return img.photoUrl.trim().length > 0;
        }
        // Check if it's a string URL
        if (typeof img === 'string') {
          return img.trim().length > 0;
        }
        return false;
      });

      if (validImages.length > 0) {
        countWithImages++;
        totalImageCount += validImages.length;
      } else {
        countWithEmptyImages++;
      }
    } else {
      countWithEmptyImages++;
    }
  }

  console.log('=== Results ===');
  console.log(`Total buffets: ${buffets.length}`);
  console.log(`Buffets with images (non-empty): ${countWithImages}`);
  console.log(`Buffets with empty/null images: ${countWithNullImages + countWithEmptyImages}`);
  console.log(`  - Null/undefined images: ${countWithNullImages}`);
  console.log(`  - Empty arrays or invalid data: ${countWithEmptyImages}`);
  console.log(`Total images across all buffets: ${totalImageCount}`);
  console.log(`Average images per buffet (with images): ${countWithImages > 0 ? (totalImageCount / countWithImages).toFixed(2) : 0}`);
  console.log(`Percentage with images: ${((countWithImages / buffets.length) * 100).toFixed(2)}%`);
}

countImages().catch(console.error);
