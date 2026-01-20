/**
 * Add sample health inspection data to a test buffet for demonstration
 */

const { init } = require('@instantdb/admin');
const schema = require('../../src/instant.schema.ts');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../../.env.local');
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
  // Silently fail
}

const db = init({
  appId: '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Sample health inspection data from NYC (JADE ISLAND RESTAURANT)
const sampleHealthInspection = {
  currentScore: 12,
  currentGrade: "A",
  inspectionDate: "2025-12-02T00:00:00.000",
  violations: [
    {
      code: "04H",
      description: "Raw, cooked or prepared food is adulterated, contaminated, cross-contaminated, or not discarded in accordance with HACCP plan.",
      category: "Critical",
      severity: "High",
      corrected: false
    }
  ],
  criticalViolationsCount: 1,
  generalViolationsCount: 0,
  inspectionHistory: [
    {
      date: "2025-12-02T00:00:00.000",
      score: 12,
      grade: "A",
      violationsCount: 1,
      criticalViolationsCount: 1
    },
    {
      date: "2024-04-29T00:00:00.000",
      score: 13,
      grade: "A",
      violationsCount: 1,
      criticalViolationsCount: 1
    },
    {
      date: "2024-02-28T00:00:00.000",
      score: 32,
      grade: null,
      violationsCount: 1,
      criticalViolationsCount: 1
    }
  ],
  dataSource: "NYC DOHMH",
  lastUpdated: new Date().toISOString(),
  permitNumber: "40536227",
  healthDepartmentUrl: "https://www1.nyc.gov/site/doh/business/food-operators/letter-grading-for-restaurants.page"
};

async function addSampleHealthData() {
  try {
    if (!process.env.INSTANT_ADMIN_TOKEN) {
      throw new Error('INSTANT_ADMIN_TOKEN environment variable not set');
    }
    
    // Query for Kings Buffet by slug
    const result = await db.query({
      buffets: {
        $: {
          where: { slug: 'kings-buffet' }
        }
      }
    });
    
    if (!result.buffets || result.buffets.length === 0) {
      // Try to get any buffet
      const allResult = await db.query({ buffets: {} });
      if (!allResult.buffets || allResult.buffets.length === 0) {
        throw new Error('No buffets found in database');
      }
      var buffet = allResult.buffets[0];
      console.log('Kings Buffet not found, using first available buffet:', buffet.name);
    } else {
      var buffet = result.buffets[0];
    }
    
    console.log('Adding health inspection data to buffet:', buffet.name);
    console.log('  ID:', buffet.id);
    console.log('  Slug:', buffet.slug);
    console.log('  City:', buffet.cityName);
    
    // Update the buffet with health inspection data
    await db.transact([
      db.tx.buffets[buffet.id].update({
        healthInspection: JSON.stringify(sampleHealthInspection),
      }),
    ]);
    
    // Get city slug for URL
    const cityResult = await db.query({
      cities: {
        $: {
          where: { slug: buffet.city?.slug || '' }
        }
      }
    });
    const citySlug = cityResult.cities?.[0]?.slug || 'unknown';
    
    console.log('\n✓ Successfully added health inspection data!');
    console.log('\nBuffet details:');
    console.log('  Name:', buffet.name);
    console.log('  City:', buffet.cityName, buffet.state);
    console.log('  Health Grade: A (Score: 12)');
    console.log('  Violations: 1 Critical');
    console.log('\nYou can view it at:');
    console.log(`  http://localhost:3000/chinese-buffets/${citySlug}/${buffet.slug}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('INSTANT_ADMIN_TOKEN')) {
      console.error('\nPlease set INSTANT_ADMIN_TOKEN environment variable in .env.local');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  addSampleHealthData();
}

module.exports = { addSampleHealthData };

