// Script to scrape Chinese buffets from Google Places API
// Run with: node scripts/scrape-google-places.js [options]
// Options:
//   --city "City Name" - Scrape only a specific city
//   --state "State Name" - Scrape only a specific state
//   --limit N - Limit number of cities to process (default: all)
//   --output filename.json - Output filename (default: google_places_scraped_[timestamp].json)

const fs = require('fs');
const path = require('path');
const https = require('https');

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

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
if (!API_KEY) {
  console.error('❌ Error: GOOGLE_MAPS_API_KEY not found in environment variables');
  console.error('   Please add it to .env.local file');
  process.exit(1);
}

// Helper function to make HTTP requests
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message || 'API Error'));
          } else {
            resolve(json);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// Rate limiting: Google Places API allows 100 requests per 100 seconds per user
// We'll be conservative and add delays
const RATE_LIMIT_DELAY = 1100; // 1.1 seconds between requests (slightly above 100 req/100s)
let lastRequestTime = 0;

// Helper function to add rate limiting delay
async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    const delay = RATE_LIMIT_DELAY - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

// Helper function to retry API calls with exponential backoff
async function retryApiCall(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limit exceeded - wait longer
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`   ⚠️  Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      if (attempt === maxRetries) throw error;
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`   ⚠️  Error (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Load cities from CSV
function loadCities() {
  const csvPath = path.join(__dirname, '../Research/us_cities_over_100k_2024_census_estimates.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('❌ Error: Cities CSV file not found at:', csvPath);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').slice(1); // Skip header
  const cities = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const parts = line.split(',');
    if (parts.length >= 4) {
      const [rank, city, state, population] = parts;
      cities.push({
        rank: parseInt(rank) || index + 1,
        city: city.trim(),
        state: state.trim(),
        population: parseInt(population) || 0,
      });
    }
  });

  return cities;
}

// Search for Chinese buffets in a city
async function searchChineseBuffets(city, state, maxResults = 20) {
  const query = `Chinese buffet ${city} ${state}`;
  console.log(`   🔍 Searching: "${query}"`);

  try {
    const response = await retryApiCall(async () => {
      // Use the new Places API (New) - searchText endpoint via HTTP
      const encodedQuery = encodeURIComponent(query);
      const placesBase = 'https://places.' + 'googleapis.com/v1';
      const url = `${placesBase}/places:searchText?key=${API_KEY}`;
      
      const requestBody = JSON.stringify({
        textQuery: query,
        includedType: 'restaurant',
        maxResultCount: maxResults,
      });

      return new Promise((resolve, reject) => {
        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.priceLevel,places.websiteUri,places.nationalPhoneNumber,places.regularOpeningHours,places.photos,places.businessStatus,places.plusCode,places.googleMapsUri,places.addressComponents,places.editorialSummary,places.currentOpeningHours,places.primaryType,places.viewport',
          },
        };

        const req = https.request(url, options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                reject(new Error(json.error.message || 'API Error'));
              } else {
                resolve({ data: json });
              }
            } catch (e) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.write(requestBody);
        req.end();
      });
    });

    if (response.data.places && response.data.places.length > 0) {
      console.log(`   ✅ Found ${response.data.places.length} results`);
      return response.data.places;
    } else {
      console.log(`   ℹ️  No results found`);
      return [];
    }
  } catch (error) {
    console.error(`   ❌ Error searching:`, error.message);
    return [];
  }
}

// Get detailed place information
async function getPlaceDetails(placeId) {
  try {
    const response = await retryApiCall(async () => {
      // Use the new Places API (New) - place endpoint via HTTP
      const placesBase = 'https://places.' + 'googleapis.com/v1';
      const url = `${placesBase}/places/${placeId}?key=${API_KEY}`;
      
      return new Promise((resolve, reject) => {
        const options = {
          method: 'GET',
          headers: {
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,addressComponents,addressDescriptor,adrFormatAddress,shortFormattedAddress,postalAddress,location,rating,userRatingCount,priceLevel,priceRange,types,websiteUri,nationalPhoneNumber,internationalPhoneNumber,regularOpeningHours,regularSecondaryOpeningHours,currentOpeningHours,currentSecondaryOpeningHours,photos,reviews,editorialSummary,businessStatus,plusCode,googleMapsUri,googleMapsLinks,primaryType,primaryTypeDisplayName,paymentOptions,parkingOptions,accessibilityOptions,servesBreakfast,servesLunch,servesDinner,servesBrunch,servesBeer,servesWine,servesVegetarianFood,takeout,dineIn,delivery,reservable,menuForChildren,servesDessert,servesCocktails,servesCoffee,allowsDogs,curbsidePickup,viewport,iconMaskBaseUri,iconBackgroundColor,containingPlaces,subDestinations,utcOffsetMinutes,pureServiceAreaBusiness,attributions',
          },
        };

        const req = https.request(url, options, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                reject(new Error(json.error.message || 'API Error'));
              } else {
                resolve({ data: json });
              }
            } catch (e) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          });
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.end();
      });
    });

    return response.data;
  } catch (error) {
    console.error(`   ❌ Error getting place details:`, error.message);
    return null;
  }
}

// Transform Google Places API (New) result to our format
function transformPlaceData(place, details, options = {}) {
  const { maxReviews = 5, maxPhotos = 10 } = options;
  // Use details if available, otherwise use place data
  const placeData = details || place;
  
  const addressComponents = placeData?.addressComponents || [];
  
  // Extract address components (new API format)
  const getComponent = (type) => {
    const component = addressComponents.find(c => {
      // New API uses componentTypes array
      const types = c.componentTypes || c.types || [];
      return types.includes(type);
    });
    // New API uses longText or text fields
    return component?.longText || component?.text || '';
  };

  const street = (getComponent('street_number') + ' ' + getComponent('route')).trim();
  const city = getComponent('locality') || getComponent('administrative_area_level_2');
  const state = getComponent('administrative_area_level_1');
  const postalCode = getComponent('postal_code');
  const countryCode = getComponent('country');

  // Extract categories (types in new API)
  const categories = (placeData?.types || [])
    .filter(type => !type.startsWith('point_of_interest') && type !== 'establishment')
    .map(type => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

  // Extract opening hours (new API format)
  const openingHours = [];
  if (placeData?.regularOpeningHours?.weekdayDescriptions) {
    placeData.regularOpeningHours.weekdayDescriptions.forEach(text => {
      const match = text.match(/^(.+?):\s*(.+)$/);
      if (match) {
        openingHours.push({
          day: match[1],
          hours: match[2],
        });
      }
    });
  }

  // Extract current opening hours (real-time)
  const currentOpeningHours = placeData?.currentOpeningHours || null;

  // Extract reviews
  const reviews = (placeData?.reviews || []).slice(0, maxReviews).map(review => ({
    author: review.authorAttribution?.displayName || 'Anonymous',
    rating: review.rating || null,
    text: review.text?.text || '',
    time: review.publishTime || null,
    relativeTime: review.relativePublishTimeDescription || null,
  }));

  // Extract photos with references only
  const photos = (placeData?.photos || []).slice(0, maxPhotos).map(photo => {
    const photoReference = photo.name || photo.photoReference;
    return {
      photoReference: photoReference,
      widthPx: photo.widthPx || null,
      heightPx: photo.heightPx || null,
      authorAttribution: photo.authorAttribution?.displayName || null,
    };
  });

  // Extract payment options
  const paymentOptions = placeData?.paymentOptions?.options || [];

  // Extract parking options
  const parkingOptions = placeData?.parkingOptions?.options || [];

  // Extract accessibility options
  const accessibilityOptions = placeData?.accessibilityOptions?.options || [];

  // Extract service options
  const serviceOptions = {
    takeout: placeData?.takeout || false,
    dineIn: placeData?.dineIn || false,
    delivery: placeData?.delivery || false,
    reservable: placeData?.reservable || false,
  };

  // Extract food service options
  const foodServiceOptions = {
    servesBreakfast: placeData?.servesBreakfast || false,
    servesLunch: placeData?.servesLunch || false,
    servesDinner: placeData?.servesDinner || false,
    servesBrunch: placeData?.servesBrunch || false,
    servesBeer: placeData?.servesBeer || false,
    servesWine: placeData?.servesWine || false,
    servesVegetarianFood: placeData?.servesVegetarianFood || false,
    servesDessert: placeData?.servesDessert || false,
    servesCocktails: placeData?.servesCocktails || false,
    servesCoffee: placeData?.servesCoffee || false,
    menuForChildren: placeData?.menuForChildren || false,
  };

  // Extract editorial summary
  const editorialSummary = placeData?.editorialSummary?.text || null;

  // Extract primary type
  const primaryType = placeData?.primaryType || null;

  // Extract viewport
  const viewport = placeData?.viewport || null;

  // Extract icon info
  const iconInfo = {
    iconMaskBaseUri: placeData?.iconMaskBaseUri || null,
    iconBackgroundColor: placeData?.iconBackgroundColor || null,
  };

  // Extract additional address formats
  const addressFormats = {
    addressDescriptor: placeData?.addressDescriptor || null,
    adrFormatAddress: placeData?.adrFormatAddress || null,
    shortFormattedAddress: placeData?.shortFormattedAddress || null,
    postalAddress: placeData?.postalAddress || null,
  };

  // Extract secondary opening hours
  const secondaryOpeningHours = {
    regular: placeData?.regularSecondaryOpeningHours || null,
    current: placeData?.currentSecondaryOpeningHours || null,
  };

  // Extract price range (different from priceLevel)
  const priceRange = placeData?.priceRange || null;

  // Extract Google Maps links
  const googleMapsLinks = placeData?.googleMapsLinks || null;

  // Extract additional place information
  const placeInfo = {
    primaryTypeDisplayName: placeData?.primaryTypeDisplayName || null,
    containingPlaces: placeData?.containingPlaces || null,
    subDestinations: placeData?.subDestinations || null,
    utcOffsetMinutes: placeData?.utcOffsetMinutes || null,
    pureServiceAreaBusiness: placeData?.pureServiceAreaBusiness || false,
    attributions: placeData?.attributions || null,
  };

  // Extract additional service options
  const additionalServiceOptions = {
    allowsDogs: placeData?.allowsDogs || false,
    curbsidePickup: placeData?.curbsidePickup || false,
  };

  // Determine if it's a buffet
  const placeName = placeData?.displayName?.text || placeData?.name || '';
  const isBuffet = categories.some(cat => 
    cat.toLowerCase().includes('buffet') || 
    (cat.toLowerCase().includes('chinese') && placeName.toLowerCase().includes('buffet'))
  );

  // Extract location
  const location = placeData?.location || {};
  const lat = location.latitude || location.lat;
  const lng = location.longitude || location.lng;

  return {
    title: placeName,
    description: editorialSummary, // Editorial summary from Google
    price: placeData?.priceLevel ? '$'.repeat(placeData.priceLevel) : null,
    categoryName: categories.find(c => c.toLowerCase().includes('chinese')) || categories[0] || 'Restaurant',
    primaryType: primaryType,
    address: placeData?.formattedAddress || '',
    neighborhood: null, // Would need additional API call
    street: street,
    city: city,
    postalCode: postalCode,
    state: state,
    countryCode: countryCode,
    website: placeData?.websiteUri || null,
    claimThisBusiness: false,
    location: {
      lat: lat,
      lng: lng,
    },
    viewport: viewport,
    totalScore: placeData?.rating || null,
    permanentlyClosed: placeData?.businessStatus === 'CLOSED_PERMANENTLY',
    temporarilyClosed: placeData?.businessStatus === 'CLOSED_TEMPORARILY',
    placeId: (placeData?.id || placeData?.placeId || '').replace('places/', '') || null,
    categories: categories,
    fid: null, // Not available in Places API
    cid: null, // Not available in Places API
    reviewsCount: placeData?.userRatingCount || 0,
    reviews: reviews, // Individual reviews with text
    imagesCount: placeData?.photos?.length || 0,
    photos: photos, // Photo metadata and URLs
    imageCategories: null, // Would need additional processing
    scrapedAt: new Date().toISOString(),
    googleFoodUrl: null,
    hotelAds: [],
    openingHours: openingHours,
    currentOpeningHours: currentOpeningHours, // Real-time hours
    phone: placeData?.nationalPhoneNumber || null,
    phoneUnformatted: placeData?.internationalPhoneNumber || null,
    url: placeData?.googleMapsUri || null,
    plusCode: placeData?.plusCode?.globalCode || null,
    isBuffet: isBuffet, // Flag to help filter later
    // New additional fields
    paymentOptions: paymentOptions,
    parkingOptions: parkingOptions,
    accessibilityOptions: accessibilityOptions,
    serviceOptions: serviceOptions,
    foodServiceOptions: foodServiceOptions,
    additionalServiceOptions: additionalServiceOptions,
    iconInfo: iconInfo,
    addressFormats: addressFormats,
    secondaryOpeningHours: secondaryOpeningHours,
    priceRange: priceRange,
    googleMapsLinks: googleMapsLinks,
    placeInfo: placeInfo,
  };
}

// Main scraping function
async function scrapeGooglePlaces(options = {}) {
  const { cityFilter, stateFilter, limit, outputFile, maxResultsPerCity, maxReviews, maxPhotos } = options;
  
  console.log('🚀 Starting Google Places API scraping...\n');
  console.log(`📋 Configuration:`);
  console.log(`   API Key: ${API_KEY.substring(0, 10)}...`);
  if (cityFilter) console.log(`   City filter: ${cityFilter}`);
  if (stateFilter) console.log(`   State filter: ${stateFilter}`);
  if (limit) console.log(`   Limit: ${limit} cities`);
  if (maxResultsPerCity) console.log(`   Max results per city: ${maxResultsPerCity}`);
  if (maxReviews) console.log(`   Max reviews per place: ${maxReviews}`);
  if (maxPhotos) console.log(`   Max photos per place: ${maxPhotos}`);
  console.log('');

  // Load cities
  let cities = loadCities();
  console.log(`📊 Loaded ${cities.length} cities from CSV\n`);

  // Apply filters
  if (cityFilter) {
    cities = cities.filter(c => c.city.toLowerCase() === cityFilter.toLowerCase());
  }
  if (stateFilter) {
    cities = cities.filter(c => c.state.toLowerCase() === stateFilter.toLowerCase());
  }
  if (limit) {
    cities = cities.slice(0, parseInt(limit));
  }

  console.log(`🎯 Processing ${cities.length} cities...\n`);

  const allPlaces = [];
  let processedCities = 0;
  let totalPlacesFound = 0;

  for (const cityData of cities) {
    processedCities++;
    console.log(`[${processedCities}/${cities.length}] ${cityData.city}, ${cityData.state}`);

    // Search for places
    const searchResults = await searchChineseBuffets(cityData.city, cityData.state, maxResultsPerCity || 20);

    if (searchResults.length === 0) {
      console.log('');
      continue;
    }

    // Get details for each place
    const places = [];
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const placeName = result.displayName?.text || result.name || 'Unknown';
      // New API returns place ID in format "places/ChIJ..." - we need just the ID part
      let placeId = result.id || result.placeId;
      if (placeId && placeId.startsWith('places/')) {
        placeId = placeId.replace('places/', '');
      }
      
      console.log(`   📍 [${i + 1}/${searchResults.length}] Getting details for: ${placeName}`);
      
      if (!placeId) {
        console.log(`   ⚠️  No place ID found, using search result data`);
        const transformed = transformPlaceData(result, null, { maxReviews: maxReviews || 5, maxPhotos: maxPhotos || 10 });
        places.push(transformed);
        continue;
      }
      
      const details = await getPlaceDetails(placeId);
      if (details) {
        const transformed = transformPlaceData(result, details, { maxReviews: maxReviews || 5, maxPhotos: maxPhotos || 10 });
        places.push(transformed);
      } else {
        // Fallback to search result if details fetch fails
        const transformed = transformPlaceData(result, null, { maxReviews: maxReviews || 5, maxPhotos: maxPhotos || 10 });
        places.push(transformed);
      }
    }

    // Filter for Chinese buffets
    const buffets = places.filter(p => {
      const nameLower = p.title?.toLowerCase() || '';
      const categoriesLower = p.categories?.join(' ').toLowerCase() || '';
      return (
        nameLower.includes('buffet') ||
        categoriesLower.includes('buffet') ||
        (categoriesLower.includes('chinese') && nameLower.includes('buffet'))
      );
    });

    console.log(`   ✅ Found ${buffets.length} Chinese buffets (out of ${places.length} restaurants)`);
    allPlaces.push(...buffets);
    totalPlacesFound += buffets.length;
    console.log('');

    // Save progress periodically (every 10 cities)
    if (processedCities % 10 === 0) {
      const progressFile = outputFile.replace('.json', '_progress.json');
      fs.writeFileSync(progressFile, JSON.stringify(allPlaces, null, 2));
      console.log(`   💾 Progress saved to ${progressFile}\n`);
    }
  }

  // Save final results
  console.log(`\n✅ Scraping complete!`);
  console.log(`   Processed: ${processedCities} cities`);
  console.log(`   Found: ${totalPlacesFound} Chinese buffets`);
  console.log(`   Saving to: ${outputFile}`);

  fs.writeFileSync(outputFile, JSON.stringify(allPlaces, null, 2));
  console.log(`\n🎉 Done! Results saved to ${outputFile}`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--city' && args[i + 1]) {
      options.cityFilter = args[i + 1];
      i++;
    } else if (args[i] === '--state' && args[i + 1]) {
      options.stateFilter = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--max-results' && args[i + 1]) {
      options.maxResultsPerCity = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--max-reviews' && args[i + 1]) {
      options.maxReviews = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--max-photos' && args[i + 1]) {
      options.maxPhotos = parseInt(args[i + 1]);
      i++;
    }
  }

  // Default output filename
  if (!options.outputFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    options.outputFile = path.join(__dirname, '../Example JSON', `google_places_scraped_${timestamp}.json`);
  } else {
    options.outputFile = path.resolve(options.outputFile);
  }

  return options;
}

// Run the script
if (require.main === module) {
  const options = parseArgs();
  scrapeGooglePlaces(options).catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { scrapeGooglePlaces };





















