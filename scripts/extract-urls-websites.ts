// Script to extract all buffets with URL or website from InstantDB
// Run with: npx tsx scripts/extract-urls-websites.ts

import { init } from '@instantdb/admin';
import schema from '../src/instant.schema';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env.local if it exists
const envPath = path.join(process.cwd(), '.env.local');
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

async function extractUrlsAndWebsites() {
  // Check for required environment variables
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required. Please set it in your .env.local file.');
  }

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 
                process.env.INSTANT_APP_ID || 
                '709e0e09-3347-419b-8daa-bad6889e480d';

  console.log('Initializing InstantDB admin client...');
  const db = init({
    appId: appId,
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('Fetching all buffets from InstantDB...');
  
  // Query all buffets - try with high limit first
  let allBuffets: any[] = [];
  
  try {
    // Try to get all buffets at once with a high limit
    const result = await db.query({
      buffets: {
        $: {
          limit: 20000, // High limit to get all records
        }
      }
    });
    
    allBuffets = result.buffets || [];
    console.log(`Fetched ${allBuffets.length} buffets`);
  } catch (error) {
    console.error('Error with limit query, trying without limit:', error);
    // Fallback: try without limit
    try {
      const result = await db.query({
        buffets: {}
      });
      allBuffets = result.buffets || [];
      console.log(`Fetched ${allBuffets.length} buffets (no limit)`);
    } catch (e) {
      throw new Error(`Failed to fetch buffets: ${e}`);
    }
  }

  console.log(`Total buffets fetched: ${allBuffets.length}`);

  // Filter buffets that have either URL or website
  const buffetsWithUrls = allBuffets.filter(buffet => {
    return (buffet.url && buffet.url.trim() !== '') || 
           (buffet.website && buffet.website.trim() !== '');
  });

  console.log(`Found ${buffetsWithUrls.length} buffets with URL or website`);

  // Extract the required fields
  const extractedData = buffetsWithUrls.map(buffet => ({
    PlaceID: buffet.placeId || null,
    Name: buffet.name || '',
    URL: buffet.url || null,
    website: buffet.website || null,
  }));

  // Save to JSON file
  const outputPath = path.join(process.cwd(), 'data', 'buffets-urls-websites.json');
  const outputDir = path.dirname(outputPath);
  
  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(extractedData, null, 2), 'utf-8');
  
  console.log(`\n✅ Successfully extracted ${extractedData.length} records`);
  console.log(`📁 Saved to: ${outputPath}`);
  
  // Print summary statistics
  const withPlaceID = extractedData.filter(r => r.PlaceID).length;
  const withURL = extractedData.filter(r => r.URL).length;
  const withWebsite = extractedData.filter(r => r.website).length;
  const withBoth = extractedData.filter(r => r.URL && r.website).length;
  
  console.log('\n📊 Summary:');
  console.log(`   Total records: ${extractedData.length}`);
  console.log(`   Records with PlaceID: ${withPlaceID}`);
  console.log(`   Records with URL: ${withURL}`);
  console.log(`   Records with website: ${withWebsite}`);
  console.log(`   Records with both URL and website: ${withBoth}`);

  return extractedData;
}

// Run the script
extractUrlsAndWebsites()
  .then(() => {
    console.log('\n✨ Extraction complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

