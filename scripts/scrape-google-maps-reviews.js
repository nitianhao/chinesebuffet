/**
 * Script to scrape Google Maps reviews using Apify
 * 
 * This script reads place IDs from apify-reviews-cities.json and scrapes reviews
 * for each place, then adds the reviews back to the JSON file.
 * 
 * Usage:
 *   node scripts/scrape-google-maps-reviews.js [options]
 * 
 * Options:
 *   --test              - Test on first ID only (default: true for first run)
 *   --all               - Process all IDs in the JSON file
 *   --batch N           - Process N places per run (default: 50)
 *   --max-reviews N     - Maximum reviews per place (default: 50)
 *   --input file.json   - Input JSON file (default: Example JSON/apify-reviews-cities.json)
 *   --output file.json  - Output JSON file (default: same as input, overwrites)
 */

const fs = require('fs');
const path = require('path');
const { runActor, getRunStatus } = require('../lib/apify-client');

// Parse command line arguments
const args = process.argv.slice(2);
let testMode = true; // Default to test mode
let batchSize = 50; // Process 50 places per run
let maxReviews = 50;
let inputFile = path.join(__dirname, '..', 'Example JSON', 'apify-reviews-cities.json');
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  
  if (arg === '--test') {
    testMode = true;
  } else if (arg === '--all') {
    testMode = false;
  } else if (arg === '--batch' && nextArg) {
    batchSize = parseInt(nextArg, 10);
    i++;
  } else if (arg === '--max-reviews' && nextArg) {
    maxReviews = parseInt(nextArg, 10);
    i++;
  } else if (arg === '--input' && nextArg) {
    inputFile = path.resolve(nextArg);
    i++;
  } else if (arg === '--output' && nextArg) {
    outputFile = path.resolve(nextArg);
    i++;
  }
}

if (!outputFile) {
  outputFile = inputFile; // Default to overwriting input file
}

// Actor configuration
const ACTOR_ID = 'compass/Google-Maps-Reviews-Scraper';

/**
 * Convert a place ID to Google Maps URL
 * The ID format suggests it might be a Google Place ID or internal ID
 * We'll try multiple formats
 */
function idToGoogleMapsUrl(id, title, city) {
  // Check if it's a Google Place ID (starts with ChIJ)
  if (id.startsWith('ChIJ')) {
    return `https://www.google.com/maps/place/?q=place_id:${id}`;
  }
  
  // If it's a UUID (internal ID), try to construct URL from title and city
  // Or use the place_id query format
  const encodedTitle = encodeURIComponent(title || 'Place');
  const encodedCity = encodeURIComponent(city || '');
  const searchQuery = `${encodedTitle} ${encodedCity}`.trim();
  
  // Try place_id format first (in case UUID maps to place ID)
  return `https://www.google.com/maps/place/?q=place_id:${id}`;
  
  // Alternative: Search by name and city
  // return `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
}

/**
 * Transform Apify review data to our Review interface format
 */
function transformReview(apifyReview, placeId) {
  return {
    reviewerId: apifyReview.reviewerId || apifyReview.userId,
    reviewerUrl: apifyReview.reviewerUrl || apifyReview.userUrl,
    name: apifyReview.reviewerName || apifyReview.name || apifyReview.author || 'Anonymous',
    reviewerNumberOfReviews: apifyReview.reviewerNumberOfReviews || apifyReview.userNumberOfReviews,
    isLocalGuide: apifyReview.isLocalGuide || apifyReview.localGuide || false,
    reviewerPhotoUrl: apifyReview.reviewerPhotoUrl || apifyReview.userPhotoUrl,
    text: apifyReview.reviewText || apifyReview.text || apifyReview.comment || '',
    textTranslated: apifyReview.textTranslated || null,
    publishAt: apifyReview.publishAt || apifyReview.publishedAt || apifyReview.date || new Date().toISOString(),
    publishedAtDate: apifyReview.publishedAtDate || apifyReview.date,
    likesCount: apifyReview.likesCount || apifyReview.helpful || 0,
    reviewId: apifyReview.reviewId || apifyReview.id,
    reviewUrl: apifyReview.reviewUrl || apifyReview.url,
    reviewOrigin: apifyReview.reviewOrigin || 'google_maps',
    stars: apifyReview.rating || apifyReview.stars || apifyReview.score || 0,
    rating: apifyReview.rating || apifyReview.stars || apifyReview.score || null,
    responseFromOwnerDate: apifyReview.responseFromOwnerDate || apifyReview.ownerResponseDate || null,
    responseFromOwnerText: apifyReview.responseFromOwnerText || apifyReview.ownerResponse || null,
    reviewImageUrls: apifyReview.reviewImageUrls || apifyReview.images || [],
    reviewContext: apifyReview.reviewContext || {},
    reviewDetailedRating: apifyReview.reviewDetailedRating || apifyReview.detailedRating || null,
    visitedIn: apifyReview.visitedIn || null,
    originalLanguage: apifyReview.originalLanguage || null,
    translatedLanguage: apifyReview.translatedLanguage || null,
    // Legacy fields
    author: apifyReview.reviewerName || apifyReview.name || apifyReview.author,
    time: apifyReview.publishAt || apifyReview.publishedAt || apifyReview.date,
    relativeTime: apifyReview.relativeTime || apifyReview.timeAgo,
  };
}

/**
 * Sort reviews by newest first
 */
function sortReviewsByNewest(reviews) {
  return reviews.sort((a, b) => {
    const dateA = new Date(a.publishAt || a.time || 0);
    const dateB = new Date(b.publishAt || b.time || 0);
    return dateB - dateA; // Newest first
  });
}

/**
 * Calculate cost estimate based on run stats
 */
function calculateCost(stats, reviewsCount) {
  if (!stats) {
    // Fallback: estimate based on reviews count
    const costPerReview = 0.0006;
    const estimatedCost = reviewsCount * costPerReview;
    return {
      reviewsScraped: reviewsCount,
      reviewCost: estimatedCost.toFixed(4),
      computeCost: '0.0100', // Estimated minimum compute cost
      totalCost: (estimatedCost + 0.01).toFixed(4),
      costPerReview: costPerReview.toFixed(6),
    };
  }
  
  // Based on Apify pricing: ~$0.60 per 1,000 reviews = $0.0006 per review
  const costPerReview = 0.0006;
  
  // Try to get reviews count from stats or use provided count
  let reviewsScraped = reviewsCount || 0;
  if (stats.requestsTotal) {
    reviewsScraped = stats.requestsTotal;
  } else if (stats.runTimeSecs) {
    // Estimate: roughly 1-2 reviews per second of runtime
    reviewsScraped = Math.max(reviewsCount || 0, Math.floor(stats.runTimeSecs * 1.5));
  }
  
  // Calculate compute time
  let computeTimeHours = 0;
  if (stats.computeTimeMs) {
    computeTimeHours = stats.computeTimeMs / (1000 * 60 * 60);
  } else if (stats.runTimeSecs) {
    computeTimeHours = stats.runTimeSecs / 3600;
  } else if (stats.duration) {
    // Duration might be in milliseconds
    computeTimeHours = (typeof stats.duration === 'number' ? stats.duration : 0) / (1000 * 60 * 60);
  }
  
  // Minimum compute cost (even short runs have base cost)
  const computeCostPerHour = 0.25; // Approximate compute cost per hour
  const minComputeCost = 0.01; // Minimum cost even for very short runs
  
  const reviewCost = reviewsScraped * costPerReview;
  const computeCost = Math.max(computeTimeHours * computeCostPerHour, minComputeCost);
  
  return {
    reviewsScraped,
    reviewCost: reviewCost.toFixed(4),
    computeCost: computeCost.toFixed(4),
    totalCost: (reviewCost + computeCost).toFixed(4),
    costPerReview: costPerReview.toFixed(6),
  };
}

async function main() {
  try {
    console.log('\n🎬 Google Maps Reviews Scraper\n');
    console.log(`📁 Input file: ${inputFile}`);
    console.log(`💾 Output file: ${outputFile}`);
    console.log(`🔢 Max reviews per place: ${maxReviews}`);
    console.log(`📦 Batch size: ${batchSize} places per run`);
    console.log(`🧪 Test mode: ${testMode ? 'ON (first ID only)' : 'OFF'}\n`);
    
    // Read input JSON
    if (!fs.existsSync(inputFile)) {
      throw new Error(`Input file not found: ${inputFile}`);
    }
    
    const inputData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    console.log(`📊 Loaded ${inputData.length} places from input file\n`);
    
    // Filter places that need reviews (skip those that already have reviews)
    const placesNeedingReviews = inputData.filter(place => {
      // Skip if already has reviews array with items
      return !place.reviews || !Array.isArray(place.reviews) || place.reviews.length === 0;
    });
    
    const placesWithReviews = inputData.length - placesNeedingReviews.length;
    
    console.log(`📈 Status Summary:`);
    console.log(`   Total places: ${inputData.length}`);
    console.log(`   ✅ Already have reviews: ${placesWithReviews}`);
    console.log(`   ⏳ Need reviews: ${placesNeedingReviews.length}`);
    console.log(`\n`);
    
    // Filter to test or batch
    let placesToProcess;
    if (testMode) {
      placesToProcess = [inputData[0]];
      console.log(`🧪 TEST MODE: Processing first place only`);
      console.log(`   Title: ${placesToProcess[0].Title}`);
      console.log(`   ID: ${placesToProcess[0].ID}`);
      console.log(`   City: ${placesToProcess[0].City}\n`);
    } else {
      // Process only places that need reviews, in batches
      placesToProcess = placesNeedingReviews.slice(0, batchSize);
      console.log(`🚀 Processing batch of ${placesToProcess.length} places (out of ${placesNeedingReviews.length} remaining)\n`);
    }
    
    // Process each place
    const results = [];
    let totalCost = {
      reviewsScraped: 0,
      reviewCost: 0,
      computeCost: 0,
      totalCost: 0,
    };
    
    let successfulScrapes = 0;
    let failedScrapes = 0;
    
    for (let i = 0; i < placesToProcess.length; i++) {
      const place = placesToProcess[i];
      const placeIndex = testMode ? 0 : i;
      
      console.log(`\n[${i + 1}/${placesToProcess.length}] Processing: ${place.Title}`);
      console.log(`   ID: ${place.ID}`);
      console.log(`   City: ${place.City}`);
      
      // Get Google Maps URL - prefer url field, then placeId, then construct from ID
      let googleMapsUrl;
      if (place.url) {
        googleMapsUrl = place.url;
        console.log(`   Using provided URL from JSON`);
      } else if (place.placeId) {
        // Use placeId to construct Google Maps URL
        // Try multiple formats - the actor might accept place_id directly or need a full URL
        // Format 1: Direct place_id query (what we tried)
        // Format 2: Standard Google Maps place URL with place_id
        googleMapsUrl = `https://www.google.com/maps/place/?q=place_id:${place.placeId}`;
        console.log(`   Using placeId to construct URL: ${place.placeId}`);
        console.log(`   Note: If this fails, the actor might need a different URL format`);
      } else {
        googleMapsUrl = idToGoogleMapsUrl(place.ID, place.Title, place.City);
        console.log(`   Constructed URL from ID (consider adding 'placeId' or 'url' field to JSON)`);
      }
      console.log(`   URL: ${googleMapsUrl}`);
      
      // Prepare actor input
      // The actor might expect 'startUrls' with objects containing 'url' property
      // or 'urls' as an array of strings - try both formats
      const actorInput = {
        startUrls: [{ url: googleMapsUrl }],
        sortType: 'newest',
        maxReviews: maxReviews,
      };
      
      console.log(`\n🚀 Starting Apify actor: ${ACTOR_ID}`);
      console.log(`📥 Input:`, JSON.stringify(actorInput, null, 2));
      
      try {
        // Run the actor
        const result = await runActor(ACTOR_ID, actorInput, {
          waitForFinish: true,
          timeout: 1800000, // 30 minutes timeout
        });
        
        console.log(`\n✅ Scraping completed for ${place.Title}`);
        console.log(`📊 Retrieved ${result.items.length} reviews`);
        
        // Calculate cost
        const cost = calculateCost(result.stats, result.items.length);
        console.log(`\n💰 Cost Information:`);
        console.log(`   Reviews scraped: ${cost.reviewsScraped}`);
        console.log(`   Review cost: $${cost.reviewCost}`);
        console.log(`   Compute cost: $${cost.computeCost}`);
        console.log(`   Total cost: $${cost.totalCost}`);
        console.log(`   Cost per review: $${cost.costPerReview}`);
        
        totalCost.reviewsScraped += parseInt(cost.reviewsScraped);
        totalCost.reviewCost += parseFloat(cost.reviewCost);
        totalCost.computeCost += parseFloat(cost.computeCost);
        totalCost.totalCost += parseFloat(cost.totalCost);
        
        // Transform reviews to our format
        let reviews = result.items.map(item => transformReview(item, place.ID));
        
        // Sort by newest
        reviews = sortReviewsByNewest(reviews);
        
        // Limit to maxReviews
        reviews = reviews.slice(0, maxReviews);
        
        console.log(`\n📝 Processed ${reviews.length} reviews (sorted by newest, limited to ${maxReviews})`);
        
        // Add reviews to place object
        const updatedPlace = {
          ...place,
          reviews: reviews,
          reviewsCount: reviews.length,
          lastScrapedAt: new Date().toISOString(),
        };
        
        results.push(updatedPlace);
        successfulScrapes++;
        
        // Show sample review
        if (reviews.length > 0) {
          console.log(`\n📋 Sample review (newest):`);
          const sample = reviews[0];
          console.log(`   Author: ${sample.name}`);
          console.log(`   Rating: ${sample.stars} stars`);
          console.log(`   Date: ${sample.publishAt}`);
          console.log(`   Text: ${sample.text.substring(0, 100)}...`);
        }
        
      } catch (error) {
        console.error(`\n❌ Error scraping reviews for ${place.Title}:`);
        console.error(`   ${error.message}`);
        
        failedScrapes++;
        
        // Add place without reviews on error
        results.push({
          ...place,
          reviews: [],
          reviewsCount: 0,
          error: error.message,
          lastScrapedAt: new Date().toISOString(),
        });
      }
    }
    
    // Update the original data array with results
    const updatedData = [...inputData];
    
    if (testMode) {
      // Update first item
      updatedData[0] = results[0];
    } else {
      // Update all processed items
      results.forEach((result, index) => {
        const originalIndex = inputData.findIndex(
          item => item.ID === result.ID
        );
        if (originalIndex !== -1) {
          updatedData[originalIndex] = result;
        }
      });
    }
    
    // Save updated JSON
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    fs.writeFileSync(outputFile, JSON.stringify(updatedData, null, 2));
    
    // Calculate final statistics
    const finalData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    const finalPlacesWithReviews = finalData.filter(place => 
      place.reviews && Array.isArray(place.reviews) && place.reviews.length > 0
    ).length;
    const finalPlacesNeedingReviews = finalData.length - finalPlacesWithReviews;
    
    console.log(`\n\n✅ Batch Complete!`);
    console.log(`\n📊 Processing Summary:`);
    console.log(`   Places processed this run: ${results.length}`);
    console.log(`   ✅ Successful: ${successfulScrapes}`);
    console.log(`   ❌ Failed: ${failedScrapes}`);
    
    console.log(`\n📈 Overall Progress:`);
    console.log(`   Total places: ${finalData.length}`);
    console.log(`   ✅ With reviews: ${finalPlacesWithReviews} (${((finalPlacesWithReviews / finalData.length) * 100).toFixed(1)}%)`);
    console.log(`   ⏳ Still waiting: ${finalPlacesNeedingReviews} (${((finalPlacesNeedingReviews / finalData.length) * 100).toFixed(1)}%)`);
    
    console.log(`\n💰 Cost Summary (This Run):`);
    console.log(`   Reviews scraped: ${totalCost.reviewsScraped}`);
    console.log(`   Review cost: $${totalCost.reviewCost.toFixed(4)}`);
    console.log(`   Compute cost: $${totalCost.computeCost.toFixed(4)}`);
    console.log(`   Total cost: $${totalCost.totalCost.toFixed(4)}`);
    
    if (!testMode && finalPlacesNeedingReviews > 0) {
      const estimatedCostPerPlace = totalCost.totalCost / Math.max(successfulScrapes, 1);
      const estimatedRemainingCost = estimatedCostPerPlace * finalPlacesNeedingReviews;
      console.log(`\n💡 Estimated Cost to Complete:`);
      console.log(`   Cost per place: ~$${estimatedCostPerPlace.toFixed(4)}`);
      console.log(`   Remaining places: ${finalPlacesNeedingReviews}`);
      console.log(`   Estimated remaining cost: ~$${estimatedRemainingCost.toFixed(2)}`);
    }
    
    console.log(`\n💾 Results saved to: ${outputFile}`);
    
    if (!testMode && finalPlacesNeedingReviews > 0) {
      console.log(`\n🔄 To process next batch, run:`);
      console.log(`   npm run apify:reviews:batch`);
    }
    
    console.log(`\n`);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

