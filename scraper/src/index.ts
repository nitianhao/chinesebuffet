#!/usr/bin/env node

import 'dotenv/config';
import { join } from 'path';
import pLimit from 'p-limit';
import { DatabaseManager } from './db/schema.js';
import { PlaceProcessor } from './processors/place-processor.js';
import { loadPlaceIdsFromFile } from './loaders/input-loader.js';
import { exportReviewsToNDJSON } from './exporters/json-export.js';
import { logger } from './utils/logger.js';
import { randomDelay } from './utils/delay.js';

interface CliOptions {
  input?: string;
  export?: boolean;
  maxConcurrent?: number;
  maxReviewPages?: number;
  minDelay?: number;
  maxDelay?: number;
}

async function main() {
  const args = process.argv.slice(2);
  const options: CliOptions = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input' || arg === '-i') {
      options.input = args[++i];
    } else if (arg === '--export' || arg === '-e') {
      options.export = true;
    } else if (arg === '--max-concurrent' || arg === '-c') {
      options.maxConcurrent = parseInt(args[++i], 10);
    } else if (arg === '--max-pages') {
      options.maxReviewPages = parseInt(args[++i], 10);
    } else if (arg === '--min-delay') {
      options.minDelay = parseInt(args[++i], 10);
    } else if (arg === '--max-delay') {
      options.maxDelay = parseInt(args[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // Get configuration from environment or defaults
  const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) {
    logger.error('GOOGLE_MAPS_API_KEY or GOOGLE_PLACES_API_KEY environment variable is required');
    process.exit(1);
  }

  const dbPath = process.env.DB_PATH || './data/tripadvisor_reviews.db';
  const maxConcurrent = options.maxConcurrent || parseInt(process.env.MAX_CONCURRENT || '2', 10);
  const maxReviewPages = options.maxReviewPages || 10;
  const minDelayMs = options.minDelay || parseInt(process.env.MIN_DELAY_MS || '2000', 10);
  const maxDelayMs = options.maxDelay || parseInt(process.env.MAX_DELAY_MS || '5000', 10);

  logger.info({
    dbPath,
    maxConcurrent,
    maxReviewPages,
    minDelayMs,
    maxDelayMs
  }, 'Starting TripAdvisor scraper');

  // Initialize database
  const db = new DatabaseManager(dbPath);
  const processor = new PlaceProcessor(db, {
    googleApiKey,
    maxReviewPages,
    minDelayMs,
    maxDelayMs
  });

  // Load place IDs if input file provided
  if (options.input) {
    logger.info({ input: options.input }, 'Loading place IDs from file');
    const placeIds = await loadPlaceIdsFromFile(options.input);
    logger.info({ count: placeIds.length }, 'Loaded place IDs');

    // Insert/update places in database
    for (const placeId of placeIds) {
      db.insertPlace({
        place_id: placeId,
        google_name: null,
        google_address: null,
        google_lat: null,
        google_lng: null,
        ta_url: null,
        ta_location_id: null,
        status: 'pending',
        attempts: 0,
        last_error: null,
        last_success_at: null,
        next_run_at: null
      });
    }
  }

  // Process places with concurrency control
  const limit = pLimit(maxConcurrent);
  let processed = 0;
  let failed = 0;

  const processBatch = async () => {
    const pendingPlaces = db.getPendingPlaces(maxConcurrent * 2);
    
    if (pendingPlaces.length === 0) {
      logger.info('No pending places to process');
      return false;
    }

    logger.info({ count: pendingPlaces.length }, 'Processing batch of places');

    const promises = pendingPlaces.map(place =>
      limit(async () => {
        try {
          await processor.processPlace(place.place_id);
          processed++;
          logger.info({ placeId: place.place_id, processed, failed }, 'Place completed');
        } catch (error: any) {
          failed++;
          logger.error({ placeId: place.place_id, error: error.message, processed, failed }, 'Place failed');
        }
        
        // Random delay between places
        await randomDelay(minDelayMs, maxDelayMs);
      })
    );

    await Promise.all(promises);
    return true;
  };

  // Main processing loop
  let hasMore = true;
  while (hasMore) {
    hasMore = await processBatch();
    
    if (hasMore) {
      // Wait before next batch
      await randomDelay(minDelayMs * 2, maxDelayMs * 2);
    }
  }

  logger.info({ processed, failed }, 'Processing completed');

  // Export if requested
  if (options.export) {
    logger.info('Exporting reviews to NDJSON');
    await exportReviewsToNDJSON(db);
  }

  db.close();
  logger.info('Scraper finished');
}

function printHelp() {
  console.log(`
TripAdvisor Review Scraper

Usage:
  tsx src/index.ts [options]

Options:
  -i, --input <file>        Input file with place IDs (JSON, CSV, or TXT)
  -e, --export              Export reviews to NDJSON after processing
  -c, --max-concurrent <n>  Maximum concurrent requests (default: 2)
      --max-pages <n>       Maximum review pages to scrape per place (default: 10)
      --min-delay <ms>      Minimum delay between requests in ms (default: 2000)
      --max-delay <ms>      Maximum delay between requests in ms (default: 5000)
  -h, --help                Show this help message

Environment Variables:
  GOOGLE_MAPS_API_KEY       Google Maps API key (required)
  GOOGLE_PLACES_API_KEY     Alternative name for API key
  USER_AGENT                Custom user agent string
  DB_PATH                   Database path (default: ./data/tripadvisor_reviews.db)
  MAX_CONCURRENT            Maximum concurrent requests (default: 2)
  MIN_DELAY_MS              Minimum delay in ms (default: 2000)
  MAX_DELAY_MS              Maximum delay in ms (default: 5000)

Examples:
  # Load place IDs and start scraping
  tsx src/index.ts --input places.json

  # Process with custom concurrency
  tsx src/index.ts --max-concurrent 1 --min-delay 5000

  # Export reviews after processing
  tsx src/index.ts --export
`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

main().catch(error => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
