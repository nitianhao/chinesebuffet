// Script to export data from InstantDB to JSON files for the website
// Run with: node scripts/export-from-instantdb.js

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

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

// Helper function to parse JSON strings
function parseJsonField(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  }
  return value;
}

async function exportData() {
  console.log('Fetching data from InstantDB...');
  
  try {
    // Fetch all cities
    const citiesResult = await db.query({ cities: {} });
    const cities = citiesResult.cities || [];
    console.log(`Found ${cities.length} cities`);
    
    // Fetch all buffets with their city links
    const buffetsResult = await db.query({ 
      buffets: {
        city: {}
      }
    });
    const buffets = buffetsResult.buffets || [];
    console.log(`Found ${buffets.length} buffets`);
    
    // Transform cities
    const citiesData = cities.map(city => ({
      rank: city.rank || 0,
      city: city.city || '',
      state: city.state || '',
      stateAbbr: city.stateAbbr || '',
      population: city.population || 0,
      slug: city.slug || '',
    }));
    
    // Transform buffets
    const buffetsData = buffets.map(buffet => {
      // Parse address from full address string
      const addressParts = (buffet.address || '').split(',').map(s => s.trim());
      const street = buffet.street || addressParts[0] || '';
      const cityName = buffet.cityName || addressParts[1] || '';
      const state = buffet.state || addressParts[2] || '';
      const postalCode = buffet.postalCode || addressParts[3] || '';
      
      return {
        id: buffet.id,
        name: buffet.name || '',
        slug: buffet.slug || '',
        address: {
          street: street,
          city: cityName,
          state: state,
          stateAbbr: buffet.stateAbbr || '',
          postalCode: postalCode,
          full: buffet.address || '',
        },
        location: {
          lat: buffet.lat || 0,
          lng: buffet.lng || 0,
        },
        phone: buffet.phone || '',
        phoneUnformatted: buffet.phoneUnformatted || '',
        website: buffet.website || null,
        email: null, // Not in schema
        price: buffet.price || null,
        rating: buffet.rating || 0,
        reviewsCount: buffet.reviewsCount || 0,
        hours: parseJsonField(buffet.hours) || [],
        categories: parseJsonField(buffet.categories) || [],
        categoryName: buffet.categoryName || '',
        neighborhood: buffet.neighborhood || null,
        permanentlyClosed: buffet.permanentlyClosed || false,
        temporarilyClosed: buffet.temporarilyClosed || false,
        placeId: buffet.placeId || null,
        imagesCount: buffet.imagesCount || 0,
        imageUrls: parseJsonField(buffet.imageUrls) || [],
        citySlug: buffet.city?.slug || '',
        description: buffet.description || null,
        subTitle: buffet.subTitle || null,
        reviewsDistribution: parseJsonField(buffet.reviewsDistribution) || null,
        reviewsTags: parseJsonField(buffet.reviewsTags) || null,
        popularTimesHistogram: parseJsonField(buffet.popularTimesHistogram) || null,
        popularTimesLiveText: buffet.popularTimesLiveText || null,
        popularTimesLivePercent: buffet.popularTimesLivePercent || null,
        additionalInfo: parseJsonField(buffet.additionalInfo) || null,
        questionsAndAnswers: parseJsonField(buffet.questionsAndAnswers) || null,
        ownerUpdates: parseJsonField(buffet.ownerUpdates) || null,
        reserveTableUrl: buffet.reserveTableUrl || null,
        tableReservationLinks: parseJsonField(buffet.tableReservationLinks) || null,
        googleFoodUrl: buffet.googleFoodUrl || null,
        orderBy: parseJsonField(buffet.orderBy) || null,
        menu: parseJsonField(buffet.menu) || null,
        webResults: parseJsonField(buffet.webResults) || null,
        peopleAlsoSearch: parseJsonField(buffet.peopleAlsoSearch) || null,
        updatesFromCustomers: parseJsonField(buffet.updatesFromCustomers) || null,
        locatedIn: buffet.locatedIn || null,
        plusCode: buffet.plusCode || null,
        what_customers_are_saying_seo: buffet.what_customers_are_saying_seo || null,
      };
    });
    
    // Organize by city
    const buffetsByCity = {};
    const buffetsById = {};
    
    // Initialize cities
    citiesData.forEach(city => {
      buffetsByCity[city.slug] = {
        ...city,
        buffets: [],
      };
    });
    
    // Add buffets to cities and create by-id map
    buffetsData.forEach(buffet => {
      buffetsById[buffet.id] = buffet;
      
      if (buffet.citySlug && buffetsByCity[buffet.citySlug]) {
        buffetsByCity[buffet.citySlug].buffets.push(buffet);
      }
    });
    
    // Sort buffets within each city by rating
    Object.values(buffetsByCity).forEach(city => {
      city.buffets.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    });
    
    // Create summary
    const summary = {
      totalCities: citiesData.length,
      totalBuffets: buffetsData.length,
      citiesWithBuffets: Object.values(buffetsByCity).filter(c => c.buffets.length > 0).length,
      exportedAt: new Date().toISOString(),
    };
    
    // Ensure data directory exists
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Write files
    console.log('\nWriting JSON files...');
    fs.writeFileSync(
      path.join(dataDir, 'buffets-by-city.json'),
      JSON.stringify(buffetsByCity, null, 2)
    );
    console.log(`  ✓ buffets-by-city.json (${Object.keys(buffetsByCity).length} cities)`);
    
    fs.writeFileSync(
      path.join(dataDir, 'buffets-by-id.json'),
      JSON.stringify(buffetsById, null, 2)
    );
    console.log(`  ✓ buffets-by-id.json (${Object.keys(buffetsById).length} buffets)`);
    
    fs.writeFileSync(
      path.join(dataDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    console.log(`  ✓ summary.json`);
    
    console.log('\n✅ Export complete!');
    console.log(`\nSummary:`);
    console.log(`  Cities: ${summary.totalCities}`);
    console.log(`  Buffets: ${summary.totalBuffets}`);
    console.log(`  Cities with buffets: ${summary.citiesWithBuffets}`);
    console.log(`  Buffets with customer insights: ${buffetsData.filter(b => b.what_customers_are_saying_seo).length}`);
    
  } catch (error) {
    console.error('Error exporting data:', error);
    process.exit(1);
  }
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  console.error('Get your admin token from: https://instantdb.com/dash');
  process.exit(1);
}

exportData().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});





















