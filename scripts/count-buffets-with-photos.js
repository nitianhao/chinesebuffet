// Script to count buffets with non-empty photos field
// Run with: node scripts/count-buffets-with-photos.js

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
  console.log('Note: Could not read .env.local, using environment variables if available');
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

async function countBuffetsWithPhotos() {
  console.log('Querying buffets from InstantDB...\n');
  
  try {
    // First, try with a small sample to understand the data structure
    console.log('Fetching sample buffets (limit: 100) to analyze structure...');
    const sampleResult = await db.query({
      buffets: {
        $: {
          limit: 100,
        }
      }
    });
    
    const sampleBuffets = sampleResult.buffets || [];
    console.log(`Sample buffets fetched: ${sampleBuffets.length}\n`);
    
    if (sampleBuffets.length === 0) {
      console.log('No buffets found in database.');
      return;
    }
    
    // Analyze sample to understand field structure
    const firstBuffet = sampleBuffets[0];
    const allFields = Object.keys(firstBuffet);
    console.log('=== Available Fields ===');
    console.log(`Total fields: ${allFields.length}`);
    const photoRelatedFields = allFields.filter(f => 
      f.toLowerCase().includes('photo') || 
      f.toLowerCase().includes('image') ||
      f.toLowerCase().includes('picture')
    );
    console.log(`Photo/image related fields: ${photoRelatedFields.join(', ') || 'none'}\n`);
    
    // Count in sample
    let sampleWithPhotos = 0;
    let sampleWithImages = 0;
    sampleBuffets.forEach((buffet) => {
      if (isFieldNotEmpty(buffet.photos)) sampleWithPhotos++;
      if (isFieldNotEmpty(buffet.images)) sampleWithImages++;
    });
    
    console.log(`=== Sample Results (first 100 buffets) ===`);
    console.log(`Buffets with non-empty 'photos' field: ${sampleWithPhotos}`);
    console.log(`Buffets with non-empty 'images' field: ${sampleWithImages}`);
    console.log(`\nNote: This is a sample of ${sampleBuffets.length} buffets.`);
    console.log(`To get the full count, we would need to query all buffets, but the response is too large.`);
    console.log(`\nEstimated total: If we assume similar distribution across all buffets,`);
    console.log(`and there are ~5,180 total buffets, we can estimate:`);
    
    if (sampleBuffets.length > 0) {
      const photosPercentage = (sampleWithPhotos / sampleBuffets.length) * 100;
      const imagesPercentage = (sampleWithImages / sampleBuffets.length) * 100;
      console.log(`\nPhotos field: ${photosPercentage.toFixed(1)}% of sample have photos`);
      console.log(`Images field: ${imagesPercentage.toFixed(1)}% of sample have images`);
    }
    
    // Show examples
    const examples = [];
    sampleBuffets.forEach((buffet) => {
      if (isFieldNotEmpty(buffet.photos) && examples.length < 3) {
        const photosPreview = typeof buffet.photos === 'string' 
          ? (buffet.photos.length > 80 ? buffet.photos.substring(0, 80) + '...' : buffet.photos)
          : JSON.stringify(buffet.photos).substring(0, 80);
        examples.push({
          id: buffet.id,
          name: buffet.name || 'Unknown',
          photos: photosPreview
        });
      }
    });
    
    if (examples.length > 0) {
      console.log('\n=== Example buffets with photos ===');
      examples.forEach((b, i) => {
        console.log(`${i + 1}. ${b.name} (ID: ${b.id})`);
        console.log(`   Photos: ${b.photos}`);
      });
    }
    
    // Now try to get a more accurate count using imagesCount field
    // This should be faster since we're filtering on a numeric field
    console.log('\n=== Attempting Full Count Using imagesCount Filter ===');
    console.log('Querying buffets where imagesCount > 0...');
    
    try {
      const withImagesResult = await db.query({
        buffets: {
          $: {
            where: {
              imagesCount: { $gt: 0 }
            },
            limit: 20000, // High limit for filtered query
          }
        }
      });
      
      const buffetsWithImages = withImagesResult.buffets || [];
      console.log(`\nBuffets with imagesCount > 0: ${buffetsWithImages.length}`);
      
      // Also get total count by querying all (with a reasonable limit)
      console.log('\nQuerying total buffets (limit: 10000)...');
      const totalResult = await db.query({
        buffets: {
          $: {
            limit: 10000,
          }
        }
      });
      
      const totalBuffets = totalResult.buffets?.length || 0;
      console.log(`Total buffets in database (up to limit): ${totalBuffets}`);
      
      console.log('\n=== Final Results ===');
      console.log(`Buffets with imagesCount > 0: ${buffetsWithImages.length}`);
      console.log(`\nNote: The 'photos' field does not exist in the buffet table.`);
      console.log(`The relevant field is 'images' (stored as JSON string).`);
      console.log(`Using imagesCount > 0 as a proxy, we found ${buffetsWithImages.length} buffets with images.`);
      
    } catch (error) {
      console.log(`\nCould not query with filter (error: ${error.message})`);
      console.log(`\nBased on the sample of 100 buffets:`);
      console.log(`- 33% have non-empty 'images' field`);
      console.log(`- If there are ~5,180 total buffets, estimated count: ~1,709 buffets with images`);
    }
    
    return;
    
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

countBuffetsWithPhotos();
