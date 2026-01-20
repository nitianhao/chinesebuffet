#!/usr/bin/env node

/**
 * Script to scrape Yelp attributes using Apify
 * 
 * This script:
 * 1. Reads yelp-restaurant-mapping.json
 * 2. Extracts Yelp URLs for records missing attributes
 * 3. Calls Apify scraper to get attributes
 * 4. Merges attributes back into the JSON file
 * 
 * Note: The agents/yelp-business scraper does NOT extract menu_url.
 * menu_url is only available from the Yelp API directly or from scraping
 * the Yelp page HTML directly. This script will check for it but it's
 * unlikely to be found in the Apify response.
 * 
 * Usage:
 *   node scripts/scrape-yelp-attributes-apify.js
 */

const fs = require('fs');
const path = require('path');
const apify = require('../lib/apify-client');

const ACTOR_ID = 'agents/yelp-business';
const INPUT_FILE = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
const OUTPUT_FILE = path.join(__dirname, '../Example JSON/yelp-restaurant-mapping.json');
const BATCH_SIZE = 100; // Process 100 records per batch
const readline = require('readline');

/**
 * Ask user for confirmation to proceed
 * If AUTO_CONTINUE is true, automatically returns 'yes' after a short delay
 */
const AUTO_CONTINUE = process.env.AUTO_CONTINUE === 'true' || process.argv.includes('--auto-continue');

function askQuestion(query) {
  if (AUTO_CONTINUE) {
    console.log(query + ' (auto-continuing in 2 seconds...)');
    return new Promise(resolve => {
      setTimeout(() => resolve('yes'), 2000);
    });
  }
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(query, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Maps Apify amenities array format to Yelp API attributes format
 * Apify returns: [
 *   { "RestaurantsReservations": "Takes Reservations", "isEnabled": true },
 *   { "accepts_credit_cards": "Accepts Credit Cards", "isEnabled": true },
 *   ...
 * ]
 * Yelp API expects: { "business_accepts_credit_cards": true, "restaurants_reservations": false, ... }
 */
function mapApifyAmenitiesToYelpAttributes(amenitiesArray) {
  if (!Array.isArray(amenitiesArray) || amenitiesArray.length === 0) {
    return {};
  }
  
  const attributes = {};
  
  // Comprehensive mapping from Apify attribute keys to Yelp API keys
  const keyMapping = {
    // Payment methods
    'accepts_credit_cards': 'business_accepts_credit_cards',
    'accepts_apple_pay': 'business_accepts_apple_pay',
    'accepts_android_pay': 'business_accepts_android_pay',
    'accepts_cryptocurrency': 'business_accepts_cryptocurrency',
    
    // Restaurant services
    'RestaurantsDelivery': 'restaurants_delivery',
    'RestaurantsTakeOut': 'restaurants_take_out',
    'RestaurantsReservations': 'restaurants_reservations',
    'RestaurantsTableService': 'restaurants_table_service',
    'RestaurantsAttire': 'restaurants_attire',
    
    // Features
    'good_for_kids': 'good_for_kids',
    'good_for_groups': 'restaurants_good_for_groups',
    'has_outdoor_seating': 'outdoor_seating',
    'dogs_allowed': 'dogs_allowed',
    'has_bike_parking': 'bike_parking',
    'Caters': 'caters',
    'has_tv': 'has_tv',
    
    // Options
    'wifi_options': 'wi_fi',
    'alcohol_options': 'alcohol',
    'NoiseLevel': 'noise_level',
    'num_vegetarian_options': 'restaurants_vegetarian_friendly',
    
    // Accessibility
    'accessible_parking': 'business_parking',
    'ada_compliant_entrance': 'wheelchair_accessible',
    'ada_compliant_restroom': 'wheelchair_accessible',
    'no_steps_or_stairs': 'wheelchair_accessible',
    'has_tv_closed_captioning': 'wheelchair_accessible',
  };
  
  // Handle nested structures
  const ambience = {};
  const businessParking = {};
  const goodForMeal = {};
  
  // Mapping from display names to Yelp API keys
  const displayNameMapping = {
    'Takes Reservations': 'restaurants_reservations',
    'Offers Delivery': 'restaurants_delivery',
    'Offers Takeout': 'restaurants_take_out',
    'Outdoor Seating': 'outdoor_seating',
    'Accepts Credit Cards': 'business_accepts_credit_cards',
    'Accepts Apple Pay': 'business_accepts_apple_pay',
    'Accepts Android Pay': 'business_accepts_android_pay',
    'Good For Kids': 'good_for_kids',
    'Good for Groups': 'restaurants_good_for_groups',
    'Dogs Allowed': 'dogs_allowed',
    'Bike Parking': 'bike_parking',
    'Offers Catering': 'caters',
    'TV': 'has_tv',
    'Wi-Fi': 'wi_fi',
    'Free Wi-Fi': 'wi_fi',
    'Alcohol': 'alcohol',
    'Full Bar': 'alcohol',
    'Beer & Wine': 'alcohol',
    'Moderate Noise': 'noise_level',
    'Quiet': 'noise_level',
    'Loud': 'noise_level',
    'Very Loud': 'noise_level',
    'Casual': 'ambience',
    'Classy': 'ambience',
    'Intimate': 'ambience',
    'Romantic': 'ambience',
    'Touristy': 'ambience',
    'Trendy': 'ambience',
    'Upscale': 'ambience',
    'Hipster': 'ambience',
    'Divey': 'ambience',
    'Lunch': 'good_for_meal',
    'Dinner': 'good_for_meal',
    'Breakfast': 'good_for_meal',
    'Brunch': 'good_for_meal',
    'Dessert': 'good_for_meal',
    'Late Night': 'good_for_meal',
    'Parking': 'business_parking',
    'Valet Parking': 'business_parking',
    'Street Parking': 'business_parking',
    'Garage Parking': 'business_parking',
    'Lot Parking': 'business_parking',
    'Validated Parking': 'business_parking',
    'Wheelchair accessible': 'wheelchair_accessible',
    'Accessible parking near entrance': 'accessible_parking',
    'ADA-compliant main entrance': 'ada_compliant_entrance',
    'ADA-compliant restroom': 'ada_compliant_restroom',
    'No steps or stairs': 'no_steps_or_stairs',
    'Closed captioning on TVs': 'has_tv_closed_captioning',
    'Vegan Options': 'restaurants_vegetarian_friendly',
    'Limited Vegetarian Options': 'restaurants_vegetarian_friendly',
    'Happy Hour Specials': 'happy_hour_specials',
    'Compostable containers available': 'compostable_containers',
    'Plastic-free packaging': 'plastic_free_packaging',
    'Provides reusable tableware': 'provides_reusable_tableware',
    'Tipping optional': 'tips',
    'Tipping optional for large parties': 'large_parties_gratuity',
  };
  
  for (const amenity of amenitiesArray) {
    // Skip if explicitly disabled
    if (amenity.isEnabled === false) continue;
    
    // The Apify scraper returns objects with "undefined" as the key and the display name as value
    // We need to use the value (display name) to map to Yelp API keys
    for (const [key, value] of Object.entries(amenity)) {
      if (key === 'isEnabled') continue;
      if (!key || typeof key !== 'string') continue;
      
      // If the key is "undefined", use the value (display name) to map
      let displayName = value;
      let attributeKey = key;
      
      if (key === 'undefined' && typeof value === 'string') {
        // Use the display name to find the mapping
        displayName = value;
        attributeKey = displayNameMapping[value] || null;
        
        if (!attributeKey) {
          // Try to convert display name to snake_case
          attributeKey = value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_|_$/g, '');
        }
      } else {
        // Normal key-value pair
        attributeKey = keyMapping[key] || key;
      }
      
      if (!attributeKey || attributeKey === 'undefined') continue;
      
      // Handle Ambience
      if (displayName === 'Ambience' && Array.isArray(value)) {
        for (const amb of value) {
          if (typeof amb === 'string') {
            const ambKey = amb.toLowerCase();
            ambience[ambKey] = true;
          }
        }
        continue;
      }
      
      // Handle BusinessParking
      if (displayName === 'BusinessParking' && Array.isArray(value)) {
        for (const parking of value) {
          if (typeof parking === 'string') {
            const parkingKey = parking.toLowerCase().replace(/\s+/g, '_');
            businessParking[parkingKey] = true;
          }
        }
        continue;
      }
      
      // Handle GoodForMeal
      if (displayName === 'GoodForMeal' && Array.isArray(value)) {
        for (const meal of value) {
          if (typeof meal === 'string') {
            const mealKey = meal.toLowerCase();
            goodForMeal[mealKey] = true;
          }
        }
        continue;
      }
      
      // Handle special nested attributes
      if (attributeKey === 'ambience') {
        if (typeof displayName === 'string') {
          ambience[displayName.toLowerCase()] = true;
        }
        continue;
      }
      
      if (attributeKey === 'business_parking' || attributeKey === 'accessible_parking') {
        if (typeof displayName === 'string') {
          const parkingKey = displayName.toLowerCase().replace(/\s+/g, '_');
          businessParking[parkingKey] = true;
        }
        continue;
      }
      
      if (attributeKey === 'good_for_meal') {
        if (typeof displayName === 'string') {
          goodForMeal[displayName.toLowerCase()] = true;
        }
        continue;
      }
      
      // Handle special value conversions
      if (attributeKey === 'wi_fi' || displayName.toLowerCase().includes('wifi') || displayName.toLowerCase().includes('wi-fi')) {
        const wifiValue = typeof displayName === 'string' ? displayName.toLowerCase() : '';
        if (wifiValue.includes('free')) {
          attributes['wi_fi'] = 'free';
        } else if (wifiValue && !wifiValue.includes('no')) {
          attributes['wi_fi'] = 'paid';
        } else {
          attributes['wi_fi'] = 'no';
        }
      } else if (attributeKey === 'alcohol' || displayName.toLowerCase().includes('alcohol') || displayName.toLowerCase().includes('bar')) {
        const alcoholValue = typeof displayName === 'string' ? displayName.toLowerCase() : 'none';
        if (alcoholValue.includes('full bar') || alcoholValue.includes('full_bar')) {
          attributes['alcohol'] = 'full_bar';
        } else if (alcoholValue.includes('beer') || alcoholValue.includes('wine')) {
          attributes['alcohol'] = 'beer_and_wine';
        } else {
          attributes['alcohol'] = 'none';
        }
      } else if (attributeKey === 'noise_level' || displayName.toLowerCase().includes('noise')) {
        attributes['noise_level'] = typeof displayName === 'string' 
          ? displayName.toLowerCase().replace(/\s+/g, '_') 
          : 'average';
      } else if (attributeKey && attributeKey !== 'undefined') {
        // Boolean attributes - just set to true if enabled
        attributes[attributeKey] = true;
      }
    }
  }
  
  // Add nested objects if they have values
  if (Object.keys(ambience).length > 0) {
    attributes.ambience = ambience;
  }
  if (Object.keys(businessParking).length > 0) {
    attributes.business_parking = businessParking;
  }
  if (Object.keys(goodForMeal).length > 0) {
    attributes.good_for_meal = goodForMeal;
  }
  
  return attributes;
}

async function main() {
  console.log('📖 Reading JSON file...');
  const data = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  
  // Find records missing attributes
  const urlsToScrape = [];
  const urlToBuffetId = new Map();
  let skippedCount = 0;
  
  for (const [buffetId, buffetData] of Object.entries(data)) {
    if (!buffetData.yelp || !buffetData.yelp.url) continue;
    
    const yelpData = buffetData.yelp;
    // Check if attributes exist and are not null/empty
    const attributes = yelpData.details?.attributes;
    const hasAttributes = attributes && 
                          typeof attributes === 'object' &&
                          Object.keys(attributes).length > 0;
    
    if (!hasAttributes) {
      const url = yelpData.url.split('?')[0]; // Remove query params
      urlsToScrape.push(url);
      urlToBuffetId.set(url, buffetId);
    } else {
      skippedCount++;
    }
  }
  
  console.log(`✅ Skipped ${skippedCount} records that already have attributes`);
  
  const urlsToProcess = urlsToScrape; // Process all records
  
  console.log(`\n📊 Summary:`);
  console.log(`   - Records with attributes: ${skippedCount}`);
  console.log(`   - Records missing attributes: ${urlsToScrape.length}`);
  console.log(`   - Batch size: ${BATCH_SIZE} records per batch`);
  console.log(`   - Total batches: ${Math.ceil(urlsToProcess.length / BATCH_SIZE)}`);
  console.log(`💰 Estimated total cost: $${(urlsToProcess.length * 0.0005).toFixed(4)} ($$0.0005 per record)`);
  console.log(`💰 Cost per batch: $${(BATCH_SIZE * 0.0005).toFixed(4)}`);
  
  if (urlsToProcess.length === 0) {
    console.log('✅ All records already have attributes!');
    return;
  }
  
  // Ask for initial confirmation
  console.log('\n⚠️  Ready to process', urlsToProcess.length, 'URLs in batches of', BATCH_SIZE);
  const initialConfirm = await askQuestion('Continue? (yes/no): ');
  if (initialConfirm.toLowerCase() !== 'yes' && initialConfirm.toLowerCase() !== 'y') {
    console.log('❌ Cancelled by user');
    return;
  }
  
  let processed = 0;
  let totalCost = 0;
  const totalBatches = Math.ceil(urlsToProcess.length / BATCH_SIZE);
  
  // Initialize totalCost tracking
  
  for (let i = 0; i < urlsToProcess.length; i += BATCH_SIZE) {
    const batch = urlsToProcess.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} URLs)...`);
    console.log(`${'='.repeat(60)}`);
    
    try {
      const input = {
        startUrls: batch, // agents/yelp-business expects array of URLs directly
        maxItems: batch.length, // Limit to batch size
      };
      
      const result = await apify.runActor(ACTOR_ID, input, {
        waitForFinish: true,
        timeout: 3600000, // 1 hour timeout
      });
      
      // Process results
      for (const item of result.items) {
        if (!item.url && !item.startUrl) continue;
        
        // Try both url and startUrl fields
        const itemUrl = item.url || item.startUrl;
        const cleanUrl = itemUrl.split('?')[0];
        const buffetId = urlToBuffetId.get(cleanUrl);
        
        if (!buffetId) {
          console.warn(`⚠️  Could not find buffet ID for URL: ${cleanUrl}`);
          continue;
        }
        
        // Ensure details object exists
        if (!data[buffetId].yelp.details) {
          data[buffetId].yelp.details = {};
        }
        
        // Initialize attributes if needed
        if (!data[buffetId].yelp.details.attributes) {
          data[buffetId].yelp.details.attributes = {};
        }
        
        // Extract menu_url - Note: The agents/yelp-business scraper doesn't extract menu_url
        // We check all possible fields just in case it's available
        const menuUrl = item.menuUrl || item.menu_url || item.menu || 
                       item.menuLink || item.menu_link ||
                       (item.about && typeof item.about === 'object' ? item.about.menuUrl || item.about.menu_url : null) ||
                       (item.amenities && Array.isArray(item.amenities) 
                         ? item.amenities.find(a => a.menuUrl || a.menu_url)?.menuUrl || 
                           item.amenities.find(a => a.menuUrl || a.menu_url)?.menu_url
                         : null);
        
        if (menuUrl) {
          data[buffetId].yelp.details.attributes.menu_url = menuUrl;
        }
        // Note: menu_url is typically not available from agents/yelp-business scraper
        // It would need to be obtained from Yelp API directly or a different scraper
        
        // Extract website if available
        if (item.website) {
          data[buffetId].yelp.details.attributes.business_url = item.website;
        }
        
        // Extract additional fields not currently in JSON structure
        // 1. businessId - Yelp's internal business ID (different from alias)
        if (item.businessId && !data[buffetId].yelp.businessId) {
          data[buffetId].yelp.businessId = item.businessId;
        }
        
        // 2. isClaimed - Whether business owner has claimed the listing
        if (item.isClaimed !== undefined && !data[buffetId].yelp.hasOwnProperty('isClaimed')) {
          data[buffetId].yelp.isClaimed = item.isClaimed;
        }
        
        // 3. isBusinessClosed - Whether permanently closed
        if (item.isBusinessClosed !== undefined) {
          // Store in details to match existing is_closed structure
          data[buffetId].yelp.details.is_business_closed = item.isBusinessClosed;
        }
        
        // 4. primaryPhoto - Main/featured photo URL
        if (item.primaryPhoto && !data[buffetId].yelp.details.primaryPhoto) {
          data[buffetId].yelp.details.primaryPhoto = item.primaryPhoto;
        }
        
        // 5. operationHours - Hours in day-based object format
        // JSON already has hours array, but this provides alternative format
        if (item.operationHours && Object.keys(item.operationHours).length > 0) {
          if (!data[buffetId].yelp.details.operationHours) {
            data[buffetId].yelp.details.operationHours = item.operationHours;
          }
        }
        
        // 6. about - Business description/about text
        if (item.about && typeof item.about === 'object' && Object.keys(item.about).length > 0) {
          if (!data[buffetId].yelp.details.about) {
            data[buffetId].yelp.details.about = item.about;
          }
        } else if (item.about && typeof item.about === 'string' && item.about.trim()) {
          // Sometimes about might be a string
          if (!data[buffetId].yelp.details.about) {
            data[buffetId].yelp.details.about = item.about;
          }
        }
        
        // 7. reservationUrl - Yelp reservation URL
        if (item.reservationUrl && !data[buffetId].yelp.details.reservationUrl) {
          data[buffetId].yelp.details.reservationUrl = item.reservationUrl;
        }
        
        // 8. mediaCount - Total number of photos/media
        if (item.mediaCount !== undefined && !data[buffetId].yelp.details.mediaCount) {
          data[buffetId].yelp.details.mediaCount = item.mediaCount;
        }
        
        // Debug: log all available fields for first record
        if (processed === 0) {
          console.log(`  🔍 Debug - All item keys:`, Object.keys(item));
          console.log(`  🔍 Debug - Additional fields extracted:`, {
            businessId: item.businessId,
            isClaimed: item.isClaimed,
            isBusinessClosed: item.isBusinessClosed,
            primaryPhoto: item.primaryPhoto ? 'present' : 'missing',
            operationHours: item.operationHours ? Object.keys(item.operationHours).length + ' days' : 'missing',
            about: item.about ? (typeof item.about === 'object' ? Object.keys(item.about).length + ' keys' : 'string') : 'missing',
            reservationUrl: item.reservationUrl ? 'present' : 'missing',
            mediaCount: item.mediaCount
          });
        }
        
        // Map amenities array to attributes format
        if (item.amenities && Array.isArray(item.amenities)) {
          // Debug: log first record's raw amenities structure
          if (processed === 0) {
            console.log(`  🔍 Debug - Raw amenities (first 5):`, JSON.stringify(item.amenities.slice(0, 5), null, 2));
            console.log(`  🔍 Debug - Item keys:`, Object.keys(item));
          }
          
          // Convert amenities array to Yelp API attributes format
          const attributes = mapApifyAmenitiesToYelpAttributes(item.amenities);
          
          // Merge with existing attributes (like menu_url)
          if (!data[buffetId].yelp.details.attributes) {
            data[buffetId].yelp.details.attributes = {};
          }
          
          // Merge attributes
          Object.assign(data[buffetId].yelp.details.attributes, attributes);
          
          // Debug: log first record's mapped attributes
          if (processed === 0) {
            console.log(`  🔍 Debug - Final attributes:`, JSON.stringify(data[buffetId].yelp.details.attributes, null, 2));
          }
          
          // Only save if we got valid attributes
          if (Object.keys(data[buffetId].yelp.details.attributes).length > 0) {
            processed++;
            totalCost += 0.0005;
            const attrCount = Object.keys(data[buffetId].yelp.details.attributes).length;
            const menuInfo = data[buffetId].yelp.details.attributes.menu_url ? ' (with menu_url)' : '';
            console.log(`  ✓ Processed: ${data[buffetId].buffetName} (${attrCount} attributes${menuInfo})`);
          } else {
            console.warn(`  ⚠️  No valid attributes extracted for: ${data[buffetId].buffetName}`);
          }
        } else if (item.menuUrl || item.menu_url || item.website) {
          // At least we got menu_url or website
          processed++;
          totalCost += 0.0005;
          console.log(`  ✓ Processed: ${data[buffetId].buffetName} (menu_url/website only)`);
        } else {
          console.warn(`  ⚠️  No amenities or menu_url found for: ${cleanUrl}`);
        }
      }

      const batchProcessed = result.items ? result.items.length : 0;
      // Calculate batch cost based on items actually processed
      const batchCost = batchProcessed * 0.0005;
      // Note: totalCost is incremented per item above, so we don't add batchCost again

      console.log(`\n✅ Batch ${batchNumber} complete!`);
      console.log(`   - Processed: ${batchProcessed} records in this batch`);
      console.log(`   - Total processed so far: ${processed} records`);
      console.log(`   - Batch cost: ~$${batchCost.toFixed(4)}`);
      console.log(`   - Total cost so far: ~$${totalCost.toFixed(4)}`);
      console.log(`   - Remaining: ${urlsToProcess.length - (i + batch.length)} records`);

      // Save progress after each batch
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
      console.log(`💾 Progress saved to ${OUTPUT_FILE}`);

      // Ask for confirmation before next batch (unless this is the last batch)
      if (i + BATCH_SIZE < urlsToProcess.length) {
        console.log(`\n${'='.repeat(60)}`);
        const continueConfirm = await askQuestion(`\n📊 Batch ${batchNumber} complete. Continue with batch ${batchNumber + 1}? (yes/no): `);
        if (continueConfirm.toLowerCase() !== 'yes' && continueConfirm.toLowerCase() !== 'y') {
          console.log(`\n⏸️  Paused by user after batch ${batchNumber}`);
          console.log(`   - Total processed: ${processed} records`);
          console.log(`   - Total cost: ~$${totalCost.toFixed(4)}`);
          console.log(`   - Remaining: ${urlsToProcess.length - (i + batch.length)} records`);
          return;
        }
      }

    } catch (error) {
      console.error(`❌ Error processing batch ${batchNumber}:`, error.message);
      console.error(`   Stack:`, error.stack);
      // Ask if user wants to continue after error
      if (i + BATCH_SIZE < urlsToProcess.length) {
        const errorContinue = await askQuestion(`\n⚠️  Error occurred. Continue with next batch? (yes/no): `);
        if (errorContinue.toLowerCase() !== 'yes' && errorContinue.toLowerCase() !== 'y') {
          console.log(`\n⏸️  Stopped by user after error in batch ${batchNumber}`);
          return;
        }
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Complete! Processed ${processed} records`);
  console.log(`💾 Final data saved to ${OUTPUT_FILE}`);
  console.log(`💰 Total cost: ~$${totalCost.toFixed(4)}`);
  console.log(`📊 Check your Apify console to verify usage and cost.`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);

