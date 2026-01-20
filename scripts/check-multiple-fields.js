// Script to check if popularTimesHistogram, webResults, and orderBy fields are present in database

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  // Silently fail if .env.local can't be read
}

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

function parseField(value) {
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

function hasValidData(value, isArray = false) {
  const parsed = parseField(value);
  if (isArray) {
    return Array.isArray(parsed) && parsed.length > 0;
  }
  return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
}

async function checkFields() {
  console.log('Fetching all buffets from database...');
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
  
  console.log(`\nTotal buffets in database: ${allBuffets.length}\n`);
  
  // Check each field
  const fields = [
    { name: 'popularTimesHistogram', isArray: false },
    { name: 'webResults', isArray: true },
    { name: 'orderBy', isArray: true }
  ];
  
  const results = {};
  
  fields.forEach(field => {
    let hasField = 0;
    let hasData = 0;
    let noField = 0;
    
    allBuffets.forEach(buffet => {
      if (buffet[field.name] !== undefined && buffet[field.name] !== null) {
        hasField++;
        if (hasValidData(buffet[field.name], field.isArray)) {
          hasData++;
        }
      } else {
        noField++;
      }
    });
    
    results[field.name] = {
      hasField,
      hasData,
      noField,
      total: allBuffets.length
    };
    
    console.log(`📊 ${field.name}:`);
    console.log(`   - Has field: ${hasField}`);
    console.log(`   - With valid data: ${hasData}`);
    console.log(`   - No field: ${noField}`);
    console.log('');
  });
  
  // Check JSON file
  console.log('\n📄 Checking JSON file...');
  const jsonPath = path.join(__dirname, '../Example JSON/google_places_merged_all.json');
  const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  fields.forEach(field => {
    const jsonName = field.name === 'popularTimesHistogram' ? 'popularTimesHistogram' : 
                     field.name === 'webResults' ? 'webResults' : 'orderBy';
    
    const withData = jsonData.filter(r => {
      const value = r[jsonName];
      if (field.isArray) {
        return Array.isArray(value) && value.length > 0;
      }
      return value && typeof value === 'object' && Object.keys(value).length > 0;
    });
    
    console.log(`   ${jsonName}: ${withData.length} records with data`);
    
    if (withData.length > 0) {
      const sample = withData[0][jsonName];
      if (field.isArray) {
        console.log(`     Sample: Array with ${sample.length} items`);
        if (sample.length > 0) {
          console.log(`     First item keys: ${Object.keys(sample[0] || {}).join(', ')}`);
        }
      } else {
        console.log(`     Sample keys: ${Object.keys(sample || {}).join(', ')}`);
      }
    }
  });
  
  return results;
}

if (!process.env.INSTANT_ADMIN_TOKEN) {
  console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
  process.exit(1);
}

checkFields()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });

















