#!/usr/bin/env node
// Main script to run city enrichment scripts (Phase 1 & Phase 2)
// Usage: node scripts/enrich-cities/index.js [script] [--limit N]

const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
try {
  const envPath = path.join(__dirname, '../../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const match = trimmedLine.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key] && value) {
            process.env[key] = value;
          }
        }
      }
    });
  }
} catch (error) {
  console.warn(`Warning: Could not load .env.local: ${error.message}`);
}

const { enrichMSA } = require('./msa-enrichment');
const { enrichZipCodes } = require('./zip-code-enrichment');
const { enrichRestaurantDensity } = require('./restaurant-density');
const { enrichWikipedia } = require('./wikipedia-enrichment');
const { enrichPOIs } = require('./poi-enrichment');

const scriptMap = {
  // Phase 1 enrichments
  'msa': {
    name: 'MSA/Regional Data',
    func: (limit) => enrichMSA(limit),
    description: 'Enriches cities with Metropolitan Statistical Area (MSA) and Combined Statistical Area (CSA) data'
  },
  'zip': {
    name: 'ZIP Code Coverage',
    func: (limit) => enrichZipCodes(limit),
    description: 'Enriches cities with ZIP code coverage from GeoNames API'
  },
  'restaurant': {
    name: 'Restaurant Density',
    func: (limit) => enrichRestaurantDensity(limit),
    description: 'Enriches cities with restaurant counts and density metrics from OpenStreetMap'
  },
  'phase1': {
    name: 'Phase 1 (All)',
    func: async (limit) => {
      console.log(`Running all Phase 1 enrichments${limit ? ` (limited to ${limit} cities)` : ''}...\n`);
      console.log('='.repeat(60));
      
      // Run in sequence to avoid overwhelming APIs and DB
      console.log('\n1️⃣  Running MSA enrichment...\n');
      await enrichMSA(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n2️⃣  Running ZIP code enrichment...\n');
      await enrichZipCodes(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n3️⃣  Running restaurant density enrichment...\n');
      console.log('⚠️  Note: This may take a long time due to Overpass API rate limits\n');
      await enrichRestaurantDensity(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n✅ All Phase 1 enrichments complete!\n');
    },
    description: 'Runs all Phase 1 enrichment scripts in sequence (MSA, ZIP, Restaurant Density)'
  },
  // Phase 2 enrichments
  'wikipedia': {
    name: 'Wikipedia Summaries',
    func: (limit) => enrichWikipedia(limit),
    description: 'Enriches cities with Wikipedia summaries and notable facts for rich SEO content'
  },
  'poi': {
    name: 'Points of Interest',
    func: (limit) => enrichPOIs(limit),
    description: 'Enriches cities with nearby attractions, shopping centers, universities, and hotels from OpenStreetMap'
  },
  'phase2': {
    name: 'Phase 2 (All)',
    func: async (limit) => {
      console.log(`Running all Phase 2 enrichments${limit ? ` (limited to ${limit} cities)` : ''}...\n`);
      console.log('='.repeat(60));
      
      // Run in sequence to avoid overwhelming APIs and DB
      console.log('\n1️⃣  Running Wikipedia enrichment...\n');
      await enrichWikipedia(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n2️⃣  Running Points of Interest enrichment...\n');
      console.log('⚠️  Note: This may take a long time due to Overpass API rate limits\n');
      await enrichPOIs(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n✅ All Phase 2 enrichments complete!\n');
    },
    description: 'Runs all Phase 2 enrichment scripts in sequence (Wikipedia, POIs)'
  },
  // Run everything
  'all': {
    name: 'All Enrichments (Phase 1 + Phase 2)',
    func: async (limit) => {
      console.log(`Running all enrichments (Phase 1 + Phase 2)${limit ? ` (limited to ${limit} cities)` : ''}...\n`);
      console.log('='.repeat(60));
      
      // Phase 1
      console.log('\n📊 PHASE 1: Geographic & Restaurant Data\n');
      console.log('\n1️⃣  Running MSA enrichment...\n');
      await enrichMSA(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n2️⃣  Running ZIP code enrichment...\n');
      await enrichZipCodes(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n3️⃣  Running restaurant density enrichment...\n');
      console.log('⚠️  Note: This may take a long time due to Overpass API rate limits\n');
      await enrichRestaurantDensity(limit);
      
      console.log('\n' + '='.repeat(60));
      
      // Phase 2
      console.log('\n📊 PHASE 2: Content & Local Context\n');
      console.log('\n4️⃣  Running Wikipedia enrichment...\n');
      await enrichWikipedia(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n5️⃣  Running Points of Interest enrichment...\n');
      console.log('⚠️  Note: This may take a long time due to Overpass API rate limits\n');
      await enrichPOIs(limit);
      
      console.log('\n' + '='.repeat(60));
      console.log('\n✅ All enrichments (Phase 1 + Phase 2) complete!\n');
    },
    description: 'Runs all enrichment scripts in sequence (Phase 1 + Phase 2)'
  }
};

async function main() {
  const args = process.argv.slice(2);
  const scriptArg = args[0] || 'all';
  
  // Check for --limit flag
  let limit = null;
  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit < 1) {
      console.error('❌ Invalid limit value. Must be a positive integer.');
      process.exit(1);
    }
  }
  
  console.log('🏙️  City SEO Enrichment\n');
  console.log('Available scripts:');
  console.log('\n  Phase 1:');
  console.log('    msa          - MSA/Regional Data');
  console.log('    zip          - ZIP Code Coverage');
  console.log('    restaurant   - Restaurant Density');
  console.log('    phase1       - All Phase 1 enrichments');
  console.log('\n  Phase 2:');
  console.log('    wikipedia    - Wikipedia Summaries');
  console.log('    poi          - Points of Interest');
  console.log('    phase2       - All Phase 2 enrichments');
  console.log('\n  All:');
  console.log('    all          - All enrichments (Phase 1 + Phase 2)');
  console.log('\nUsage: node index.js [script] [--limit N]');
  console.log('Examples:');
  console.log('  node index.js phase1 --limit 5');
  console.log('  node index.js phase2 --limit 5');
  console.log('  node index.js wikipedia --limit 10\n');
  
  if (!scriptMap[scriptArg]) {
    console.error(`❌ Unknown script: ${scriptArg}`);
    console.error(`   Available: ${Object.keys(scriptMap).join(', ')}`);
    process.exit(1);
  }
  
  const script = scriptMap[scriptArg];
  const startTime = Date.now();
  
  try {
    console.log(`📊 Running: ${script.name}`);
    console.log(`📝 ${script.description}`);
    if (limit) {
      console.log(`🔢 Limit: Processing only ${limit} cities\n`);
    } else {
      console.log();
    }
    
    await script.func(limit);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n⏱️  Total time: ${duration}s\n`);
    
  } catch (error) {
    console.error(`\n❌ Error running ${script.name}:`, error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { main };
