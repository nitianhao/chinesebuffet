/**
 * Script to run an Apify actor
 * 
 * Usage:
 *   node scripts/run-apify-actor.js <actorId> [options]
 * 
 * Examples:
 *   # Run Google Maps Scraper
 *   node scripts/run-apify-actor.js apify/google-maps-scraper --query "Chinese buffet" --location "New York, NY"
 * 
 *   # Run with custom input file
 *   node scripts/run-apify-actor.js apify/google-maps-scraper --input input.json
 * 
 *   # Run and save output
 *   node scripts/run-apify-actor.js apify/google-maps-scraper --query "Chinese buffet" --output results.json
 * 
 * Options:
 *   --input <file>     - JSON file with actor input
 *   --output <file>    - Output file for results (default: apify_results_[timestamp].json)
 *   --no-wait          - Don't wait for actor to finish
 *   --timeout <ms>     - Timeout in milliseconds (default: 3600000 = 1 hour)
 */

const fs = require('fs');
const path = require('path');
const { runActor, getRunStatus, getDatasetItems } = require('../lib/apify-client');

// Parse command line arguments
const args = process.argv.slice(2);
const actorId = args[0];

if (!actorId) {
  console.error('❌ Error: Actor ID is required');
  console.error('Usage: node scripts/run-apify-actor.js <actorId> [options]');
  console.error('\nExamples:');
  console.error('  node scripts/run-apify-actor.js apify/google-maps-scraper --query "Chinese buffet" --location "New York, NY"');
  console.error('  node scripts/run-apify-actor.js apify/google-maps-scraper --input input.json');
  process.exit(1);
}

// Parse options
let input = {};
let outputFile = null;
let waitForFinish = true;
let timeout = 3600000;

for (let i = 1; i < args.length; i++) {
  const arg = args[i];
  const nextArg = args[i + 1];
  
  if (arg === '--input' && nextArg) {
    const inputPath = path.resolve(nextArg);
    if (!fs.existsSync(inputPath)) {
      console.error(`❌ Error: Input file not found: ${inputPath}`);
      process.exit(1);
    }
    input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    i++;
  } else if (arg === '--output' && nextArg) {
    outputFile = nextArg;
    i++;
  } else if (arg === '--no-wait') {
    waitForFinish = false;
  } else if (arg === '--timeout' && nextArg) {
    timeout = parseInt(nextArg, 10);
    i++;
  } else if (arg.startsWith('--')) {
    // Generic key-value pairs for input
    const key = arg.substring(2);
    if (nextArg && !nextArg.startsWith('--')) {
      // Try to parse as JSON, fallback to string
      try {
        input[key] = JSON.parse(nextArg);
      } catch {
        input[key] = nextArg;
      }
      i++;
    } else {
      input[key] = true;
    }
  }
}

// Default output filename
if (!outputFile && waitForFinish) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  outputFile = `apify_results_${timestamp}.json`;
}

async function main() {
  try {
    console.log(`\n🎬 Running Apify Actor: ${actorId}\n`);
    
    const result = await runActor(actorId, input, {
      waitForFinish,
      timeout,
    });
    
    if (waitForFinish && result.items) {
      // Save results to file
      const outputPath = path.join(__dirname, '..', outputFile);
      fs.writeFileSync(outputPath, JSON.stringify(result.items, null, 2));
      console.log(`\n💾 Results saved to: ${outputPath}`);
      console.log(`📊 Total items: ${result.items.length}`);
      
      // Print summary
      if (result.stats) {
        console.log(`\n📈 Run Statistics:`);
        console.log(`   - Requests: ${result.stats.requestsTotal || 'N/A'}`);
        console.log(`   - Duration: ${result.stats.duration || 'N/A'}ms`);
      }
    } else {
      console.log(`\n⏳ Run started. Run ID: ${result.runId}`);
      console.log(`🔗 View progress: https://console.apify.com/actors/runs/${result.runId}`);
      console.log(`\nTo check status later, use:`);
      console.log(`  node scripts/check-apify-run.js ${result.runId}`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();




















