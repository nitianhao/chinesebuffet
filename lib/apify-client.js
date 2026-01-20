/**
 * Apify Client Helper Module
 * 
 * This module provides a wrapper around the Apify Client SDK
 * for easy integration with Apify actors.
 * 
 * Usage:
 *   const apify = require('./lib/apify-client');
 *   const client = apify.getClient();
 *   const run = await apify.runActor(actorId, input);
 */

const { ApifyClient } = require('apify-client');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  try {
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
  } catch (error) {
    // If we can't read .env.local, assume token is set via environment variable
    console.warn('⚠️  Could not read .env.local, using environment variables instead');
  }
}

let client = null;

/**
 * Get or create an Apify client instance
 * @returns {ApifyClient} Apify client instance
 */
function getClient() {
  if (!client) {
    const token = process.env.APIFY_TOKEN;
    if (!token) {
      throw new Error(
        '❌ Error: APIFY_TOKEN not found in environment variables\n' +
        '   Please add it to .env.local file:\n' +
        '   APIFY_TOKEN=your_apify_token_here\n' +
        '   Get your token from: https://console.apify.com/account/integrations'
      );
    }
    client = new ApifyClient({ token });
  }
  return client;
}

/**
 * Run an Apify actor and wait for it to complete
 * @param {string} actorId - Actor ID (e.g., 'apify/google-maps-scraper')
 * @param {Object} input - Input object for the actor
 * @param {Object} options - Additional options
 * @param {boolean} options.waitForFinish - Wait for actor to finish (default: true)
 * @param {number} options.timeout - Timeout in milliseconds (default: 3600000 = 1 hour)
 * @returns {Promise<Object>} Run result with dataset items
 */
async function runActor(actorId, input, options = {}) {
  const {
    waitForFinish = true,
    timeout = 3600000, // 1 hour default
  } = options;

  const apifyClient = getClient();
  
  console.log(`🚀 Starting Apify actor: ${actorId}`);
  console.log(`📥 Input:`, JSON.stringify(input, null, 2));
  
  // Start the actor run
  const run = await apifyClient.actor(actorId).start(input);
  console.log(`✅ Actor run started: ${run.id}`);
  console.log(`🔗 View run: https://console.apify.com/actors/runs/${run.id}`);
  
  if (!waitForFinish) {
    return { runId: run.id, status: 'RUNNING' };
  }
  
  // Wait for the run to finish
  console.log(`⏳ Waiting for actor to finish...`);
  const finishedRun = await apifyClient.run(run.id).waitForFinish({ waitSecs: timeout / 1000 });
  
  if (finishedRun.status === 'SUCCEEDED') {
    console.log(`✅ Actor run completed successfully!`);
    
    // Get dataset items
    const dataset = await apifyClient.dataset(finishedRun.defaultDatasetId).listItems();
    console.log(`📊 Retrieved ${dataset.items.length} items from dataset`);
    
    return {
      runId: finishedRun.id,
      status: finishedRun.status,
      items: dataset.items,
      stats: finishedRun.stats,
    };
  } else {
    console.error(`❌ Actor run failed with status: ${finishedRun.status}`);
    throw new Error(`Actor run failed: ${finishedRun.status}`);
  }
}

/**
 * Get dataset items from a completed run
 * @param {string} datasetId - Dataset ID
 * @param {Object} options - Options for fetching items
 * @returns {Promise<Array>} Array of dataset items
 */
async function getDatasetItems(datasetId, options = {}) {
  const {
    limit = null,
    offset = 0,
    clean = true, // Remove Apify metadata by default
  } = options;

  const apifyClient = getClient();
  const dataset = await apifyClient.dataset(datasetId).listItems({
    limit,
    offset,
    clean,
  });
  
  return dataset.items;
}

/**
 * Get run status
 * @param {string} runId - Run ID
 * @returns {Promise<Object>} Run status and info
 */
async function getRunStatus(runId) {
  const apifyClient = getClient();
  const run = await apifyClient.run(runId).get();
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    stats: run.stats,
    defaultDatasetId: run.defaultDatasetId,
  };
}

module.exports = {
  getClient,
  runActor,
  getDatasetItems,
  getRunStatus,
};





















