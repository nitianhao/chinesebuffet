// Batch script to scrape multiple cities and append to a single JSON file
// Run with: node scripts/scrape-batch-cities.js

// #region agent log
fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:7',message:'Script entry - modules loading',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const fs = require('fs');
const path = require('path');
const https = require('https');

// #region agent log
fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:12',message:'Modules loaded successfully',data:{hasFs:!!fs,hasPath:!!path,hasHttps:!!https,__dirname:__dirname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
// #endregion

// Load environment variables
// #region agent log
fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:15',message:'Before env loading',data:{__dirname:__dirname},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
// #endregion

const envPath = path.join(__dirname, '../.env.local');
// #region agent log
fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:18',message:'Env path resolved',data:{envPath:envPath,envExists:fs.existsSync(envPath)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
// #endregion

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
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:30',message:'Env file loaded',data:{hasApiKey:!!process.env.GOOGLE_MAPS_API_KEY,apiKeyLength:process.env.GOOGLE_MAPS_API_KEY?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
// #region agent log
fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:35',message:'API key check',data:{hasApiKey:!!API_KEY,apiKeyLength:API_KEY?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion

if (!API_KEY) {
  console.error('❌ Error: GOOGLE_MAPS_API_KEY not found in environment variables');
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:39',message:'API key missing - exiting',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  process.exit(1);
}

// Rate limiting
const RATE_LIMIT_DELAY = 1100;
let lastRequestTime = 0;

async function rateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    const delay = RATE_LIMIT_DELAY - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastRequestTime = Date.now();
}

async function retryApiCall(fn, maxRetries = 3) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:70',message:'retryApiCall entry',data:{maxRetries},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await rateLimit();
      const result = await fn();
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:75',message:'retryApiCall success',data:{attempt,hasResult:!!result},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return result;
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:78',message:'retryApiCall error caught',data:{attempt,maxRetries,errorMessage:error?.message,errorStack:error?.stack?.substring(0,200),statusCode:error?.response?.status,isRateLimit:error?.response?.status===429},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      if (error.response?.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`   ⚠️  Rate limited. Waiting ${waitTime}ms before retry ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      if (attempt === maxRetries) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:87',message:'retryApiCall max retries reached - throwing',data:{attempt,maxRetries,errorMessage:error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`   ⚠️  Error (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Search for Chinese buffets and AYCE restaurants in a city/neighborhood with pagination support (up to 200 results per query)
async function searchChineseBuffets(city, state, maxResults = 500, neighborhood = null) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:91',message:'searchChineseBuffets entry',data:{city,state,maxResults,neighborhood,hasNeighborhood:!!neighborhood},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  // Build location string - include neighborhood if provided
  const location = neighborhood ? `${neighborhood} ${city} ${state}` : `${city} ${state}`;
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:95',message:'Location string built',data:{location,neighborhood,city,state},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  // Multiple search queries to catch different variations - MAXIMUM COVERAGE
  const searchQueries = [
    `Chinese buffet ${location}`,
    `Chinese all you can eat ${location}`,
    `Chinese AYCE ${location}`,
    `Chinese restaurant ${location}`,
    `Chinese food ${location}`,
    `Chinese diner ${location}`,
  ];

  const allPlaces = [];
  const seenPlaceIds = new Set(); // Track place IDs to avoid duplicates across queries

  for (const query of searchQueries) {
    console.log(`   🔍 Searching: "${query}"`);

    let nextPageToken = null;
    let pageCount = 0;
    const maxPages = 10; // Maximum pages per query = 10 pages × 20 = 200 results per query

    try {
      do {
        pageCount++;
        const response = await retryApiCall(async () => {
  const placesBase = 'https://places.' + 'googleapis.com/v1';
  const url = `${placesBase}/places:searchText?key=${API_KEY}`;
          
          const requestBody = JSON.stringify({
            textQuery: query,
            includedType: 'restaurant',
            pageSize: 20, // Maximum per page
            pageToken: nextPageToken || undefined,
          });

          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:147',message:'API call starting',data:{query,hasPageToken:!!nextPageToken,requestBodyLength:requestBody.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion

        return new Promise((resolve, reject) => {
          const options = {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.priceLevel,places.websiteUri,places.nationalPhoneNumber,places.regularOpeningHours,places.photos,places.businessStatus,places.plusCode,places.googleMapsUri,places.addressComponents,places.editorialSummary,places.currentOpeningHours,places.primaryType,places.viewport',
            },
          };

          const req = https.request(url, options, (res) => {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:163',message:'API response received',data:{statusCode:res.statusCode,statusMessage:res.statusMessage,headers:Object.keys(res.headers)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:172',message:'API response end - parsing',data:{dataLength:data.length,statusCode:res.statusCode,dataPreview:data.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                
                const json = JSON.parse(data);
                if (json.error) {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:176',message:'API error in response',data:{error:json.error,statusCode:res.statusCode},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                  // #endregion
                  reject(new Error(json.error.message || 'API Error'));
                } else {
                  // #region agent log
                  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:180',message:'API success',data:{hasPlaces:!!json.places,placesCount:json.places?.length,hasNextPageToken:!!json.nextPageToken},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                  // #endregion
                  resolve({ data: json });
                }
              } catch (e) {
                // #region agent log
                fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:186',message:'API parse error',data:{errorMessage:e.message,dataLength:data.length,dataPreview:data.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                reject(new Error(`Failed to parse response: ${e.message}`));
              }
            });
          });

          req.on('error', (err) => {
            // #region agent log
            fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:194',message:'API request error',data:{errorMessage:err.message,errorCode:err.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            reject(err);
          });

          req.write(requestBody);
          req.end();
        });
      });

        if (response.data.places && response.data.places.length > 0) {
          // Filter out duplicates by place ID
          const newPlaces = response.data.places.filter(place => {
            const placeId = (place.id || place.placeId || '').replace('places/', '');
            if (seenPlaceIds.has(placeId)) {
              return false;
            }
            seenPlaceIds.add(placeId);
            return true;
          });

          allPlaces.push(...newPlaces);
          console.log(`   📄 Page ${pageCount}: Found ${response.data.places.length} results (${newPlaces.length} new, total: ${allPlaces.length})`);
          
          nextPageToken = response.data.nextPageToken || null;
          
          // Stop if we've reached max pages, no more pages, or enough results for this query
          if (pageCount >= maxPages || !nextPageToken) {
            break;
          }
          
          // Wait before next page (API requires delay for pagination)
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          break;
        }
      } while (nextPageToken && pageCount < maxPages);

      console.log(`   ✅ Query complete: ${allPlaces.length} unique results so far`);
      
      // Small delay between different search queries
      if (searchQueries.indexOf(query) < searchQueries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    } catch (error) {
      console.error(`   ❌ Error searching with query "${query}":`, error.message);
      // Continue with next query
    }
  }

  if (allPlaces.length > 0) {
    console.log(`   ✅ Total unique results: ${allPlaces.length}`);
    return allPlaces;
  } else {
    console.log(`   ℹ️  No results found`);
    return [];
  }
}

// Get detailed place information
async function getPlaceDetails(placeId) {
  try {
    const response = await retryApiCall(async () => {
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
  const placeData = details || place;
  
  const addressComponents = placeData?.addressComponents || [];
  
  const getComponent = (type) => {
    const component = addressComponents.find(c => {
      const types = c.componentTypes || c.types || [];
      return types.includes(type);
    });
    return component?.longText || component?.text || '';
  };

  const street = (getComponent('street_number') + ' ' + getComponent('route')).trim();
  const city = getComponent('locality') || getComponent('administrative_area_level_2');
  const state = getComponent('administrative_area_level_1');
  const postalCode = getComponent('postal_code');
  const countryCode = getComponent('country');

  const categories = (placeData?.types || [])
    .filter(type => !type.startsWith('point_of_interest') && type !== 'establishment')
    .map(type => type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

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

  const currentOpeningHours = placeData?.currentOpeningHours || null;

  const reviews = (placeData?.reviews || []).slice(0, maxReviews).map(review => ({
    author: review.authorAttribution?.displayName || 'Anonymous',
    rating: review.rating || null,
    text: review.text?.text || '',
    time: review.publishTime || null,
    relativeTime: review.relativePublishTimeDescription || null,
  }));

  const photos = (placeData?.photos || []).slice(0, maxPhotos).map(photo => {
    const photoReference = photo.name || photo.photoReference;
    return {
      photoReference: photoReference,
      widthPx: photo.widthPx || null,
      heightPx: photo.heightPx || null,
      authorAttribution: photo.authorAttribution?.displayName || null,
    };
  });

  const paymentOptions = placeData?.paymentOptions?.options || [];
  const parkingOptions = placeData?.parkingOptions?.options || [];
  const accessibilityOptions = placeData?.accessibilityOptions?.options || [];

  const serviceOptions = {
    takeout: placeData?.takeout || false,
    dineIn: placeData?.dineIn || false,
    delivery: placeData?.delivery || false,
    reservable: placeData?.reservable || false,
  };

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

  const editorialSummary = placeData?.editorialSummary?.text || null;
  const primaryType = placeData?.primaryType || null;
  const viewport = placeData?.viewport || null;

  const iconInfo = {
    iconMaskBaseUri: placeData?.iconMaskBaseUri || null,
    iconBackgroundColor: placeData?.iconBackgroundColor || null,
  };

  const addressFormats = {
    addressDescriptor: placeData?.addressDescriptor || null,
    adrFormatAddress: placeData?.adrFormatAddress || null,
    shortFormattedAddress: placeData?.shortFormattedAddress || null,
    postalAddress: placeData?.postalAddress || null,
  };

  const secondaryOpeningHours = {
    regular: placeData?.regularSecondaryOpeningHours || null,
    current: placeData?.currentSecondaryOpeningHours || null,
  };

  const priceRange = placeData?.priceRange || null;
  const googleMapsLinks = placeData?.googleMapsLinks || null;

  const placeInfo = {
    primaryTypeDisplayName: placeData?.primaryTypeDisplayName || null,
    containingPlaces: placeData?.containingPlaces || null,
    subDestinations: placeData?.subDestinations || null,
    utcOffsetMinutes: placeData?.utcOffsetMinutes || null,
    pureServiceAreaBusiness: placeData?.pureServiceAreaBusiness || false,
    attributions: placeData?.attributions || null,
  };

  const additionalServiceOptions = {
    allowsDogs: placeData?.allowsDogs || false,
    curbsidePickup: placeData?.curbsidePickup || false,
  };

  const placeName = placeData?.displayName?.text || placeData?.name || '';
  const location = placeData?.location || {};
  const lat = location.latitude || location.lat;
  const lng = location.longitude || location.lng;

  return {
    title: placeName,
    description: editorialSummary,
    price: placeData?.priceLevel ? '$'.repeat(placeData.priceLevel) : null,
    categoryName: categories.find(c => c.toLowerCase().includes('chinese')) || categories[0] || 'Restaurant',
    primaryType: primaryType,
    address: placeData?.formattedAddress || '',
    neighborhood: null,
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
    fid: null,
    cid: null,
    reviewsCount: placeData?.userRatingCount || 0,
    reviews: reviews,
    imagesCount: placeData?.photos?.length || 0,
    photos: photos,
    imageCategories: null,
    scrapedAt: new Date().toISOString(),
    googleFoodUrl: null,
    hotelAds: [],
    openingHours: openingHours,
    currentOpeningHours: currentOpeningHours,
    phone: placeData?.nationalPhoneNumber || null,
    phoneUnformatted: placeData?.internationalPhoneNumber || null,
    url: placeData?.googleMapsUri || null,
    plusCode: placeData?.plusCode?.globalCode || null,
    isBuffet: true,
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

// List of sub-areas in New York, New York to scrape
const CITIES_TO_SCRAPE = [
  { city: 'New York', state: 'New York', neighborhood: 'Lower Manhattan (Downtown)' },
  { city: 'New York', state: 'New York', neighborhood: 'Midtown Manhattan' },
  { city: 'New York', state: 'New York', neighborhood: 'Upper Manhattan (Uptown)' },
  { city: 'New York', state: 'New York', neighborhood: 'Harlem & Washington Heights (The Heights)' },
  { city: 'New York', state: 'New York', neighborhood: 'North Brooklyn' },
  { city: 'New York', state: 'New York', neighborhood: 'Downtown Brooklyn' },
  { city: 'New York', state: 'New York', neighborhood: 'Central Brooklyn' },
  { city: 'New York', state: 'New York', neighborhood: 'South Brooklyn' },
  { city: 'New York', state: 'New York', neighborhood: 'Western Queens' },
  { city: 'New York', state: 'New York', neighborhood: 'Central Queens' },
  { city: 'New York', state: 'New York', neighborhood: 'Eastern Queens' },
  { city: 'New York', state: 'New York', neighborhood: 'The Rockaways' },
  { city: 'New York', state: 'New York', neighborhood: 'South Bronx' },
  { city: 'New York', state: 'New York', neighborhood: 'North Bronx' },
  { city: 'New York', state: 'New York', neighborhood: 'West Bronx' },
  { city: 'New York', state: 'New York', neighborhood: 'East Bronx' },
  { city: 'New York', state: 'New York', neighborhood: 'North Shore' },
  { city: 'New York', state: 'New York', neighborhood: 'Mid-Island' },
  { city: 'New York', state: 'New York', neighborhood: 'South Shore' },
];

const OUTPUT_FILE = path.join(__dirname, '../Example JSON/allcities.json');
const MAX_RESULTS_PER_CITY = 500;
const MAX_REVIEWS = 5;
const MAX_PHOTOS = 10;

// Load existing data (or start fresh if file doesn't exist)
function loadExistingData() {
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      const content = fs.readFileSync(OUTPUT_FILE, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.log('⚠️  Could not parse existing file, starting fresh');
      return [];
    }
  }
  return [];
}

// Delete existing results file
function deleteExistingResults() {
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
    console.log(`🗑️  Deleted existing results file: ${OUTPUT_FILE}`);
  }
}

// Save data
function saveData(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

// Check if place exists
function placeExists(existingData, placeId) {
  if (!placeId) return false;
  return existingData.some(p => p.placeId === placeId);
}

// Process a single city/neighborhood
async function processCity(cityData, cityIndex, totalCities, existingData) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:507',message:'processCity entry',data:{cityData,cityIndex,totalCities,hasExistingData:!!existingData,existingDataLength:existingData?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const { city, state, neighborhood } = cityData;
  const displayName = neighborhood ? `${neighborhood}, ${city}, ${state}` : `${city}, ${state}`;
  console.log(`\n[${cityIndex + 1}/${totalCities}] Processing: ${displayName}`);
  console.log('─'.repeat(60));

  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:516',message:'Before searchChineseBuffets call',data:{city,state,neighborhood,MAX_RESULTS_PER_CITY},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    const searchResults = await searchChineseBuffets(city, state, MAX_RESULTS_PER_CITY, neighborhood);
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:520',message:'After searchChineseBuffets call',data:{searchResultsLength:searchResults?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (searchResults.length === 0) {
      console.log(`   ℹ️  No results found for ${city}, ${state}`);
      return [];
    }

    console.log(`   📊 Found ${searchResults.length} search results`);

    const places = [];
    for (let i = 0; i < searchResults.length; i++) {
      const result = searchResults[i];
      const placeName = result.displayName?.text || result.name || 'Unknown';
      let placeId = result.id || result.placeId;
      if (placeId && placeId.startsWith('places/')) {
        placeId = placeId.replace('places/', '');
      }

      if (placeExists(existingData, placeId)) {
        console.log(`   ⏭️  [${i + 1}/${searchResults.length}] Skipping duplicate: ${placeName}`);
        continue;
      }

      console.log(`   📍 [${i + 1}/${searchResults.length}] Getting details for: ${placeName}`);

      if (!placeId) {
        const transformed = transformPlaceData(result, null, { maxReviews: MAX_REVIEWS, maxPhotos: MAX_PHOTOS });
        places.push(transformed);
        continue;
      }

      const details = await getPlaceDetails(placeId);
      if (details) {
        const transformed = transformPlaceData(result, details, { maxReviews: MAX_REVIEWS, maxPhotos: MAX_PHOTOS });
        places.push(transformed);
      } else {
        const transformed = transformPlaceData(result, null, { maxReviews: MAX_REVIEWS, maxPhotos: MAX_PHOTOS });
        places.push(transformed);
      }
    }

    // Filter for Chinese restaurants, diners, buffets, and AYCE
    // Note: API already filters to restaurants with includedType: 'restaurant'
    const restaurants = places.filter(p => {
      const nameLower = p.title?.toLowerCase() || '';
      const categoriesLower = p.categories?.join(' ').toLowerCase() || '';
      const descriptionLower = (p.description || '').toLowerCase();
      
      // Must be Chinese
      const isChinese = 
        categoriesLower.includes('chinese') ||
        nameLower.includes('chinese') ||
        descriptionLower.includes('chinese');
      
      // Since API already filters to restaurants, we just need to check if it's Chinese
      // This will include all Chinese restaurants, diners, buffets, and AYCE places
      return isChinese;
    });

    console.log(`   ✅ Found ${restaurants.length} Chinese restaurants/diners/buffets/AYCE (out of ${places.length} restaurants)`);
    return restaurants;
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:637',message:'processCity error caught',data:{city,state,neighborhood,errorMessage:error?.message,errorStack:error?.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    console.error(`   ❌ Error processing ${city}, ${state}:`, error.message);
    return [];
  }
}

// Main batch processing
async function processBatch() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:570',message:'processBatch entry',data:{citiesCount:CITIES_TO_SCRAPE.length,outputFile:OUTPUT_FILE},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  console.log('🚀 Starting Batch Area/Neighborhood Scraping');
  console.log('═'.repeat(60));
  console.log(`📋 Configuration:`);
  console.log(`   Total areas/neighborhoods: ${CITIES_TO_SCRAPE.length}`);
  console.log(`   Max results per area: ${MAX_RESULTS_PER_CITY}`);
  console.log(`   Search types: Chinese buffet, Chinese all you can eat, Chinese AYCE, Chinese restaurant, Chinese food, Chinese diner`);
  console.log(`   Output file: ${OUTPUT_FILE}`);
  console.log('═'.repeat(60));

  // Load existing data (don't delete - we're appending to existing results)
  let allPlaces = loadExistingData();
  const initialCount = allPlaces.length;
  console.log(`\n📂 Loaded ${initialCount} existing places from ${OUTPUT_FILE}`);

  let newPlacesCount = 0;

  for (let i = 0; i < CITIES_TO_SCRAPE.length; i++) {
    const cityData = CITIES_TO_SCRAPE[i];
    const restaurants = await processCity(cityData, i, CITIES_TO_SCRAPE.length, allPlaces);

    if (restaurants.length > 0) {
      allPlaces.push(...restaurants);
      newPlacesCount += restaurants.length;
      saveData(allPlaces);
      console.log(`   💾 Saved to ${OUTPUT_FILE} (${allPlaces.length} total places)`);
    }

    if (i < CITIES_TO_SCRAPE.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  saveData(allPlaces);

  console.log('\n' + '═'.repeat(60));
  console.log('✅ Batch Processing Complete!');
  console.log('═'.repeat(60));
  console.log(`📊 Summary:`);
  console.log(`   Cities processed: ${CITIES_TO_SCRAPE.length}`);
  console.log(`   New places added: ${newPlacesCount}`);
  console.log(`   Total places in file: ${allPlaces.length}`);
  console.log(`   Output file: ${OUTPUT_FILE}`);
  console.log('═'.repeat(60));
}

if (require.main === module) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:610',message:'Main execution entry',data:{isMainModule:require.main===module},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  processBatch().catch(error => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/3414c9ad-1916-418f-95a0-d25b9c44aa1a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'scrape-batch-cities.js:614',message:'Fatal error caught',data:{errorMessage:error?.message,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { processBatch, CITIES_TO_SCRAPE };





















