// Script to check if "photos" field exists in buffets table
// Run with: node scripts/check-photos-field.js

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

async function checkPhotosField() {
  console.log('Checking if "photos" field exists in buffets table...\n');
  
  try {
    // Query a sample of buffets to check actual fields
    const result = await db.query({
      buffets: {
        $: {
          limit: 10,
        }
      }
    });
    
    const buffets = result.buffets || [];
    
    if (buffets.length === 0) {
      console.log('No buffets found in database.');
      return;
    }
    
    console.log(`Checking ${buffets.length} sample buffets...\n`);
    
    // Check if "photos" field exists in any buffet
    let hasPhotosField = false;
    let photosFieldCount = 0;
    let photosFieldValues = [];
    
    buffets.forEach((buffet, index) => {
      const fields = Object.keys(buffet);
      
      if (fields.includes('photos')) {
        hasPhotosField = true;
        photosFieldCount++;
        const photosValue = buffet.photos;
        const isNotEmpty = photosValue !== null && photosValue !== undefined && photosValue !== '';
        photosFieldValues.push({
          index: index + 1,
          id: buffet.id,
          name: buffet.name || 'Unknown',
          hasValue: isNotEmpty,
          valueType: typeof photosValue,
          valuePreview: typeof photosValue === 'string' 
            ? (photosValue.length > 50 ? photosValue.substring(0, 50) + '...' : photosValue)
            : String(photosValue).substring(0, 50)
        });
      }
    });
    
    // Also check all field names to see what's available
    const allFields = new Set();
    buffets.forEach(buffet => {
      Object.keys(buffet).forEach(field => allFields.add(field));
    });
    
    console.log('=== Field Check Results ===');
    console.log(`"photos" field exists: ${hasPhotosField ? 'YES' : 'NO'}`);
    
    if (hasPhotosField) {
      console.log(`\nFound "photos" field in ${photosFieldCount} out of ${buffets.length} sample buffets`);
      console.log('\n=== Sample "photos" field values ===');
      photosFieldValues.forEach(item => {
        console.log(`${item.index}. ${item.name} (ID: ${item.id})`);
        console.log(`   Has value: ${item.hasValue}`);
        console.log(`   Type: ${item.valueType}`);
        console.log(`   Preview: ${item.valuePreview}`);
      });
    } else {
      console.log('\n"photos" field NOT found in any sample buffets.');
    }
    
    // Show photo/image related fields that DO exist
    const photoRelatedFields = Array.from(allFields).filter(f => 
      f.toLowerCase().includes('photo') || 
      f.toLowerCase().includes('image') ||
      f.toLowerCase().includes('picture')
    );
    
    console.log('\n=== Photo/Image Related Fields That DO Exist ===');
    if (photoRelatedFields.length > 0) {
      photoRelatedFields.forEach(field => {
        console.log(`- ${field}`);
      });
    } else {
      console.log('None found');
    }
    
    console.log('\n=== All Fields in Buffet Table ===');
    console.log(`Total fields: ${allFields.size}`);
    const sortedFields = Array.from(allFields).sort();
    console.log(`Fields: ${sortedFields.join(', ')}`);
    
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

checkPhotosField();
