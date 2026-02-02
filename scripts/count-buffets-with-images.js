// Script to count buffets with non-empty images field
// Run with: node scripts/count-buffets-with-images.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
try {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
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
  // Ignore errors reading .env.local - environment variables may be set another way
}

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

function isFieldNotEmpty(fieldValue) {
  if (!fieldValue) return false;
  if (typeof fieldValue === 'string') {
    const trimmed = fieldValue.trim();
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false;
    // Check if it's a JSON string that parses to an empty array or object
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (typeof parsed === 'object') return Object.keys(parsed).length > 0;
      return true;
    } catch {
      // Not valid JSON, treat as regular string
      return trimmed.length > 0;
    }
  }
  if (Array.isArray(fieldValue)) return fieldValue.length > 0;
  if (typeof fieldValue === 'object') return Object.keys(fieldValue).length > 0;
  return true;
}

async function countBuffetsWithImages() {
  console.log('Counting buffets with non-empty "images" field...\n');
  
  try {
    // First, try using imagesCount > 0 as a filter (more efficient)
    console.log('Method 1: Using imagesCount > 0 filter...');
    let withImagesCount = 0;
    try {
      const result = await db.query({
        buffets: {
          $: {
            where: {
              imagesCount: { $gt: 0 }
            },
            limit: 20000,
          }
        }
      });
      withImagesCount = result.buffets?.length || 0;
      console.log(`✓ Found ${withImagesCount} buffets with imagesCount > 0`);
    } catch (error) {
      console.log(`✗ Could not query with filter: ${error.message}`);
    }
    
    // Also check a sample to verify the images field itself
    console.log('\nMethod 2: Sampling buffets to check "images" field directly...');
    const sampleResult = await db.query({
      buffets: {
        $: {
          limit: 1000,
        }
      }
    });
    
    const sampleBuffets = sampleResult.buffets || [];
    console.log(`Sampled ${sampleBuffets.length} buffets`);
    
    let withImagesField = 0;
    let withImagesCountField = 0;
    let examples = [];
    
    sampleBuffets.forEach((buffet) => {
      const hasImages = isFieldNotEmpty(buffet.images);
      const hasImagesCount = buffet.imagesCount && buffet.imagesCount > 0;
      
      if (hasImages) {
        withImagesField++;
        if (examples.length < 5) {
          let imagesPreview = 'N/A';
          try {
            if (typeof buffet.images === 'string') {
              const parsed = JSON.parse(buffet.images);
              if (Array.isArray(parsed)) {
                imagesPreview = `Array with ${parsed.length} items`;
                if (parsed.length > 0 && parsed[0]) {
                  imagesPreview += ` (first item: ${JSON.stringify(parsed[0]).substring(0, 60)}...)`;
                }
              } else {
                imagesPreview = `Object with ${Object.keys(parsed).length} keys`;
              }
            }
          } catch (e) {
            imagesPreview = typeof buffet.images === 'string' 
              ? buffet.images.substring(0, 80) + '...'
              : String(buffet.images);
          }
          
          examples.push({
            id: buffet.id,
            name: buffet.name || 'Unknown',
            imagesCount: buffet.imagesCount || 0,
            imagesPreview: imagesPreview
          });
        }
      }
      
      if (hasImagesCount) {
        withImagesCountField++;
      }
    });
    
    const percentage = sampleBuffets.length > 0 
      ? ((withImagesField / sampleBuffets.length) * 100).toFixed(1)
      : 0;
    
    console.log(`\n=== Results from Sample ===`);
    console.log(`Buffets with non-empty "images" field: ${withImagesField} out of ${sampleBuffets.length} (${percentage}%)`);
    console.log(`Buffets with imagesCount > 0: ${withImagesCountField} out of ${sampleBuffets.length}`);
    
    if (withImagesCount > 0) {
      console.log(`\n=== Estimated Total Count ===`);
      console.log(`Using imagesCount > 0 filter: ${withImagesCount} buffets`);
      console.log(`\nThis is the most accurate count available.`);
    }
    
    if (examples.length > 0) {
      console.log('\n=== Example Buffets with Images ===');
      examples.forEach((b, i) => {
        console.log(`${i + 1}. ${b.name} (ID: ${b.id})`);
        console.log(`   imagesCount: ${b.imagesCount}`);
        console.log(`   images field: ${b.imagesPreview}`);
      });
    }
    
    // Final answer
    console.log('\n=== Final Answer ===');
    if (withImagesCount > 0) {
      console.log(`Number of buffets with non-empty "images" field: ${withImagesCount}`);
    } else {
      console.log(`Based on sample: ~${withImagesField} buffets have non-empty "images" field`);
      console.log(`(Sample size: ${sampleBuffets.length} buffets)`);
    }
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

countBuffetsWithImages();
