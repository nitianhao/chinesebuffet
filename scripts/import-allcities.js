// Script to import allcities.json to Instant DB using Admin API
// Run with: node scripts/import-allcities.js
// This script ensures ALL data from the JSON is transferred to InstantDB

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const { normalizeSearchText } = require('./lib/normalizeSearchText');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
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

const schema = require('../src/instant.schema.ts');

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// State abbreviation mapping
const stateAbbreviations = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
};

// Helper function to generate slug
function generateSlug(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper function to normalize city name
function normalizeCityName(cityName) {
  if (!cityName) return '';
  return cityName
    .replace(/ city \(balance\)/gi, '')
    .replace(/ city/gi, '')
    .replace(/\/.*$/g, '')
    .replace(/-.*$/g, '')
    .trim();
}

// Helper function to normalize state name
function normalizeStateName(stateName) {
  if (!stateName) return '';
  if (stateName === 'District of Columbia') return 'DC';
  return stateAbbreviations[stateName] || stateName;
}

// Helper function to stringify JSON fields
function stringifyField(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      console.warn('Failed to stringify field:', e.message);
      return undefined;
    }
  }
  return String(value);
}

// Generate city slug
function generateCitySlug(cityName, stateAbbr) {
  const citySlug = generateSlug(cityName);
  const stateSlug = generateSlug(stateAbbr);
  return `${citySlug}-${stateSlug}`;
}

// Helper to safely get nested value
function getValue(obj, path, defaultValue = undefined) {
  const keys = path.split('.');
  let value = obj;
  for (const key of keys) {
    if (value === null || value === undefined) return defaultValue;
    value = value[key];
  }
  return value !== undefined && value !== null ? value : defaultValue;
}

async function importData() {
  console.log('Reading allcities.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON file not found at:', jsonPath);
    process.exit(1);
  }
  
  console.log('Parsing JSON file (this may take a moment for large files)...');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`✓ Loaded ${jsonData.length} buffets from JSON\n`);
  
  try {
    // Get existing cities and buffets
    console.log('Checking existing data...');
    const existingCities = await db.query({ cities: {} });
    const existingBuffets = await db.query({ buffets: {} });
    
    const existingCitySlugs = new Set(existingCities.cities.map(c => c.slug));
    const existingBuffetPlaceIds = new Set(
      existingBuffets.buffets
        .filter(b => b.placeId)
        .map(b => b.placeId)
    );
    
    console.log(`  Found ${existingCities.cities.length} existing cities`);
    console.log(`  Found ${existingBuffets.buffets.length} existing buffets`);
    
    // Build city map from existing cities
    const cityMap = new Map(); // slug -> id
    const cityDataMap = new Map(); // slug -> city data
    existingCities.cities.forEach(city => {
      cityMap.set(city.slug, city.id);
      cityDataMap.set(city.slug, city);
    });
    
    // Process and import buffets
    console.log('\nProcessing buffets...');
    const cityTxs = [];
    const buffetTxs = [];
    const citySet = new Set(); // Track unique city-state combinations
    const skippedCount = { missingFields: 0, duplicates: 0, errors: 0 };
    
    for (let i = 0; i < jsonData.length; i++) {
      const place = jsonData[i];
      
      // Progress indicator
      if ((i + 1) % 1000 === 0) {
        console.log(`  Processed ${i + 1}/${jsonData.length} buffets...`);
      }
      
      // Skip if already exists (deduplication by placeId)
      if (place.placeId && existingBuffetPlaceIds.has(place.placeId)) {
        skippedCount.duplicates++;
        continue;
      }
      
      // Validate required fields
      if (!place.location || !place.location.lat || !place.location.lng) {
        skippedCount.missingFields++;
        console.warn(`  ⚠ Skipping buffet ${i + 1}: missing location data`);
        continue;
      }
      
      if (!place.city || !place.state) {
        skippedCount.missingFields++;
        console.warn(`  ⚠ Skipping buffet ${i + 1}: missing city/state`);
        continue;
      }
      
      try {
        // Extract data
        const cityName = normalizeCityName(place.city || '');
        const stateName = place.state || '';
        const stateAbbr = normalizeStateName(stateName);
        const cityStateKey = `${cityName.toLowerCase()}-${stateAbbr.toLowerCase()}`;
        const citySlug = generateCitySlug(cityName, stateAbbr);
        
        // Find or create city
        let cityId = null;
        
        if (cityMap.has(citySlug)) {
          cityId = cityMap.get(citySlug);
        } else if (!citySet.has(cityStateKey)) {
          // Create new city
          citySet.add(cityStateKey);
          const newCityId = id();
          cityMap.set(citySlug, newCityId);
          cityTxs.push(
            db.tx.cities[newCityId].create({
              rank: 9999, // Default rank for cities not in CSV
              city: cityName,
              state: stateName,
              stateAbbr: stateAbbr,
              population: 0, // Default population
              slug: citySlug,
            })
          );
          cityId = newCityId;
        } else {
          // City was already queued for creation, get its ID
          cityId = cityMap.get(citySlug);
        }
        
        // Generate buffet slug
        const buffetName = place.title || 'Unknown Restaurant';
        let buffetSlug = generateSlug(buffetName);
        // Make slug unique by adding state abbreviation
        if (stateAbbr) {
          buffetSlug = `${buffetSlug}-${stateAbbr.toLowerCase()}`;
        }
        
        // Create buffet transaction with ALL fields mapped
        const buffetId = id();
        const location = place.location || { lat: 0, lng: 0 };
        
        // Build additionalInfo object for complex nested data
        const additionalInfo = {};
        if (place.viewport) {
          additionalInfo.viewport = place.viewport;
        }
        if (place.currentOpeningHours) {
          additionalInfo.currentOpeningHours = place.currentOpeningHours;
        }
        if (place.primaryType) {
          additionalInfo.primaryType = place.primaryType;
        }
        
        // Map ALL fields from JSON to schema
        const buffetData = {
          // Core required fields
          name: buffetName,
          searchName: normalizeSearchText(buffetName),
          slug: buffetSlug,
          street: place.street || '',
          cityName: cityName,
          state: stateName,
          stateAbbr: stateAbbr,
          postalCode: place.postalCode || '',
          address: place.address || '',
          lat: location.lat || 0,
          lng: location.lng || 0,
          permanentlyClosed: place.permanentlyClosed || false,
          temporarilyClosed: place.temporarilyClosed || false,
          
          // Optional core fields
          phone: place.phone || undefined,
          phoneUnformatted: place.phoneUnformatted || undefined,
          website: place.website || undefined,
          price: place.price || undefined,
          rating: place.totalScore || undefined,
          reviewsCount: place.reviewsCount || undefined,
          neighborhood: place.neighborhood || undefined,
          placeId: place.placeId || undefined,
          imagesCount: place.imagesCount || undefined,
          categoryName: place.categoryName || undefined,
          
          // JSON stringified fields
          hours: stringifyField(place.openingHours),
          categories: stringifyField(place.categories),
          reviews: stringifyField(place.reviews),
          images: stringifyField(place.photos),
          
          // Extended fields - ALL of them
          description: place.description || undefined,
          countryCode: place.countryCode || undefined,
          fid: place.fid || undefined,
          cid: place.cid || undefined,
          imageCategories: stringifyField(place.imageCategories),
          scrapedAt: place.scrapedAt || undefined,
          googleFoodUrl: place.googleFoodUrl || undefined,
          hotelAds: stringifyField(place.hotelAds),
          additionalOpeningHours: stringifyField(place.additionalOpeningHours),
          peopleAlsoSearch: stringifyField(place.peopleAlsoSearch),
          placesTags: stringifyField(place.placesTags),
          reviewsTags: stringifyField(place.reviewsTags),
          additionalInfo: Object.keys(additionalInfo).length > 0 ? stringifyField(additionalInfo) : undefined,
          gasPrices: stringifyField(place.gasPrices),
          url: place.url || undefined,
          searchPageUrl: place.searchPageUrl || undefined,
          searchString: place.searchString || undefined,
          language: place.language || undefined,
          rank: place.rank || undefined,
          isAdvertisement: place.isAdvertisement || undefined,
          imageUrl: place.imageUrl || undefined,
          kgmid: place.kgmid || undefined,
          subTitle: place.subTitle || undefined,
          locatedIn: place.locatedIn || undefined,
          plusCode: place.plusCode || undefined,
          menu: stringifyField(place.menu),
          reviewsDistribution: stringifyField(place.reviewsDistribution),
          reserveTableUrl: place.reserveTableUrl || undefined,
          hotelStars: place.hotelStars || undefined,
          hotelDescription: place.hotelDescription || undefined,
          checkInDate: place.checkInDate || undefined,
          checkOutDate: place.checkOutDate || undefined,
          similarHotelsNearby: stringifyField(place.similarHotelsNearby),
          hotelReviewSummary: stringifyField(place.hotelReviewSummary),
          popularTimesLiveText: place.popularTimesLiveText || undefined,
          popularTimesLivePercent: place.popularTimesLivePercent || undefined,
          popularTimesHistogram: stringifyField(place.popularTimesHistogram),
          openingHoursBusinessConfirmationText: place.openingHoursBusinessConfirmationText || undefined,
          questionsAndAnswers: stringifyField(place.questionsAndAnswers),
          updatesFromCustomers: stringifyField(place.updatesFromCustomers),
          inputPlaceId: place.inputPlaceId || undefined,
          userPlaceNote: place.userPlaceNote || undefined,
          webResults: stringifyField(place.webResults),
          tableReservationLinks: stringifyField(place.tableReservationLinks),
          bookingLinks: stringifyField(place.bookingLinks),
          orderBy: stringifyField(place.orderBy),
          restaurantData: stringifyField(place.restaurantData),
          ownerUpdates: stringifyField(place.ownerUpdates),
          imageUrls: stringifyField(place.imageUrls),
          leadsEnrichment: stringifyField(place.leadsEnrichment),
          claimThisBusiness: place.claimThisBusiness !== undefined ? place.claimThisBusiness : undefined,
          what_customers_are_saying_seo: place.what_customers_are_saying_seo || undefined,
        };
        
        // Remove undefined values to keep transactions clean
        Object.keys(buffetData).forEach(key => {
          if (buffetData[key] === undefined) {
            delete buffetData[key];
          }
        });
        
        const buffetTx = db.tx.buffets[buffetId].create(buffetData);
        
        // Link to city if we have one
        if (cityId) {
          buffetTx.link({ city: cityId });
        }
        
        buffetTxs.push(buffetTx);
      } catch (error) {
        skippedCount.errors++;
        console.error(`  ✗ Error processing buffet ${i + 1} (${place.title || 'Unknown'}):`, error.message);
        // Continue processing other buffets
      }
    }
    
    console.log(`\n✓ Processing complete:`);
    console.log(`  - ${buffetTxs.length} buffets to import`);
    console.log(`  - ${cityTxs.length} cities to create`);
    console.log(`  - ${skippedCount.duplicates} duplicates skipped`);
    console.log(`  - ${skippedCount.missingFields} skipped (missing required fields)`);
    console.log(`  - ${skippedCount.errors} errors encountered`);
    
    // Import cities first
    if (cityTxs.length > 0) {
      console.log(`\nImporting ${cityTxs.length} new cities...`);
      await db.transact(cityTxs);
      console.log(`  ✓ Imported ${cityTxs.length} cities`);
    } else {
      console.log(`\n✓ No new cities to import`);
    }
    
    // Import buffets in batches for performance
    if (buffetTxs.length > 0) {
      console.log(`\nImporting ${buffetTxs.length} buffets in batches...`);
      const BATCH_SIZE = 100;
      const totalBatches = Math.ceil(buffetTxs.length / BATCH_SIZE);
      
      for (let i = 0; i < buffetTxs.length; i += BATCH_SIZE) {
        const batch = buffetTxs.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        try {
          await db.transact(batch);
          console.log(`  ✓ Imported batch ${batchNum}/${totalBatches} (${batch.length} buffets)`);
        } catch (error) {
          console.error(`  ✗ Error importing batch ${batchNum}:`, error.message);
          // Continue with next batch
        }
      }
      console.log(`  ✓ Imported ${buffetTxs.length} buffets total`);
    } else {
      console.log(`\n✓ All buffets already exist`);
    }
    
    // Final stats
    const finalCities = await db.query({ cities: {} });
    const finalBuffets = await db.query({ buffets: {} });
    console.log(`\n✅ Import complete!`);
    console.log(`   Database now has ${finalCities.cities.length} cities and ${finalBuffets.buffets.length} buffets!`);
    console.log(`   Total imported this run: ${cityTxs.length} cities, ${buffetTxs.length} buffets`);
    
  } catch (error) {
    console.error('\n✗ Error importing data:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

importData();




















