const fs = require('fs');
const path = require('path');

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
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// Helper function to normalize city name
function normalizeCityName(cityName) {
  // Remove common suffixes and normalize
  return cityName
    .replace(/ city \(balance\)/gi, '')
    .replace(/ city/gi, '')
    .replace(/\/.*$/g, '') // Remove everything after /
    .replace(/-.*$/g, '') // Remove everything after -
    .trim();
}

// Helper function to normalize state name
function normalizeStateName(stateName) {
  // Handle special cases
  if (stateName === 'District of Columbia') return 'DC';
  return stateAbbreviations[stateName] || stateName;
}

// Check if restaurant is a Chinese buffet
function isChineseBuffet(restaurant) {
  if (!restaurant.categories || !Array.isArray(restaurant.categories)) {
    return false;
  }
  
  const categories = restaurant.categories.map(c => c.toLowerCase());
  const categoryName = (restaurant.categoryName || '').toLowerCase();
  const title = (restaurant.title || '').toLowerCase();
  
  // Must have Chinese restaurant category
  const hasChinese = categories.some(c => 
    c.includes('chinese') || c.includes('asian')
  ) || categoryName.includes('chinese') || categoryName.includes('asian');
  
  // Should have buffet indicator (in categories, categoryName, or title)
  const hasBuffet = categories.some(c => 
    c.includes('buffet') || c.includes('all you can eat')
  ) || categoryName.includes('buffet') || title.includes('buffet');
  
  // Exclude permanently closed restaurants (set to true for testing with limited data)
  const EXCLUDE_CLOSED = false; // Set to true in production
  if (EXCLUDE_CLOSED && restaurant.permanentlyClosed) {
    return false;
  }
  
  // Match if: (Chinese/Asian AND has buffet) OR (title contains both "chinese" and "buffet")
  return hasChinese && hasBuffet;
}

// Match buffet to city
function matchBuffetToCity(buffet, citiesMap) {
  const buffetCity = normalizeCityName(buffet.city || '');
  const buffetState = normalizeStateName(buffet.state || '');
  
  // Try exact match first
  const cityKey = `${buffetCity.toLowerCase()}-${buffetState.toLowerCase()}`;
  if (citiesMap[cityKey]) {
    return citiesMap[cityKey];
  }
  
  // Try with state abbreviation
  const stateAbbr = stateAbbreviations[buffet.state] || buffetState;
  const cityKey2 = `${buffetCity.toLowerCase()}-${stateAbbr.toLowerCase()}`;
  if (citiesMap[cityKey2]) {
    return citiesMap[cityKey2];
  }
  
  // Try fuzzy match
  for (const [key, city] of Object.entries(citiesMap)) {
    const [cityName, stateAbbr] = key.split('-');
    if (cityName === buffetCity.toLowerCase() && 
        (stateAbbr === buffetState.toLowerCase() || 
         stateAbbr === stateAbbreviations[buffet.state]?.toLowerCase())) {
      return city;
    }
  }
  
  return null;
}

// Main processing function
function processData() {
  console.log('Starting data processing...');
  
  // Get JSON filename from command line argument or use default
  const jsonFilename = process.argv[2] || 'google_places_merged_all.json';
  const jsonPath = path.join(__dirname, '../Example JSON', jsonFilename);
  const csvPath = path.join(__dirname, '../Research/us_cities_over_100k_2024_census_estimates.csv');
  
  // Check if JSON file exists
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: JSON file not found: ${jsonPath}`);
    console.error(`Available files in Example JSON folder:`);
    try {
      const files = fs.readdirSync(path.join(__dirname, '../Example JSON'));
      files.filter(f => f.endsWith('.json')).forEach(f => console.error(`  - ${f}`));
    } catch (e) {
      console.error('  Could not read directory');
    }
    process.exit(1);
  }
  
  console.log(`Using JSON file: ${jsonFilename}`);
  
  console.log('Reading JSON file...');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Found ${jsonData.length} restaurants in JSON`);
  
  console.log('Reading CSV file...');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const csvLines = csvContent.split('\n').slice(1); // Skip header
  
  // Build cities map
  const citiesMap = {};
  const citiesList = [];
  
  csvLines.forEach(line => {
    if (!line.trim()) return;
    const [rank, place, state, population] = line.split(',');
    if (!place || !state) return;
    
    const cityName = normalizeCityName(place);
    const stateAbbr = normalizeStateName(state);
    const citySlug = `${generateSlug(cityName)}-${stateAbbr.toLowerCase()}`;
    
    const cityData = {
      rank: parseInt(rank) || 0,
      city: cityName,
      state: state,
      stateAbbr: stateAbbr,
      population: parseInt(population) || 0,
      slug: citySlug
    };
    
    citiesMap[citySlug] = cityData;
    citiesList.push(cityData);
  });
  
  console.log(`Loaded ${citiesList.length} cities from CSV`);
  
  // Filter Chinese buffets
  console.log('Filtering Chinese buffets...');
  const chineseBuffets = jsonData.filter(isChineseBuffet);
  console.log(`Found ${chineseBuffets.length} Chinese buffets`);
  
  // Process buffets and match to cities
  const buffetsByCity = {};
  const buffetsById = {};
  let matchedCount = 0;
  let unmatchedCount = 0;
  
  chineseBuffets.forEach((buffet, index) => {
    // Generate unique ID
    const buffetId = buffet.placeId || `buffet-${index}`;
    
    // Generate slug from name
    const buffetSlug = generateSlug(buffet.title || `buffet-${index}`);
    
    // Match to city
    const city = matchBuffetToCity(buffet, citiesMap);
    
    if (!city) {
      unmatchedCount++;
      return; // Skip unmatched buffets for now
    }
    
    matchedCount++;
    
    // Create buffet object
    const buffetData = {
      id: buffetId,
      name: buffet.title || 'Unknown',
      slug: buffetSlug,
      address: {
        street: buffet.street || '',
        city: buffet.city || '',
        state: buffet.state || '',
        stateAbbr: normalizeStateName(buffet.state || ''),
        postalCode: buffet.postalCode || '',
        full: buffet.address || ''
      },
      location: buffet.location || { lat: 0, lng: 0 },
      phone: buffet.phone || '',
      phoneUnformatted: buffet.phoneUnformatted || '',
      website: buffet.website || null,
      email: buffet.email || buffet.contactEmail || null,
      price: buffet.price || null,
      rating: buffet.totalScore || 0,
      reviewsCount: buffet.reviewsCount || 0,
      hours: buffet.openingHours || [],
      categories: buffet.categories || [],
      categoryName: buffet.categoryName || '',
      neighborhood: buffet.neighborhood || null,
      permanentlyClosed: buffet.permanentlyClosed || false,
      temporarilyClosed: buffet.temporarilyClosed || false,
      placeId: buffet.placeId || null,
      imagesCount: buffet.imagesCount || 0,
      imageUrls: buffet.imageUrls || [],
      reviews: buffet.reviews || [],
      description: buffet.description || null,
      subTitle: buffet.subTitle || null,
      reviewsDistribution: buffet.reviewsDistribution || null,
      reviewsTags: buffet.reviewsTags || null,
      popularTimesHistogram: buffet.popularTimesHistogram || null,
      popularTimesLiveText: buffet.popularTimesLiveText || null,
      popularTimesLivePercent: buffet.popularTimesLivePercent || null,
      additionalInfo: buffet.additionalInfo || null,
      questionsAndAnswers: buffet.questionsAndAnswers || null,
      ownerUpdates: buffet.ownerUpdates || null,
      reserveTableUrl: buffet.reserveTableUrl || null,
      tableReservationLinks: buffet.tableReservationLinks || null,
      googleFoodUrl: buffet.googleFoodUrl || null,
      orderBy: buffet.orderBy || null,
      menu: buffet.menu || null,
      webResults: buffet.webResults || null,
      peopleAlsoSearch: buffet.peopleAlsoSearch || null,
      updatesFromCustomers: buffet.updatesFromCustomers || null,
      locatedIn: buffet.locatedIn || null,
      plusCode: buffet.plusCode || null
    };
    
    // Add to city
    if (!buffetsByCity[city.slug]) {
      buffetsByCity[city.slug] = {
        ...city,
        buffets: []
      };
    }
    
    buffetsByCity[city.slug].buffets.push(buffetData);
    buffetsById[buffetId] = {
      ...buffetData,
      citySlug: city.slug
    };
  });
  
  console.log(`Matched ${matchedCount} buffets to cities`);
  console.log(`Unmatched ${unmatchedCount} buffets`);
  
  // Filter cities with buffets (only include cities that have at least 1 buffet)
  const citiesWithBuffets = {};
  Object.keys(buffetsByCity).forEach(citySlug => {
    if (buffetsByCity[citySlug].buffets.length > 0) {
      citiesWithBuffets[citySlug] = buffetsByCity[citySlug];
    }
  });
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Write output files
  console.log('Writing output files...');
  fs.writeFileSync(
    path.join(dataDir, 'buffets-by-city.json'),
    JSON.stringify(citiesWithBuffets, null, 2)
  );
  
  fs.writeFileSync(
    path.join(dataDir, 'buffets-by-id.json'),
    JSON.stringify(buffetsById, null, 2)
  );
  
  // Create summary
  const summary = {
    totalCities: Object.keys(citiesWithBuffets).length,
    totalBuffets: matchedCount,
    unmatchedBuffets: unmatchedCount,
    cities: Object.keys(citiesWithBuffets).map(slug => ({
      slug,
      city: citiesWithBuffets[slug].city,
      state: citiesWithBuffets[slug].state,
      buffetCount: citiesWithBuffets[slug].buffets.length
    })).sort((a, b) => b.buffetCount - a.buffetCount)
  };
  
  fs.writeFileSync(
    path.join(dataDir, 'summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\nProcessing complete!');
  console.log(`Cities with buffets: ${summary.totalCities}`);
  console.log(`Total buffets: ${summary.totalBuffets}`);
  console.log(`Top 10 cities by buffet count:`);
  summary.cities.slice(0, 10).forEach((city, i) => {
    console.log(`  ${i + 1}. ${city.city}, ${city.state}: ${city.buffetCount} buffets`);
  });
}

// Run the script
try {
  processData();
} catch (error) {
  console.error('Error processing data:', error);
  process.exit(1);
}

