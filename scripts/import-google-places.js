// Script to import Google Places JSON data to Instant DB using Admin API
// Run with: node scripts/import-google-places.js

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

async function importData() {
  console.log('Reading Google Places JSON data...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('JSON file not found at:', jsonPath);
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${jsonData.length} places from JSON`);
  
  // Load cities from CSV if available (optional)
  let citiesMap = new Map();
  const csvPath = path.join(__dirname, '../Research/us_cities_over_100k_2024_census_estimates.csv');
  if (fs.existsSync(csvPath)) {
    console.log('Loading cities from CSV...');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split('\n').slice(1); // Skip header
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const [rank, city, state, stateAbbr, population] = line.split(',');
      if (city && state) {
        const citySlug = generateCitySlug(city, stateAbbr || state);
        citiesMap.set(`${normalizeCityName(city).toLowerCase()}-${normalizeStateName(state).toLowerCase()}`, {
          rank: parseInt(rank) || index + 1,
          city: city.trim(),
          state: state.trim(),
          stateAbbr: (stateAbbr || normalizeStateName(state)).trim(),
          population: parseInt(population) || 0,
          slug: citySlug,
        });
      }
    });
    console.log(`  Loaded ${citiesMap.size} cities from CSV`);
  }
  
  try {
    // Get existing cities and buffets
    console.log('\nChecking existing data...');
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
    existingCities.cities.forEach(city => {
      cityMap.set(city.slug, city.id);
      // Also add by city-state key for matching
      const key = `${normalizeCityName(city.city).toLowerCase()}-${normalizeStateName(city.state).toLowerCase()}`;
      citiesMap.set(key, {
        ...city,
        slug: city.slug,
      });
    });
    
    // Process and import buffets
    console.log('\nProcessing buffets...');
    const cityTxs = [];
    const buffetTxs = [];
    const citySlugMap = new Map(); // city-state key -> slug
    
    for (const place of jsonData) {
      // Skip if already exists
      if (place.placeId && existingBuffetPlaceIds.has(place.placeId)) {
        continue;
      }
      
      // Extract data
      const cityName = normalizeCityName(place.city || '');
      const stateName = place.state || '';
      const stateAbbr = normalizeStateName(stateName);
      const cityStateKey = `${cityName.toLowerCase()}-${stateAbbr.toLowerCase()}`;
      
      // Find or create city
      let cityId = null;
      let citySlug = null;
      
      if (citiesMap.has(cityStateKey)) {
        const cityData = citiesMap.get(cityStateKey);
        citySlug = cityData.slug;
        
        if (cityMap.has(citySlug)) {
          cityId = cityMap.get(citySlug);
        } else {
          // Create new city
          const newCityId = id();
          cityMap.set(citySlug, newCityId);
          cityTxs.push(
            db.tx.cities[newCityId].create({
              rank: cityData.rank || 9999,
              city: cityData.city,
              state: cityData.state,
              stateAbbr: cityData.stateAbbr,
              population: cityData.population || 0,
              slug: citySlug,
            })
          );
          cityId = newCityId;
        }
      } else {
        // Create city on the fly
        citySlug = generateCitySlug(cityName, stateAbbr);
        if (!cityMap.has(citySlug)) {
          const newCityId = id();
          cityMap.set(citySlug, newCityId);
          cityTxs.push(
            db.tx.cities[newCityId].create({
              rank: 9999,
              city: cityName,
              state: stateName,
              stateAbbr: stateAbbr,
              population: 0,
              slug: citySlug,
            })
          );
          cityId = newCityId;
        } else {
          cityId = cityMap.get(citySlug);
        }
      }
      
      // Generate buffet slug
      const buffetName = place.title || 'Unknown Restaurant';
      let buffetSlug = generateSlug(buffetName);
      // Make slug unique by adding city if needed
      if (citySlug) {
        buffetSlug = `${buffetSlug}-${citySlug.split('-').pop()}`;
      }
      
      // Create buffet transaction
      const buffetId = id();
      const location = place.location || { lat: 0, lng: 0 };
      
      // Use only original schema fields for now (until schema is synced with InstantDB)
      // Set USE_EXTENDED_FIELDS=true to include all new fields after schema sync
      const USE_EXTENDED_FIELDS = process.env.USE_EXTENDED_FIELDS === 'true';
      
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
        // Optional fields from original schema
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
        hours: stringifyField(place.openingHours),
        categories: stringifyField(place.categories),
      };
      
      // Add extended fields only if flag is set and schema is synced
      if (USE_EXTENDED_FIELDS) {
        Object.assign(buffetData, {
          description: place.description,
          countryCode: place.countryCode,
          fid: place.fid,
          cid: place.cid,
          imageCategories: stringifyField(place.imageCategories),
          scrapedAt: place.scrapedAt,
          googleFoodUrl: place.googleFoodUrl,
          hotelAds: stringifyField(place.hotelAds),
          additionalOpeningHours: stringifyField(place.additionalOpeningHours),
          peopleAlsoSearch: stringifyField(place.peopleAlsoSearch),
          placesTags: stringifyField(place.placesTags),
          reviewsTags: stringifyField(place.reviewsTags),
          additionalInfo: stringifyField(place.additionalInfo),
          gasPrices: stringifyField(place.gasPrices),
          url: place.url,
          searchPageUrl: place.searchPageUrl,
          searchString: place.searchString,
          language: place.language,
          rank: place.rank,
          isAdvertisement: place.isAdvertisement,
          imageUrl: place.imageUrl,
          kgmid: place.kgmid,
          subTitle: place.subTitle,
          locatedIn: place.locatedIn,
          plusCode: place.plusCode,
          menu: stringifyField(place.menu),
          reviewsDistribution: stringifyField(place.reviewsDistribution),
          reserveTableUrl: place.reserveTableUrl,
          hotelStars: place.hotelStars,
          hotelDescription: place.hotelDescription,
          checkInDate: place.checkInDate,
          checkOutDate: place.checkOutDate,
          similarHotelsNearby: stringifyField(place.similarHotelsNearby),
          hotelReviewSummary: stringifyField(place.hotelReviewSummary),
          popularTimesLiveText: place.popularTimesLiveText,
          popularTimesLivePercent: place.popularTimesLivePercent,
          popularTimesHistogram: stringifyField(place.popularTimesHistogram),
          openingHoursBusinessConfirmationText: place.openingHoursBusinessConfirmationText,
          questionsAndAnswers: stringifyField(place.questionsAndAnswers),
          updatesFromCustomers: stringifyField(place.updatesFromCustomers),
          inputPlaceId: place.inputPlaceId,
          userPlaceNote: place.userPlaceNote,
          webResults: stringifyField(place.webResults),
          tableReservationLinks: stringifyField(place.tableReservationLinks),
          bookingLinks: stringifyField(place.bookingLinks),
          orderBy: stringifyField(place.orderBy),
          restaurantData: stringifyField(place.restaurantData),
          ownerUpdates: stringifyField(place.ownerUpdates),
          imageUrls: stringifyField(place.imageUrls),
          images: stringifyField(place.images),
          reviews: stringifyField(place.reviews),
          leadsEnrichment: stringifyField(place.leadsEnrichment),
          claimThisBusiness: place.claimThisBusiness,
        });
      }
      
      // Remove undefined values
      Object.keys(buffetData).forEach(key => {
        if (buffetData[key] === undefined) {
          delete buffetData[key];
        }
      });
      
      // Remove undefined values
      Object.keys(buffetData).forEach(key => {
        if (buffetData[key] === undefined) {
          delete buffetData[key];
        }
      });
      
      const buffetTx = db.tx.buffets[buffetId]
        .create(buffetData);
      
      // Link to city if we have one
      if (cityId) {
        buffetTx.link({ city: cityId });
      }
      
      buffetTxs.push(buffetTx);
    }
    
    // Import cities first
    if (cityTxs.length > 0) {
      console.log(`\nImporting ${cityTxs.length} new cities...`);
      await db.transact(cityTxs);
      console.log(`  ✓ Imported ${cityTxs.length} cities`);
    }
    
    // Import buffets in batches
    if (buffetTxs.length > 0) {
      console.log(`\nImporting ${buffetTxs.length} buffets...`);
      const BATCH_SIZE = 100;
      for (let i = 0; i < buffetTxs.length; i += BATCH_SIZE) {
        const batch = buffetTxs.slice(i, i + BATCH_SIZE);
        await db.transact(batch);
        console.log(`  ✓ Imported batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(buffetTxs.length / BATCH_SIZE)} (${batch.length} buffets)`);
      }
      console.log(`  ✓ Imported ${buffetTxs.length} buffets total`);
    } else {
      console.log(`\n✓ All buffets already exist`);
    }
    
    // Final stats
    const finalCities = await db.query({ cities: {} });
    const finalBuffets = await db.query({ buffets: {} });
    console.log(`\n✅ Database now has ${finalCities.cities.length} cities and ${finalBuffets.buffets.length} buffets!`);
    
  } catch (error) {
    console.error('Error importing data:', error);
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

// App ID is optional if hardcoded in script

importData();
