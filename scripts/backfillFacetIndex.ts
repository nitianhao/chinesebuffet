/**
 * Backfill facetIndex for all buffets
 *
 * This script loads all buffets, computes their facetIndex using buildFacetIndex(),
 * and writes the result back to the database.
 *
 * Features:
 * - Resumable: Uses checkpoints to track progress
 * - Batched: Processes in configurable batches
 * - Progress logging: Shows status every N buffets
 * - Dry run mode: Preview changes without writing
 *
 * Usage:
 *   npx tsx scripts/backfillFacetIndex.ts                    # Run full backfill
 *   npx tsx scripts/backfillFacetIndex.ts --dry-run          # Preview without writing
 *   npx tsx scripts/backfillFacetIndex.ts --limit 100        # Process only 100 buffets
 *   npx tsx scripts/backfillFacetIndex.ts --batch-size 50    # Use batch size of 50
 *   npx tsx scripts/backfillFacetIndex.ts --force            # Overwrite existing facetIndex
 *   npx tsx scripts/backfillFacetIndex.ts --resume           # Resume from checkpoint
 *   npx tsx scripts/backfillFacetIndex.ts --buffet-id <id>   # Process single buffet
 *   npx tsx scripts/backfillFacetIndex.ts --clear-checkpoint # Clear checkpoint and start fresh
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import {
  buildFacetIndex,
  type BuffetForFacets,
} from '../lib/facets/buildFacetIndex';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_LIMIT = 0; // 0 = no limit
const LOG_EVERY = 100;
const CHECKPOINT_DIR = path.join(__dirname, 'checkpoints');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'facet-index.checkpoint.json');

// =============================================================================
// TYPES
// =============================================================================

interface Checkpoint {
  lastProcessedOffset: number;
  processedIds: string[];
  stats: {
    total: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  startedAt: string;
  lastUpdatedAt: string;
}

interface POIItem {
  name?: string;
  category?: string;
  distanceText?: string;
  distanceFt?: number;
}

interface POIHighlightGroup {
  label: string;
  items?: POIItem[];
}

interface POISection {
  summary?: string;
  highlights?: POIHighlightGroup[];
  poiCount?: number;
}

interface BuffetRecord {
  id: string;
  name?: string | null;
  facetIndex?: string | null;
  // Core fields for new facets
  rating?: number | null;
  reviewsCount?: number | null;
  price?: string | null;
  neighborhood?: string | null;
  // "What stands out" / customer highlights
  what_customers_are_saying_seo?: string | null;
  reviewSummaryParagraph1?: string | null;
  reviewSummaryParagraph2?: string | null;
  // Amenities from structuredData
  structuredData?: Array<{
    id: string;
    group?: string | null;
    type?: string | null;
    data?: string | null;
  }>;
  // POI sections
  transportationAutomotive?: string | null;
  accomodationLodging?: string | null;
  accommodationLodging?: string | null;
  retailShopping?: string | null;
  foodDining?: string | null;
  recreationEntertainment?: string | null;
  educationLearning?: string | null;
  repairMaintenance?: string | null;
  artsCulture?: string | null;
  travelTourismServices?: string | null;
}

// =============================================================================
// DATABASE SETUP
// =============================================================================

function getAdminDb() {
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN environment variable is required');
  }

  return init({
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });
}

// =============================================================================
// CHECKPOINT MANAGEMENT
// =============================================================================

function loadCheckpoint(): Checkpoint | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const content = fs.readFileSync(CHECKPOINT_FILE, 'utf8');
      return JSON.parse(content) as Checkpoint;
    }
  } catch (err) {
    console.warn('Failed to load checkpoint:', err);
  }
  return null;
}

function saveCheckpoint(checkpoint: Checkpoint): void {
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) {
      fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    }
    checkpoint.lastUpdatedAt = new Date().toISOString();
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
  } catch (err) {
    console.warn('Failed to save checkpoint:', err);
  }
}

function clearCheckpoint(): void {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      console.log('Checkpoint cleared.');
    }
  } catch (err) {
    console.warn('Failed to clear checkpoint:', err);
  }
}

function createCheckpoint(): Checkpoint {
  return {
    lastProcessedOffset: 0,
    processedIds: [],
    stats: { total: 0, updated: 0, skipped: 0, errors: 0 },
    startedAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// BUFFET TRANSFORMATION
// =============================================================================

/**
 * Parse JSON string safely, return null on error
 */
function safeJsonParse<T>(str: string | null | undefined): T | null {
  if (!str) return null;
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * Transform database buffet record to BuffetForFacets format
 */
function transformBuffetForFacets(buffet: BuffetRecord): BuffetForFacets {
  // Extract amenities and service options from structuredData
  let amenities: Record<string, unknown> = {};
  let accessibility: Record<string, unknown> = {};
  let serviceOptions: Record<string, unknown> = {};

  if (buffet.structuredData && Array.isArray(buffet.structuredData)) {
    for (const sd of buffet.structuredData) {
      if (!sd.data) continue;
      const parsed = safeJsonParse<Record<string, unknown>>(sd.data);
      if (!parsed) continue;

      const group = sd.group?.toLowerCase() || '';
      if (group === 'amenities' || group === 'parking') {
        amenities = { ...amenities, ...parsed };
      } else if (group === 'service options') {
        // Service options go to both amenities and serviceOptions
        amenities = { ...amenities, ...parsed };
        serviceOptions = { ...serviceOptions, ...parsed };
      } else if (group === 'accessibility') {
        accessibility = { ...accessibility, ...parsed };
      }
    }
  }

  // Parse POI sections
  const parsePOISection = (str: string | null | undefined): POISection | undefined => {
    const parsed = safeJsonParse<POISection>(str);
    return parsed || undefined;
  };

  return {
    id: buffet.id,
    // Core fields for new facets
    rating: buffet.rating,
    reviewsCount: buffet.reviewsCount,
    price: buffet.price,
    neighborhood: buffet.neighborhood,
    // "What stands out" / customer highlights
    what_customers_are_saying_seo: buffet.what_customers_are_saying_seo,
    reviewSummaryParagraph1: buffet.reviewSummaryParagraph1,
    reviewSummaryParagraph2: buffet.reviewSummaryParagraph2,
    // Service options for dine-in/takeout/delivery
    serviceOptions: Object.keys(serviceOptions).length > 0 ? serviceOptions : undefined,
    // Amenities
    amenities: Object.keys(amenities).length > 0 ? (amenities as BuffetForFacets['amenities']) : undefined,
    accessibility,
    // POI sections
    transportationAutomotive: parsePOISection(buffet.transportationAutomotive),
    accomodationLodging: parsePOISection(buffet.accomodationLodging),
    accommodationLodging: parsePOISection(buffet.accommodationLodging),
    retailShopping: parsePOISection(buffet.retailShopping),
    foodDining: parsePOISection(buffet.foodDining),
    recreationEntertainment: parsePOISection(buffet.recreationEntertainment),
    educationLearning: parsePOISection(buffet.educationLearning),
    repairMaintenance: parsePOISection(buffet.repairMaintenance),
    artsCulture: parsePOISection(buffet.artsCulture),
    travelTourismServices: parsePOISection(buffet.travelTourismServices),
  };
}

// =============================================================================
// MAIN PROCESSING
// =============================================================================

interface ProcessOptions {
  dryRun: boolean;
  force: boolean;
  limit: number;
  batchSize: number;
  resume: boolean;
  buffetId?: string;
}

async function processBatch(
  db: ReturnType<typeof init>,
  buffets: BuffetRecord[],
  options: ProcessOptions,
  checkpoint: Checkpoint
): Promise<{ updated: number; skipped: number; errors: number }> {
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const txs: ReturnType<typeof db.tx.buffets[string]['update']>[] = [];

  for (const buffet of buffets) {
    try {
      // Skip if already processed (resuming)
      if (checkpoint.processedIds.includes(buffet.id)) {
        skipped++;
        continue;
      }

      // Skip if facetIndex already exists and not forcing
      if (buffet.facetIndex && !options.force) {
        skipped++;
        checkpoint.processedIds.push(buffet.id);
        continue;
      }

      // Transform and compute facet index
      const buffetForFacets = transformBuffetForFacets(buffet);
      const facetData = buildFacetIndex(buffetForFacets);
      const facetIndexJson = JSON.stringify(facetData);

      if (!options.dryRun) {
        txs.push(db.tx.buffets[buffet.id].update({ facetIndex: facetIndexJson }));
      }

      updated++;
      checkpoint.processedIds.push(buffet.id);
    } catch (err) {
      const error = err as Error;
      console.error(`Error processing buffet ${buffet.id}:`, error.message);
      errors++;
      checkpoint.processedIds.push(buffet.id);
    }
  }

  // Execute batch transaction
  if (txs.length > 0 && !options.dryRun) {
    try {
      await db.transact(txs);
    } catch (err) {
      const error = err as Error;
      console.error('Batch transaction failed:', error.message);

      // Check for schema sync error
      if (error.message.includes('Attributes are missing') || error.message.includes('schema')) {
        console.error('\n' + '='.repeat(60));
        console.error('SCHEMA NOT SYNCED');
        console.error('='.repeat(60));
        console.error('The facetIndex field is not yet in the InstantDB schema.');
        console.error('\nPlease sync the schema first:');
        console.error('  npm run sync-schema');
        console.error('  OR');
        console.error('  npx instant-cli push --app 709e0e09-3347-419b-8daa-bad6889e480d');
        console.error('  OR');
        console.error('  npm run dev (briefly, then Ctrl+C)');
        console.error('='.repeat(60) + '\n');
        process.exit(1);
      }

      // Mark all as errors
      errors += txs.length;
      updated -= txs.length;
    }
  }

  return { updated, skipped, errors };
}

async function processSingleBuffet(
  db: ReturnType<typeof init>,
  buffetId: string,
  options: ProcessOptions
): Promise<void> {
  console.log(`Processing single buffet: ${buffetId}`);

  const result = await db.query({
    buffets: {
      $: { where: { id: buffetId } },
      structuredData: {},
    },
  });

  const buffet = result.buffets?.[0] as BuffetRecord | undefined;
  if (!buffet) {
    console.error(`Buffet not found: ${buffetId}`);
    process.exit(1);
  }

  const buffetForFacets = transformBuffetForFacets(buffet);
  const facetData = buildFacetIndex(buffetForFacets);
  const facetIndexJson = JSON.stringify(facetData);

  console.log('\nComputed facetIndex:');
  console.log(JSON.stringify(facetData, null, 2));

  if (!options.dryRun) {
    await db.transact([db.tx.buffets[buffetId].update({ facetIndex: facetIndexJson })]);
    console.log('\nWrote facetIndex to database.');
  } else {
    console.log('\n[DRY RUN] Would write facetIndex to database.');
  }
}

async function processAllBuffets(
  db: ReturnType<typeof init>,
  options: ProcessOptions
): Promise<void> {
  // Load or create checkpoint
  let checkpoint: Checkpoint;
  if (options.resume) {
    const loaded = loadCheckpoint();
    if (loaded) {
      console.log(`Resuming from checkpoint (offset: ${loaded.lastProcessedOffset}, processed: ${loaded.processedIds.length})`);
      checkpoint = loaded;
    } else {
      console.log('No checkpoint found, starting fresh.');
      checkpoint = createCheckpoint();
    }
  } else {
    checkpoint = createCheckpoint();
  }

  let offset = checkpoint.lastProcessedOffset;
  let totalProcessed = checkpoint.processedIds.length;
  let { total, updated, skipped, errors } = checkpoint.stats;

  console.log('\nStarting facetIndex backfill...');
  console.log(`Options: batchSize=${options.batchSize}, limit=${options.limit || 'unlimited'}, force=${options.force}, dryRun=${options.dryRun}`);
  console.log('');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Check limit
    if (options.limit > 0 && totalProcessed >= options.limit) {
      console.log(`Reached limit of ${options.limit} buffets.`);
      break;
    }

    // Calculate effective batch size
    const effectiveBatchSize = options.limit > 0
      ? Math.min(options.batchSize, options.limit - totalProcessed)
      : options.batchSize;

    // Query buffets with structuredData
    const result = await db.query({
      buffets: {
        $: { limit: effectiveBatchSize, offset },
        structuredData: {},
      },
    });

    const buffets = (result.buffets || []) as BuffetRecord[];
    if (buffets.length === 0) {
      console.log('No more buffets to process.');
      break;
    }

    // Process batch
    const batchResult = await processBatch(db, buffets, options, checkpoint);
    updated += batchResult.updated;
    skipped += batchResult.skipped;
    errors += batchResult.errors;
    total += buffets.length;
    totalProcessed += buffets.length;
    offset += buffets.length;

    // Update checkpoint
    checkpoint.lastProcessedOffset = offset;
    checkpoint.stats = { total, updated, skipped, errors };
    saveCheckpoint(checkpoint);

    // Log progress
    if (totalProcessed % LOG_EVERY === 0 || buffets.length < effectiveBatchSize) {
      console.log(
        `Progress: ${totalProcessed} processed | ${updated} updated | ${skipped} skipped | ${errors} errors`
      );
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processed: ${total}`);
  console.log(`Updated:         ${updated}`);
  console.log(`Skipped:         ${skipped}`);
  console.log(`Errors:          ${errors}`);
  if (options.dryRun) {
    console.log('\n[DRY RUN] No changes were written to the database.');
  }
  console.log('='.repeat(60));
}

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): ProcessOptions {
  const argv = process.argv.slice(2);

  const hasFlag = (flag: string) => argv.includes(flag);

  const getFlagValue = (flag: string, defaultValue: number): number => {
    const idx = argv.indexOf(flag);
    if (idx >= 0 && argv[idx + 1]) {
      const num = parseInt(argv[idx + 1], 10);
      if (!isNaN(num)) return num;
    }
    return defaultValue;
  };

  const getStringValue = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx >= 0 && argv[idx + 1]) {
      return argv[idx + 1];
    }
    return undefined;
  };

  return {
    dryRun: hasFlag('--dry-run'),
    force: hasFlag('--force'),
    resume: hasFlag('--resume'),
    limit: getFlagValue('--limit', DEFAULT_LIMIT),
    batchSize: getFlagValue('--batch-size', DEFAULT_BATCH_SIZE),
    buffetId: getStringValue('--buffet-id'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs();

  // Handle clear checkpoint
  if (process.argv.includes('--clear-checkpoint')) {
    clearCheckpoint();
    if (process.argv.length === 3) {
      process.exit(0);
    }
  }

  // Validate environment
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Set it in .env.local or as an environment variable.');
    process.exit(1);
  }

  const db = getAdminDb();

  // Process single buffet or all
  if (options.buffetId) {
    await processSingleBuffet(db, options.buffetId, options);
  } else {
    await processAllBuffets(db, options);
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
