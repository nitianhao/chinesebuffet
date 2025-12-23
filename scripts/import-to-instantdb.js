// Script to import data to Instant DB using Admin API
// Run with: node scripts/import-to-instantdb.js

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

async function importData() {
  console.log('Reading migration data...');
  const migrationPath = path.join(__dirname, '../data/migration-ready.json');
  
  if (!fs.existsSync(migrationPath)) {
    console.error('Migration data not found. Run migrate-to-instantdb.js first.');
    process.exit(1);
  }
  
  const { cities, buffets } = JSON.parse(fs.readFileSync(migrationPath, 'utf8'));
  
  console.log(`Importing ${cities.length} cities and ${buffets.length} buffets...`);
  
  try {
    // Check existing cities
    console.log('Checking existing cities...');
    const existingCities = await db.query({ cities: { $: { where: { slug: { $in: cities.map(c => c.slug) } } } } });
    const existingSlugs = new Set(existingCities.cities.map(c => c.slug));
    console.log(`  Found ${existingCities.cities.length} existing cities`);
    
    // Import cities first (only new ones)
    console.log('Importing cities...');
    const cityMap = new Map(); // slug -> id
    
    // Map existing cities
    existingCities.cities.forEach(city => {
      cityMap.set(city.slug, city.id);
    });
    
    // Create transactions for new cities only
    const newCities = cities.filter(city => !existingSlugs.has(city.slug));
    const cityTxs = newCities.map(city => {
      const cityId = id();
      cityMap.set(city.slug, cityId);
      return db.tx.cities[cityId].create({
        rank: city.rank,
        city: city.city,
        state: city.state,
        stateAbbr: city.stateAbbr,
        population: city.population,
        slug: city.slug,
      });
    });
    
    if (cityTxs.length > 0) {
      await db.transact(cityTxs);
      console.log(`  ✓ Imported ${cityTxs.length} new cities`);
    } else {
      console.log(`  ✓ All cities already exist`);
    }
    
    // Check existing buffets
    console.log('\nChecking existing buffets...');
    const existingBuffets = await db.query({ buffets: { $: { where: { slug: { $in: buffets.map(b => b.slug) } } } } });
    const existingBuffetSlugs = new Set(existingBuffets.buffets.map(b => b.slug));
    console.log(`  Found ${existingBuffets.buffets.length} existing buffets`);
    
    // Import buffets with city links (only new ones)
    console.log('Importing buffets...');
    
    const buffetTxs = buffets
      .filter(buffet => !existingBuffetSlugs.has(buffet.slug))
      .map(buffet => {
        const cityId = cityMap.get(buffet.citySlug);
        if (!cityId) {
          console.warn(`  ⚠ Skipping ${buffet.name} - city not found`);
          return null;
        }
        
        const buffetId = id();
        return db.tx.buffets[buffetId]
          .create({
            name: buffet.name,
            slug: buffet.slug,
            street: buffet.street,
            cityName: buffet.cityName || '',
            state: buffet.state,
            stateAbbr: buffet.stateAbbr,
            postalCode: buffet.postalCode,
            address: buffet.address,
            phone: buffet.phone,
            phoneUnformatted: buffet.phoneUnformatted,
            website: buffet.website,
            price: buffet.price,
            rating: buffet.rating,
            reviewsCount: buffet.reviewsCount,
            primaryType: buffet.primaryType,
            reviews: buffet.reviews,
            lat: buffet.lat,
            lng: buffet.lng,
            neighborhood: buffet.neighborhood,
            permanentlyClosed: buffet.permanentlyClosed,
            temporarilyClosed: buffet.temporarilyClosed,
            placeId: buffet.placeId,
            imagesCount: buffet.imagesCount,
            categoryName: buffet.categoryName,
            hours: buffet.hours,
            categories: buffet.categories,
          })
          .link({ city: cityId });
      })
      .filter(tx => tx !== null);
    
    if (buffetTxs.length > 0) {
      await db.transact(buffetTxs);
      console.log(`  ✓ Imported ${buffetTxs.length} new buffets`);
    } else {
      console.log(`  ✓ All buffets already exist`);
    }
    
    const totalCities = cityMap.size;
    const totalBuffets = existingBuffets.buffets.length + buffetTxs.length;
    console.log(`\n✅ Database now has ${totalCities} cities and ${totalBuffets} buffets!`);
  } catch (error) {
    console.error('Error importing data:', error);
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

importData();

