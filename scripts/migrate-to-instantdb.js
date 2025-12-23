const fs = require('fs');
const path = require('path');

// This script will help you migrate data to Instant DB
// You'll need to use the Instant DB admin API to insert data

async function migrateData() {
  console.log('Reading processed data...');
  
  const buffetsByCityPath = path.join(__dirname, '../data/buffets-by-city.json');
  const buffetsByCity = JSON.parse(fs.readFileSync(buffetsByCityPath, 'utf8'));
  
  console.log(`Found ${Object.keys(buffetsByCity).length} cities with buffets`);
  
  // Prepare data for Instant DB
  const cities = [];
  const buffets = [];
  
  Object.values(buffetsByCity).forEach(city => {
    // Add city
    cities.push({
      rank: city.rank,
      city: city.city,
      state: city.state,
      stateAbbr: city.stateAbbr,
      population: city.population,
      slug: city.slug,
    });
    
    // Add buffets with city reference
    city.buffets.forEach(buffet => {
      buffets.push({
        name: buffet.name,
        slug: buffet.slug,
        street: buffet.address.street || '',
        cityName: buffet.address.city || '',
        state: buffet.address.state,
        stateAbbr: buffet.address.stateAbbr,
        postalCode: buffet.address.postalCode || '',
        address: buffet.address.full || '',
        phone: buffet.phone || null,
        phoneUnformatted: buffet.phoneUnformatted || null,
        website: buffet.website || null,
        price: buffet.price || null,
        rating: buffet.rating || null,
        reviewsCount: buffet.reviewsCount || null,
        primaryType: buffet.primaryType || null,
        reviews: JSON.stringify(buffet.reviews || []),
        lat: buffet.location.lat,
        lng: buffet.location.lng,
        neighborhood: buffet.neighborhood || null,
        permanentlyClosed: buffet.permanentlyClosed || false,
        temporarilyClosed: buffet.temporarilyClosed || false,
        placeId: buffet.placeId || null,
        imagesCount: buffet.imagesCount || null,
        categoryName: buffet.categoryName || '',
        hours: JSON.stringify(buffet.hours || []),
        categories: JSON.stringify(buffet.categories || []),
        citySlug: city.slug, // For linking
      });
    });
  });
  
  console.log(`\nPrepared ${cities.length} cities and ${buffets.length} buffets for migration`);
  console.log('\nTo migrate this data to Instant DB, you have two options:');
  console.log('\n1. Use the Instant DB Admin API (recommended for bulk import)');
  console.log('2. Use the Instant DB dashboard to import manually');
  console.log('\nFor the Admin API, you can use:');
  console.log('  const admin = require("@instantdb/admin");');
  console.log('  const db = admin.init({ appId: "709e0e09-3347-419b-8daa-bad6889e480d" });');
  console.log('  await db.transact(tx => { ... });');
  
  // Save prepared data for reference
  const outputPath = path.join(__dirname, '../data/migration-ready.json');
  fs.writeFileSync(outputPath, JSON.stringify({ cities, buffets }, null, 2));
  console.log(`\nPrepared data saved to: ${outputPath}`);
}

migrateData().catch(console.error);

