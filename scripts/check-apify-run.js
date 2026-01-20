/**
 * Script to check the status of an Apify actor run
 * 
 * Usage:
 *   node scripts/check-apify-run.js <runId> [--output <file>]
 * 
 * Example:
 *   node scripts/check-apify-run.js abc123xyz --output results.json
 */

const fs = require('fs');
const path = require('path');
const { getRunStatus, getDatasetItems } = require('../lib/apify-client');

const runId = process.argv[2];
const outputFile = process.argv.includes('--output') 
  ? process.argv[process.argv.indexOf('--output') + 1]
  : null;

if (!runId) {
  console.error('❌ Error: Run ID is required');
  console.error('Usage: node scripts/check-apify-run.js <runId> [--output <file>]');
  process.exit(1);
}

async function main() {
  try {
    console.log(`\n🔍 Checking run status: ${runId}\n`);
    
    const status = await getRunStatus(runId);
    
    console.log(`📊 Run Status:`);
    console.log(`   - ID: ${status.id}`);
    console.log(`   - Status: ${status.status}`);
    console.log(`   - Started: ${status.startedAt || 'N/A'}`);
    console.log(`   - Finished: ${status.finishedAt || 'N/A'}`);
    
    if (status.stats) {
      console.log(`\n📈 Statistics:`);
      console.log(`   - Requests: ${status.stats.requestsTotal || 'N/A'}`);
      console.log(`   - Duration: ${status.stats.duration || 'N/A'}ms`);
    }
    
    if (status.status === 'SUCCEEDED' && status.defaultDatasetId) {
      console.log(`\n📥 Fetching dataset items...`);
      const items = await getDatasetItems(status.defaultDatasetId);
      console.log(`✅ Retrieved ${items.length} items`);
      
      if (outputFile) {
        const outputPath = path.join(__dirname, '..', outputFile);
        fs.writeFileSync(outputPath, JSON.stringify(items, null, 2));
        console.log(`💾 Results saved to: ${outputPath}`);
      }
    } else if (status.status === 'RUNNING') {
      console.log(`\n⏳ Run is still in progress...`);
      console.log(`🔗 View: https://console.apify.com/actors/runs/${runId}`);
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




















