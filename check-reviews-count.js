// Script to count how many buffets have the "reviews" field filled out

const { init } = require('@instantdb/admin');
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

async function countReviews() {
  console.log('Connecting to InstantDB...');
  
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  });

  try {
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
    console.log(`\nFound ${buffets.length} buffets total\n`);

    let countWithReviews = 0;
    let countWithValidReviews = 0;
    let countWithEmptyReviews = 0;
    let totalReviewCount = 0;

    // Check each buffet
    for (const buffet of buffets) {
      // Check if reviews field exists and is not null/empty
      if (buffet.reviews) {
        const reviewsStr = buffet.reviews.trim();
        
        // Check if it's not just an empty string
        if (reviewsStr.length > 0) {
          countWithReviews++;
          
          // Try to parse as JSON to check if it's valid
          try {
            const reviews = JSON.parse(reviewsStr);
            // Check if it's not just an empty array
            if (Array.isArray(reviews) && reviews.length > 0) {
              countWithValidReviews++;
              totalReviewCount += reviews.length;
            } else if (typeof reviews === 'object' && reviews !== null && Object.keys(reviews).length > 0) {
              countWithValidReviews++;
            } else {
              countWithEmptyReviews++;
            }
          } catch (e) {
            // Invalid JSON but has content, count it anyway
            countWithValidReviews++;
          }
        }
      }
    }

    const results = {
      totalBuffets: buffets.length,
      countWithReviews,
      countWithValidReviews,
      countWithEmptyReviews,
      countWithoutReviews: buffets.length - countWithReviews,
      totalReviewCount,
      percentage: ((countWithReviews / buffets.length) * 100).toFixed(2) + '%',
    };

    console.log('\n=== Results ===');
    console.log(`Total buffets: ${results.totalBuffets}`);
    console.log(`Buffets with reviews field filled: ${results.countWithReviews}`);
    console.log(`  - Valid reviews (non-empty JSON array/object): ${results.countWithValidReviews}`);
    console.log(`  - Empty/invalid reviews: ${results.countWithEmptyReviews}`);
    console.log(`Buffets without reviews field: ${results.countWithoutReviews}`);
    console.log(`Percentage with reviews: ${results.percentage}`);
    if (totalReviewCount > 0) {
      console.log(`Total number of reviews across all buffets: ${totalReviewCount}`);
    }

    return results;
  } catch (error) {
    console.error('Error counting reviews:', error);
    throw error;
  }
}

countReviews()
  .then((results) => {
    console.log('\n✓ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
