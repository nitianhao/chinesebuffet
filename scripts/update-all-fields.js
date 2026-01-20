// Script to update all buffet records with all fields from JSON file
// Maps photos -> images and updates all other available fields

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Helper to stringify JSON fields
function stringifyIfNeeded(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return value;
}

// Map JSON field names to database field names
function mapJsonToDb(jsonRecord) {
  const update = {};
  
  // Direct mappings
  if (jsonRecord.title !== undefined) update.name = jsonRecord.title;
  if (jsonRecord.description !== undefined) update.description = jsonRecord.description;
  if (jsonRecord.price !== undefined && jsonRecord.price !== '') update.price = jsonRecord.price;
  if (jsonRecord.categoryName !== undefined) update.categoryName = jsonRecord.categoryName;
  if (jsonRecord.primaryType !== undefined) update.primaryType = jsonRecord.primaryType;
  if (jsonRecord.address !== undefined) update.address = jsonRecord.address;
  if (jsonRecord.neighborhood !== undefined) update.neighborhood = jsonRecord.neighborhood;
  if (jsonRecord.street !== undefined) update.street = jsonRecord.street;
  if (jsonRecord.city !== undefined) update.cityName = jsonRecord.city;
  if (jsonRecord.postalCode !== undefined) update.postalCode = jsonRecord.postalCode;
  if (jsonRecord.state !== undefined) update.state = jsonRecord.state;
  if (jsonRecord.countryCode !== undefined) update.countryCode = jsonRecord.countryCode;
  if (jsonRecord.website !== undefined) update.website = jsonRecord.website;
  if (jsonRecord.claimThisBusiness !== undefined) update.claimThisBusiness = jsonRecord.claimThisBusiness;
  if (jsonRecord.location?.lat !== undefined) update.lat = jsonRecord.location.lat;
  if (jsonRecord.location?.lng !== undefined) update.lng = jsonRecord.location.lng;
  if (jsonRecord.totalScore !== undefined) update.rating = jsonRecord.totalScore;
  if (jsonRecord.permanentlyClosed !== undefined) update.permanentlyClosed = jsonRecord.permanentlyClosed;
  if (jsonRecord.temporarilyClosed !== undefined) update.temporarilyClosed = jsonRecord.temporarilyClosed;
  if (jsonRecord.placeId !== undefined) update.placeId = jsonRecord.placeId;
  if (jsonRecord.reviewsCount !== undefined) update.reviewsCount = jsonRecord.reviewsCount;
  if (jsonRecord.imagesCount !== undefined) update.imagesCount = jsonRecord.imagesCount;
  if (jsonRecord.fid !== undefined) update.fid = jsonRecord.fid;
  if (jsonRecord.cid !== undefined) update.cid = jsonRecord.cid;
  if (jsonRecord.scrapedAt !== undefined) update.scrapedAt = jsonRecord.scrapedAt;
  if (jsonRecord.googleFoodUrl !== undefined) update.googleFoodUrl = jsonRecord.googleFoodUrl;
  if (jsonRecord.subTitle !== undefined) update.subTitle = jsonRecord.subTitle;
  if (jsonRecord.locatedIn !== undefined) update.locatedIn = jsonRecord.locatedIn;
  if (jsonRecord.plusCode !== undefined) update.plusCode = jsonRecord.plusCode;
  if (jsonRecord.kgmid !== undefined) update.kgmid = jsonRecord.kgmid;
  if (jsonRecord.url !== undefined) update.url = jsonRecord.url;
  if (jsonRecord.searchPageUrl !== undefined) update.searchPageUrl = jsonRecord.searchPageUrl;
  if (jsonRecord.searchString !== undefined) update.searchString = jsonRecord.searchString;
  if (jsonRecord.language !== undefined) update.language = jsonRecord.language;
  if (jsonRecord.rank !== undefined) update.rank = jsonRecord.rank;
  if (jsonRecord.isAdvertisement !== undefined) update.isAdvertisement = jsonRecord.isAdvertisement;
  if (jsonRecord.imageUrl !== undefined) update.imageUrl = jsonRecord.imageUrl;
  if (jsonRecord.inputPlaceId !== undefined) update.inputPlaceId = jsonRecord.inputPlaceId;
  if (jsonRecord.userPlaceNote !== undefined) update.userPlaceNote = jsonRecord.userPlaceNote;
  if (jsonRecord.reserveTableUrl !== undefined) update.reserveTableUrl = jsonRecord.reserveTableUrl;
  if (jsonRecord.hotelStars !== undefined) update.hotelStars = jsonRecord.hotelStars;
  if (jsonRecord.hotelDescription !== undefined) update.hotelDescription = jsonRecord.hotelDescription;
  if (jsonRecord.checkInDate !== undefined) update.checkInDate = jsonRecord.checkInDate;
  if (jsonRecord.checkOutDate !== undefined) update.checkOutDate = jsonRecord.checkOutDate;
  if (jsonRecord.popularTimesLiveText !== undefined) update.popularTimesLiveText = jsonRecord.popularTimesLiveText;
  if (jsonRecord.popularTimesLivePercent !== undefined) update.popularTimesLivePercent = jsonRecord.popularTimesLivePercent;
  if (jsonRecord.openingHoursBusinessConfirmationText !== undefined) update.openingHoursBusinessConfirmationText = jsonRecord.openingHoursBusinessConfirmationText;
  if (jsonRecord.what_customers_are_saying_seo !== undefined) update.what_customers_are_saying_seo = jsonRecord.what_customers_are_saying_seo;
  
  // Array/Object fields - stringify them
  if (jsonRecord.categories !== undefined) update.categories = stringifyIfNeeded(jsonRecord.categories);
  if (jsonRecord.photos !== undefined) update.images = stringifyIfNeeded(jsonRecord.photos); // Map photos -> images
  if (jsonRecord.imageUrls !== undefined) update.imageUrls = stringifyIfNeeded(jsonRecord.imageUrls);
  if (jsonRecord.imageCategories !== undefined) update.imageCategories = stringifyIfNeeded(jsonRecord.imageCategories);
  if (jsonRecord.hotelAds !== undefined) update.hotelAds = stringifyIfNeeded(jsonRecord.hotelAds);
  if (jsonRecord.openingHours !== undefined) update.hours = stringifyIfNeeded(jsonRecord.openingHours);
  if (jsonRecord.additionalOpeningHours !== undefined) update.additionalOpeningHours = stringifyIfNeeded(jsonRecord.additionalOpeningHours);
  if (jsonRecord.peopleAlsoSearch !== undefined) update.peopleAlsoSearch = stringifyIfNeeded(jsonRecord.peopleAlsoSearch);
  if (jsonRecord.placesTags !== undefined) update.placesTags = stringifyIfNeeded(jsonRecord.placesTags);
  if (jsonRecord.reviewsTags !== undefined) update.reviewsTags = stringifyIfNeeded(jsonRecord.reviewsTags);
  if (jsonRecord.additionalInfo !== undefined) update.additionalInfo = stringifyIfNeeded(jsonRecord.additionalInfo);
  if (jsonRecord.gasPrices !== undefined) update.gasPrices = stringifyIfNeeded(jsonRecord.gasPrices);
  if (jsonRecord.menu !== undefined) update.menu = stringifyIfNeeded(jsonRecord.menu);
  if (jsonRecord.reviewsDistribution !== undefined) update.reviewsDistribution = stringifyIfNeeded(jsonRecord.reviewsDistribution);
  if (jsonRecord.similarHotelsNearby !== undefined) update.similarHotelsNearby = stringifyIfNeeded(jsonRecord.similarHotelsNearby);
  if (jsonRecord.hotelReviewSummary !== undefined) update.hotelReviewSummary = stringifyIfNeeded(jsonRecord.hotelReviewSummary);
  if (jsonRecord.popularTimesHistogram !== undefined) update.popularTimesHistogram = stringifyIfNeeded(jsonRecord.popularTimesHistogram);
  if (jsonRecord.questionsAndAnswers !== undefined) update.questionsAndAnswers = stringifyIfNeeded(jsonRecord.questionsAndAnswers);
  if (jsonRecord.updatesFromCustomers !== undefined) update.updatesFromCustomers = stringifyIfNeeded(jsonRecord.updatesFromCustomers);
  if (jsonRecord.webResults !== undefined) update.webResults = stringifyIfNeeded(jsonRecord.webResults);
  if (jsonRecord.tableReservationLinks !== undefined) update.tableReservationLinks = stringifyIfNeeded(jsonRecord.tableReservationLinks);
  if (jsonRecord.bookingLinks !== undefined) update.bookingLinks = stringifyIfNeeded(jsonRecord.bookingLinks);
  if (jsonRecord.orderBy !== undefined) update.orderBy = stringifyIfNeeded(jsonRecord.orderBy);
  if (jsonRecord.restaurantData !== undefined) update.restaurantData = stringifyIfNeeded(jsonRecord.restaurantData);
  if (jsonRecord.ownerUpdates !== undefined) update.ownerUpdates = stringifyIfNeeded(jsonRecord.ownerUpdates);
  if (jsonRecord.reviews !== undefined) update.reviews = stringifyIfNeeded(jsonRecord.reviews);
  if (jsonRecord.leadsEnrichment !== undefined) update.leadsEnrichment = stringifyIfNeeded(jsonRecord.leadsEnrichment);
  if (jsonRecord.viewport !== undefined) {
    // Store viewport as JSON string if needed, or skip if not in schema
    // update.viewport = stringifyIfNeeded(jsonRecord.viewport);
  }
  if (jsonRecord.currentOpeningHours !== undefined) {
    // Store currentOpeningHours as JSON string if needed
    // update.currentOpeningHours = stringifyIfNeeded(jsonRecord.currentOpeningHours);
  }
  
  return update;
}

async function updateAllFields() {
  console.log('Reading allcities.cleaned.json...');
  const jsonPath = path.join(__dirname, '../Example JSON/allcities.cleaned.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('Error: allcities.cleaned.json not found');
    process.exit(1);
  }
  
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} total records in JSON`);
  
  // Create a map of placeId -> JSON record
  const jsonMap = new Map();
  jsonData.forEach(record => {
    if (record.placeId) {
      jsonMap.set(record.placeId, record);
    }
  });
  
  console.log(`Created map with ${jsonMap.size} placeIds`);
  
  // Fetch all existing buffets from database
  console.log('\nFetching existing buffets from database...');
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  
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
  
  console.log(`Total buffets in database: ${allBuffets.length}`);
  
  // Find buffets that have matching JSON records
  const buffetsToUpdate = [];
  allBuffets.forEach(buffet => {
    if (buffet.placeId && jsonMap.has(buffet.placeId)) {
      const jsonRecord = jsonMap.get(buffet.placeId);
      const update = mapJsonToDb(jsonRecord);
      if (Object.keys(update).length > 0) {
        buffetsToUpdate.push({ buffet, update });
      }
    }
  });
  
  console.log(`\nFound ${buffetsToUpdate.length} buffets to update`);
  
  if (buffetsToUpdate.length === 0) {
    console.log('No updates needed!');
    return;
  }
  
  // Create update transactions
  console.log('\nCreating update transactions...');
  const updateTxs = buffetsToUpdate.map(({ buffet, update }) => {
    return db.tx.buffets[buffet.id].update(update);
  });
  
  // Execute updates in batches
  const batchSize = 100;
  let updated = 0;
  
  for (let i = 0; i < updateTxs.length; i += batchSize) {
    const batch = updateTxs.slice(i, i + batchSize);
    await db.transact(batch);
    updated += batch.length;
    console.log(`  ✓ Updated ${updated}/${buffetsToUpdate.length} buffets...`);
  }
  
  console.log(`\n✅ Successfully updated ${updated} buffets with all fields from JSON!`);
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

updateAllFields().catch(error => {
  console.error('Error updating fields:', error);
  process.exit(1);
});

















