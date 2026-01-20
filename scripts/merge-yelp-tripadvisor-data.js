/**
 * Merge Yelp and TripAdvisor scraped data into existing buffet database structure
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const YELP_DIR = path.join(DATA_DIR, 'yelp-data');
const TRIPADVISOR_DIR = path.join(DATA_DIR, 'tripadvisor-data');
const MAPPING_FILE = path.join(DATA_DIR, 'restaurant-mapping.json');
const BUFFETS_FILE = path.join(DATA_DIR, 'buffets-by-id.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'buffets-by-id-enriched.json');

function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading ${filePath}:`, error.message);
    return null;
  }
}

function loadAllYelpData() {
  const yelpData = {};
  
  if (!fs.existsSync(YELP_DIR)) {
    console.log(`Yelp data directory not found: ${YELP_DIR}`);
    return yelpData;
  }
  
  const files = fs.readdirSync(YELP_DIR).filter(f => f.endsWith('.json'));
  console.log(`Loading ${files.length} Yelp data files...`);
  
  for (const file of files) {
    const buffetId = path.basename(file, '.json');
    const filePath = path.join(YELP_DIR, file);
    const data = loadJSON(filePath);
    
    if (data && !data.error) {
      yelpData[buffetId] = data;
    }
  }
  
  return yelpData;
}

function loadAllTripAdvisorData() {
  const taData = {};
  
  if (!fs.existsSync(TRIPADVISOR_DIR)) {
    console.log(`TripAdvisor data directory not found: ${TRIPADVISOR_DIR}`);
    return taData;
  }
  
  const files = fs.readdirSync(TRIPADVISOR_DIR).filter(f => f.endsWith('.json'));
  console.log(`Loading ${files.length} TripAdvisor data files...`);
  
  for (const file of files) {
    const buffetId = path.basename(file, '.json');
    const filePath = path.join(TRIPADVISOR_DIR, file);
    const data = loadJSON(filePath);
    
    if (data && !data.error) {
      taData[buffetId] = data;
    }
  }
  
  return taData;
}

function transformYelpData(yelpRaw) {
  if (!yelpRaw) return null;
  
  return {
    yelpId: yelpRaw.yelpId,
    yelpName: yelpRaw.yelpName || yelpRaw.name,
    url: yelpRaw.url,
    rating: yelpRaw.rating,
    reviewCount: yelpRaw.reviewCount,
    priceRange: yelpRaw.priceRange,
    address: yelpRaw.address,
    phone: yelpRaw.phone,
    website: yelpRaw.website,
    categories: yelpRaw.categories || [],
    hours: yelpRaw.hours || {},
    photos: yelpRaw.photos || [],
    attributes: yelpRaw.attributes || {},
    reviews: (yelpRaw.reviews || []).map(review => ({
      text: review.text,
      rating: review.rating,
      author: review.author,
      date: review.date,
    })),
    scrapedAt: yelpRaw.scrapedAt,
  };
}

function transformTripAdvisorData(taRaw) {
  if (!taRaw) return null;
  
  return {
    tripadvisorId: taRaw.tripadvisorId,
    tripadvisorName: taRaw.tripadvisorName || taRaw.name,
    url: taRaw.url,
    rating: taRaw.rating,
    reviewCount: taRaw.reviewCount,
    priceRange: taRaw.priceRange,
    address: taRaw.address,
    phone: taRaw.phone,
    website: taRaw.website,
    cuisines: taRaw.cuisines || [],
    hours: taRaw.hours || {},
    photos: taRaw.photos || [],
    features: taRaw.features || [],
    popularDishes: taRaw.popularDishes || [],
    reviews: (taRaw.reviews || []).map(review => ({
      text: review.text || review.title,
      rating: review.rating,
      author: review.author,
      date: review.date,
      title: review.title,
    })),
    ranking: taRaw.ranking,
    scrapedAt: taRaw.scrapedAt,
  };
}

function mergeData() {
  console.log('Starting data merge process...\n');
  
  // Load existing buffets
  const buffets = loadJSON(BUFFETS_FILE);
  if (!buffets) {
    console.error('Failed to load buffets file');
    process.exit(1);
  }
  
  console.log(`Loaded ${Object.keys(buffets).length} buffets from database\n`);
  
  // Load Yelp and TripAdvisor data
  const yelpData = loadAllYelpData();
  const taData = loadAllTripAdvisorData();
  
  console.log(`\nLoaded ${Object.keys(yelpData).length} Yelp records`);
  console.log(`Loaded ${Object.keys(taData).length} TripAdvisor records\n`);
  
  // Create enriched buffets
  const enrichedBuffets = {};
  let enrichedCount = 0;
  let yelpMergedCount = 0;
  let taMergedCount = 0;
  
  for (const [buffetId, buffet] of Object.entries(buffets)) {
    const enriched = { ...buffet };
    
    // Add Yelp data if available
    if (yelpData[buffetId]) {
      const yelpTransformed = transformYelpData(yelpData[buffetId]);
      enriched.yelpData = yelpTransformed;
      
      // Add top-level fields for easy access
      if (yelpTransformed.rating) {
        enriched.yelpRating = yelpTransformed.rating;
      }
      if (yelpTransformed.reviewCount) {
        enriched.yelpReviewsCount = yelpTransformed.reviewCount;
      }
      
      yelpMergedCount++;
    }
    
    // Add TripAdvisor data if available
    if (taData[buffetId]) {
      const taTransformed = transformTripAdvisorData(taData[buffetId]);
      enriched.tripadvisorData = taTransformed;
      
      // Add top-level fields for easy access
      if (taTransformed.rating) {
        enriched.tripadvisorRating = taTransformed.rating;
      }
      if (taTransformed.reviewCount) {
        enriched.tripadvisorReviewsCount = taTransformed.reviewCount;
      }
      
      taMergedCount++;
    }
    
    enrichedBuffets[buffetId] = enriched;
    
    if (enriched.yelpData || enriched.tripadvisorData) {
      enrichedCount++;
    }
  }
  
  // Save enriched data
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedBuffets, null, 2), 'utf8');
  
  console.log('\n' + '='.repeat(60));
  console.log('Merge complete!');
  console.log('='.repeat(60));
  console.log(`Total buffets: ${Object.keys(buffets).length}`);
  console.log(`Enriched buffets: ${enrichedCount}`);
  console.log(`  - With Yelp data: ${yelpMergedCount}`);
  console.log(`  - With TripAdvisor data: ${taMergedCount}`);
  console.log(`Output saved to: ${OUTPUT_FILE}`);
  console.log('='.repeat(60));
  
  // Optionally, update the original file (commented out for safety)
  // Uncomment the next line if you want to overwrite the original file
  // fs.writeFileSync(BUFFETS_FILE, JSON.stringify(enrichedBuffets, null, 2), 'utf8');
}

if (require.main === module) {
  mergeData();
}

module.exports = { mergeData, transformYelpData, transformTripAdvisorData };
















