/**
 * Generate SEO-optimized "Travel & Tourism Services nearby" descriptions for buffets
 * 
 * Generates deterministic JSON descriptions based on POI data from the database.
 * No LLM required - uses template-based generation for reliable output.
 * 
 * Example commands:
 *   npx tsx scripts/generate-poi-travel-tourism-services.ts --limit 10 --concurrency 3 --dry-run
 *   npx tsx scripts/generate-poi-travel-tourism-services.ts --concurrency 5
 */

import { init } from '@instantdb/admin';
// @ts-ignore - schema import
import schema from '../src/instant.schema';
import * as fs from 'fs';
import * as path from 'path';
import pLimit from 'p-limit';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config();

const DEFAULT_LIMIT = 0; // 0 = no limit
const DEFAULT_CONCURRENCY = 3;
const TARGET_GROUP = 'Travel & Tourism Services';
const MAX_POIS = 20; // Limit to 20 POIs for SEO tightness
const CHECKPOINT_FILE = path.join(__dirname, 'checkpoint-travel-tourism-services.json');

type BuffetRecord = {
  id: string;
  name?: string | null;
  travelTourismServices?: string | null;
  poiRecords?: PoiRecord[];
};

type PoiRecord = {
  id: string;
  osmId?: number | null;
  name?: string | null;
  category?: string | null;
  type?: string | null;
  tags?: string | null;
  distanceFt?: number | null;
  group?: string | null;
  lat?: number | null;
  lon?: number | null;
};

type CleanPoi = {
  name: string;
  distanceFt: number;
  distanceText: string;
  category: string;
  tags: Record<string, any>;
};

type HighlightGroup = {
  label: string;
  items: Array<{
    name: string;
    distanceFt: number;
    distanceText: string;
    category: string;
  }>;
};

type TravelTourismOutput = {
  summary: string;
  highlights: HighlightGroup[];
  poiCount: number;
  generatedAt: string;
  model: string;
};

type Checkpoint = {
  [buffetId: string]: {
    status: 'generated' | 'skipped_existing' | 'skipped_no_pois' | 'error';
    timestamp: number;
    poiCount?: number;
    errorMessage?: string;
  };
};

function loadCheckpoint(): Checkpoint {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      const content = fs.readFileSync(CHECKPOINT_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      console.warn('Warning: Could not parse checkpoint file, starting fresh');
    }
  }
  return {};
}

function saveCheckpoint(checkpoint: Checkpoint) {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function safeJsonParse(str: string | null | undefined): any {
  if (!str || typeof str !== 'string') return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

function roundToNearest10(num: number): number {
  return Math.round(num / 10) * 10;
}

function formatDistance(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0 || !Number.isFinite(distanceFt)) {
    return 'unknown distance';
  }
  if (distanceFt < 1000) {
    const rounded = roundToNearest10(distanceFt);
    return `~${rounded} ft`;
  }
  const miles = distanceFt / 5280;
  if (miles < 0.1) {
    return `~${(miles * 10).toFixed(1)} mi`;
  }
  return `~${miles.toFixed(1)} mi`;
}

function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function derivePoiName(poi: PoiRecord): string {
  // Priority: poi.name > tags.name > tags.brand > tags.operator > category-based description
  if (poi.name && poi.name.trim()) {
    return poi.name.trim();
  }
  
  const tags = safeJsonParse(poi.tags);
  if (tags.name && tags.name.trim()) {
    return tags.name.trim();
  }
  if (tags.brand && tags.brand.trim()) {
    return tags.brand.trim();
  }
  if (tags.operator && tags.operator.trim()) {
    return tags.operator.trim();
  }
  
  // Category-based fallback descriptions
  const category = poi.category || '';
  const categoryLower = category.toLowerCase();
  
  if (categoryLower === 'attraction') {
    // Check tags for more specific info
    if (tags.historic && tags['aircraft:type']) {
      const aircraftType = tags['aircraft:type'] || 'aircraft';
      return `Historic ${aircraftType} attraction`;
    }
    if (tags.tourism === 'attraction') {
      return 'Tourism attraction';
    }
    return 'Attraction';
  }
  
  if (categoryLower === 'information') {
    if (tags.information === 'office') {
      return 'Visitor information office';
    }
    if (tags.information === 'board') {
      return 'Information board';
    }
    return 'Visitor information';
  }
  
  if (categoryLower === 'travel_agency') {
    if (tags.brand || tags.short_name) {
      const brand = tags.brand || tags.short_name;
      return `${brand} travel agency`;
    }
    return 'Travel agency';
  }
  
  // Generic fallback
  return category || 'Travel & tourism service';
}

function dedupePois(pois: PoiRecord[]): PoiRecord[] {
  // Primary key: osmId if present
  const byOsmId = new Map<number, PoiRecord>();
  // Secondary key: normalized name + lat + lon (for POIs without osmId)
  const byNameLocation = new Map<string, PoiRecord>();

  for (const poi of pois) {
    const distanceFt = poi.distanceFt || Infinity;
    
    if (poi.osmId != null && Number.isFinite(poi.osmId)) {
      // Primary deduplication by osmId
      const existing = byOsmId.get(poi.osmId);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byOsmId.set(poi.osmId, poi);
      }
    } else {
      // Secondary deduplication by name + location
      const name = derivePoiName(poi);
      const normalizedName = normalizeName(name);
      const lat = poi.lat != null && Number.isFinite(poi.lat) ? poi.lat.toFixed(4) : '0';
      const lon = poi.lon != null && Number.isFinite(poi.lon) ? poi.lon.toFixed(4) : '0';
      const key = `${normalizedName}|${lat}|${lon}`;
      
      const existing = byNameLocation.get(key);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byNameLocation.set(key, poi);
      }
    }
  }

  // Combine results, prioritizing osmId entries
  const result: PoiRecord[] = [];
  const seenSecondary = new Set<string>();

  for (const poi of byOsmId.values()) {
    result.push(poi);
  }

  for (const poi of byNameLocation.values()) {
    // Skip if we already have this via osmId
    if (poi.osmId != null && byOsmId.has(poi.osmId)) {
      continue;
    }
    // Skip if name+location already seen
    const name = derivePoiName(poi);
    const normalizedName = normalizeName(name);
    const lat = poi.lat != null && Number.isFinite(poi.lat) ? poi.lat.toFixed(4) : '0';
    const lon = poi.lon != null && Number.isFinite(poi.lon) ? poi.lon.toFixed(4) : '0';
    const key = `${normalizedName}|${lat}|${lon}`;
    if (!seenSecondary.has(key)) {
      seenSecondary.add(key);
      result.push(poi);
    }
  }

  // Sort by distance ascending
  return result.sort((a, b) => {
    const distA = a.distanceFt || Infinity;
    const distB = b.distanceFt || Infinity;
    return distA - distB;
  });
}

function prepareCleanPois(pois: PoiRecord[]): CleanPoi[] {
  return pois.map(poi => {
    const name = derivePoiName(poi);
    const distanceFt = poi.distanceFt || 0;
    const distanceText = formatDistance(distanceFt);
    const category = poi.category || 'unknown';
    const tags = safeJsonParse(poi.tags);

    return {
      name,
      distanceFt,
      distanceText,
      category,
      tags
    };
  });
}

function groupPoisByCategory(pois: CleanPoi[]): HighlightGroup[] {
  const categoryMap = new Map<string, CleanPoi[]>();
  
  for (const poi of pois) {
    const category = poi.category || 'other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(poi);
  }
  
  // Map categories to display labels (exact labels per spec)
  const categoryLabels: Record<string, string> = {
    'information': 'Visitor information',
    'travel_agency': 'Travel agencies',
    'attraction': 'Attractions',
    'tour': 'Tours',
    'guidepost': 'Guideposts',
    'map': 'Maps',
    'other': 'Other'
  };
  
  const groups: HighlightGroup[] = [];
  
  // Build groups for all categories present
  for (const [category, items] of categoryMap.entries()) {
    // Sort items within group by distanceFt ascending
    const sortedItems = [...items].sort((a, b) => a.distanceFt - b.distanceFt);
    groups.push({
      label: categoryLabels[category] || category,
      items: sortedItems.map(poi => ({
        name: poi.name, // Use exact name from POI (no renaming)
        distanceFt: poi.distanceFt, // Use exact distanceFt
        distanceText: poi.distanceText,
        category: poi.category
      }))
    });
  }
  
  // Sort groups by nearest item distance (ascending) - group with closest POI comes first
  groups.sort((a, b) => {
    const aNearest = a.items[0]?.distanceFt ?? Infinity;
    const bNearest = b.items[0]?.distanceFt ?? Infinity;
    return aNearest - bNearest;
  });
  
  // Limit to 3 groups
  return groups.slice(0, 3);
}

async function generateDescription(
  cleanPois: CleanPoi[],
  highlightGroups: HighlightGroup[]
): Promise<{ output: TravelTourismOutput }> {
  // Generate summary deterministically - reliable and fast
  const summary = buildDeterministicSummary(cleanPois, highlightGroups);
  
  const output: TravelTourismOutput = {
    summary,
    highlights: highlightGroups,
    poiCount: cleanPois.length,
    generatedAt: new Date().toISOString(),
    model: 'deterministic'
  };
  
  return { output };
}

function buildDeterministicSummary(cleanPois: CleanPoi[], highlightGroups: HighlightGroup[]): string {
  const sortedPois = [...cleanPois].sort((a, b) => a.distanceFt - b.distanceFt);
  const poiCount = sortedPois.length;
  const nearest = sortedPois[0];
  const second = sortedPois[1];
  
  // Category label mapping for individual POIs (used in poiCount=2 template)
  const getCategoryLabel = (category: string): string => {
    const labelMap: Record<string, string> = {
      'travel_agency': 'travel agency',
      'information': 'visitor information',
      'attraction': 'nearby attraction',
      'tour': 'tour listing',
      'guidepost': 'guidepost',
      'map': 'map location',
      'other': 'point of interest'
    };
    return labelMap[category] || 'point of interest';
  };
  
  // Category-accurate descriptions (NOT "services" for attractions)
  const categoryDescriptions: Record<string, { singular: string; plural: string }> = {
    'information': { singular: 'visitor information point', plural: 'visitor information points' },
    'travel_agency': { singular: 'travel agency', plural: 'travel agencies' },
    'attraction': { singular: 'nearby attraction', plural: 'nearby attractions' },
    'tour': { singular: 'tour listing', plural: 'tour listings' },
    'guidepost': { singular: 'guidepost', plural: 'guideposts' },
    'map': { singular: 'map location', plural: 'map locations' },
    'other': { singular: 'point of interest', plural: 'points of interest' }
  };
  
  // Get unique categories present
  const categories = new Set(cleanPois.map(p => p.category));
  const categoryList = Array.from(categories);
  
  // Build category text based on what's actually present
  const getCategoryText = (count: number): string => {
    if (categoryList.length === 1) {
      const desc = categoryDescriptions[categoryList[0]] || categoryDescriptions.other;
      return count === 1 ? desc.singular : desc.plural;
    }
    // Multiple categories - list them
    const labels = categoryList.map(c => {
      const desc = categoryDescriptions[c] || categoryDescriptions.other;
      return desc.plural;
    });
    if (labels.length === 2) {
      return `${labels[0]} and ${labels[1]}`;
    }
    return labels.slice(0, -1).join(', ') + ', and ' + labels[labels.length - 1];
  };

  // Build 1-2 sentences, 50-90 words:
  // - Nearest POI first with distance
  // - "near this Chinese buffet" exactly once
  // - Category-accurate language
  // - No generic filler
  
  if (poiCount === 1) {
    // Single POI: 1 sentence
    const catText = getCategoryText(1);
    return `${nearest.name} at ${nearest.distanceText} is a ${catText} near this Chinese buffet.`;
  } else if (poiCount === 2) {
    // Two POIs: explicit enumeration with category labels and safe usefulness clause
    const poi1CategoryLabel = getCategoryLabel(nearest.category || 'other');
    const poi2CategoryLabel = getCategoryLabel(second.category || 'other');
    return `Near this Chinese buffet, there are two nearby travel-related places: ${nearest.name} (${poi1CategoryLabel}) at ${nearest.distanceText} and ${second.name} (${poi2CategoryLabel}) at ${second.distanceText}, which can be useful for basic trip planning or local visitor guidance.`;
  } else {
    // 3+ POIs: mention count and range
    const catText = getCategoryText(poiCount);
    const farthest = sortedPois[sortedPois.length - 1];
    return `Near this Chinese buffet, ${poiCount} ${catText} are listed, with ${nearest.name} at ${nearest.distanceText} being the closest and ${farthest.name} at ${farthest.distanceText} being the farthest.`;
  }
}

async function processBuffet(
  buffet: BuffetRecord,
  checkpoint: Checkpoint,
  db: any,
  options: { dryRun: boolean; resume: boolean }
): Promise<{ status: string; output?: TravelTourismOutput; poiCount?: number }> {
  const buffetId = buffet.id;
  
  // Skip if already in checkpoint (resume mode)
  if (options.resume && checkpoint[buffetId]) {
    const existing = checkpoint[buffetId];
    return { 
      status: existing.status,
      poiCount: existing.poiCount
    };
  }
  
  // Skip if travelTourismServices already exists (DO NOT call LLM)
  if (buffet.travelTourismServices && buffet.travelTourismServices.trim().length > 0) {
    checkpoint[buffetId] = {
      status: 'skipped_existing',
      timestamp: Date.now()
    };
    return { status: 'skipped_existing' };
  }
  
  // Get POIs and filter
  const poiRecords = buffet.poiRecords || [];
  const filteredPOIs = poiRecords.filter((poi: PoiRecord) => {
    // Filter by group (exact match)
    if (!poi.group || poi.group !== TARGET_GROUP) return false;
    return true;
  });

  // If no eligible POIs => SKIP LLM + SKIP DB update
  if (filteredPOIs.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }

  // Dedupe POIs (keep closest for same osmId)
  const dedupedPOIs = dedupePois(filteredPOIs);
  
  // Limit to MAX_POIS (closest ones)
  const limitedPOIs = dedupedPOIs.slice(0, MAX_POIS);
  
  // Prepare clean data
  const cleanPois = prepareCleanPois(limitedPOIs);
  
  // Group POIs by category
  const highlightGroups = groupPoisByCategory(cleanPois);
  
  // Generate description
  try {
    const { output } = await generateDescription(
      cleanPois,
      highlightGroups
    );
    
    // Write to database if not dry run
    if (!options.dryRun) {
      const jsonString = JSON.stringify(output);
      await db.transact([db.tx.buffets[buffetId].update({ travelTourismServices: jsonString })]);
    }
    
    checkpoint[buffetId] = {
      status: 'generated',
      timestamp: Date.now(),
      poiCount: limitedPOIs.length
    };
    
    return { 
      status: 'generated', 
      output, 
      poiCount: limitedPOIs.length
    };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    checkpoint[buffetId] = {
      status: 'error',
      timestamp: Date.now(),
      errorMessage
    };
    throw new Error(`Generation failed: ${errorMessage}`);
  }
}

function printBuffetOutput(
  buffet: BuffetRecord,
  result: { 
    status: string; 
    output?: TravelTourismOutput;
    poiCount?: number;
  }
) {
  const buffetId = buffet.id;
  const buffetName = buffet.name || buffetId;
  
  console.log('='.repeat(80));
  console.log(`BUFFET: ${buffetName} (${buffetId})`);
  
  if (result.status === 'generated') {
    console.log(`STATUS: GENERATED`);
    console.log(`POI COUNT: ${result.poiCount || 0}`);
    console.log('-'.repeat(80));
    if (result.output) {
      console.log(JSON.stringify(result.output, null, 2));
    }
  } else if (result.status === 'skipped_existing') {
    console.log(`STATUS: SKIPPED_EXISTING (travelTourismServices already present)`);
  } else if (result.status === 'skipped_no_pois') {
    console.log(`STATUS: SKIPPED_NO_POIS (no eligible POIs)`);
  }
  
  console.log('='.repeat(80));
}

async function main() {
  const argv = process.argv.slice(2);
  const hasFlag = (flag: string) => argv.includes(flag) || argv.includes(flag.replace(/([A-Z])/g, '-$1').toLowerCase());
  const getFlagValue = (flag: string, defaultValue: string | number) => {
    // Support both "--flag=value" and "--flag value" styles
    const equalsIndex = argv.findIndex(arg => arg.startsWith(flag + '='));
    if (equalsIndex >= 0) {
      const value = argv[equalsIndex].split('=')[1];
      if (typeof defaultValue === 'number') {
        const num = Number(value);
        if (!Number.isNaN(num)) return num;
      } else {
        return value;
      }
    }

    const spaceIndex = argv.findIndex(arg => arg === flag);
    if (spaceIndex >= 0 && argv[spaceIndex + 1]) {
      const value = argv[spaceIndex + 1];
      if (typeof defaultValue === 'number') {
        const num = Number(value);
        if (!Number.isNaN(num)) return num;
      } else {
        return value;
      }
    }

    return defaultValue;
  };

  const limit = getFlagValue('--limit', DEFAULT_LIMIT) as number;
  const concurrency = getFlagValue('--concurrency', DEFAULT_CONCURRENCY) as number;
  const dryRun = hasFlag('--dryRun') || hasFlag('--dry-run');
  const resume = hasFlag('--resume');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
    process.exit(1);
  }

  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  console.log('='.repeat(80));
  console.log('SEO Travel & Tourism Services Description Generator (Deterministic)');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);
  console.log(`Dry run mode: ${dryRun ? 'ENABLED (no database writes)' : 'DISABLED (will save to database)'}`);
  console.log(`Resume mode: ${resume ? 'ENABLED' : 'DISABLED'}`);
  console.log('');
  console.log('Starting processing...');
  console.log('');

  const checkpoint = resume ? loadCheckpoint() : {};
  const limiter = pLimit(concurrency);
  
  let scanned = 0;
  let generated = 0;
  let skippedExisting = 0;
  let skippedNoPois = 0;
  let failed = 0;
  const startTime = Date.now();
  
  // Fetch buffets in batches
  const batchSize = 100;
  let offset = 0;
  let processed = 0;
  let scheduled = 0; // Count of buffets scheduled for processing (enforces limit)
  const maxScans = limit > 0 ? limit * 3 : Infinity; // Stop after scanning 3x limit to avoid infinite loops
  
  while (true) {
    // Stop once we've scheduled enough items
    if (limit > 0 && scheduled >= limit) {
      break;
    }
    
    // Stop if we've scanned too many buffets without finding any to process
    if (limit > 0 && scanned >= maxScans) {
      console.log(`\nStopping after scanning ${scanned} buffets (limit: ${limit}, max scans: ${maxScans})`);
      break;
    }
    
    const result = await db.query({
      buffets: {
        $: {
          limit: batchSize,
          offset,
        },
        poiRecords: {
          $: {
            where: { group: TARGET_GROUP },
          },
        },
      },
    });
    
    const buffets = (result.buffets || []) as BuffetRecord[];
    if (buffets.length === 0) break;
    
    scanned += buffets.length;
    
    // Filter buffets that need processing and count skipped ones
    const toProcess: BuffetRecord[] = [];
    const skippedInBatch: { existing: number; noPois: number } = { existing: 0, noPois: 0 };
    
    for (const buffet of buffets) {
      // Stop scheduling if we've reached the limit
      if (limit > 0 && scheduled >= limit) {
        break;
      }
      
      // Skip if already in checkpoint (resume mode)
      if (resume && checkpoint[buffet.id]) {
        continue;
      }
      
      // Skip if already has travelTourismServices
      if (buffet.travelTourismServices && buffet.travelTourismServices.trim().length > 0) {
        skippedInBatch.existing++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_existing',
          timestamp: Date.now()
        };
        skippedExisting++;
        if (dryRun && skippedExisting <= 5) {
          printBuffetOutput(buffet, { status: 'skipped_existing' });
        }
        continue;
      }
      
      // Check for eligible POIs
      const pois = buffet.poiRecords || [];
      const hasEligiblePOIs = pois.some((p: PoiRecord) => {
        if (!p.group || p.group !== TARGET_GROUP) return false;
        return true;
      });
      
      if (!hasEligiblePOIs) {
        skippedInBatch.noPois++;
        // Log and update checkpoint
        checkpoint[buffet.id] = {
          status: 'skipped_no_pois',
          timestamp: Date.now()
        };
        skippedNoPois++;
        if (dryRun && skippedNoPois <= 5) {
          printBuffetOutput(buffet, { status: 'skipped_no_pois' });
        }
        continue;
      }
      
      // This buffet needs processing
      // Only add if we haven't reached the limit yet
      if (limit === 0 || scheduled < limit) {
        toProcess.push(buffet);
        scheduled++;
      } else {
        // We've reached the limit, stop adding more
        break;
      }
    }
    
    // If no items to process in this batch, check if we should fetch more
    if (toProcess.length === 0) {
      // If we've reached the limit, stop
      if (limit > 0 && scheduled >= limit && processed >= limit) {
        break;
      }
      // If no more buffets in this batch, stop
      if (buffets.length < batchSize) {
        break;
      }
      // If we've scanned enough buffets, stop (avoid infinite loop)
      if (limit > 0 && scanned >= maxScans) {
        break;
      }
      // Otherwise, fetch next batch
      offset += batchSize;
      continue;
    }
    
    // Log batch processing start
    if (toProcess.length > 0 && processed === 0) {
      console.log(`Processing batch of ${toProcess.length} buffets...`);
    }
    
    // Process with concurrency, but respect the limit
    const promises = toProcess.map(buffet =>
      limiter(async () => {
        // Double-check limit before processing (safety check)
        if (limit > 0 && processed >= limit) {
          return;
        }
        
        try {
          const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume });
          
          if (result.status === 'generated') {
            generated++;
            // Only print detailed output in dry-run mode or for first few items
            if (dryRun || generated <= 3) {
              printBuffetOutput(buffet, result);
            }
          }
          
          processed++;
          
          // Progress reporting every 10 items
          if (processed % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = processed / elapsed;
            const remaining = limit > 0 ? limit - processed : null;
            const eta = remaining && rate > 0 ? Math.round(remaining / rate) : null;
            
            let progressMsg = `Progress: ${processed} processed (${generated} generated, ${skippedExisting} skipped existing, ${skippedNoPois} skipped no POIs, ${failed} failed)`;
            if (limit > 0) {
              const pct = ((processed / limit) * 100).toFixed(1);
              progressMsg += ` - ${pct}% complete`;
            }
            progressMsg += ` | Rate: ${rate.toFixed(1)}/sec`;
            if (eta !== null) {
              const etaMin = Math.floor(eta / 60);
              const etaSec = eta % 60;
              progressMsg += ` | ETA: ${etaMin}m ${etaSec}s`;
            }
            console.log(progressMsg);
          }
          
          // Save checkpoint periodically
          if (!dryRun && processed % 10 === 0) {
            saveCheckpoint(checkpoint);
          }
        } catch (error: any) {
          failed++;
          const buffetId = buffet.id;
          checkpoint[buffetId] = {
            status: 'error',
            timestamp: Date.now(),
            errorMessage: error?.message || String(error)
          };
          console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
          processed++;
          
          // Show progress even on errors
          if (processed % 10 === 0) {
            const elapsed = (Date.now() - startTime) / 1000;
            const rate = processed / elapsed;
            console.log(`Progress: ${processed} processed (${generated} generated, ${failed} failed) | Rate: ${rate.toFixed(1)}/sec`);
          }
        }
      })
    );
    
    await Promise.all(promises);
    
    // Break if we've reached the limit
    if (limit > 0 && processed >= limit) {
      break;
    }
    
    if (buffets.length < batchSize) break;
    offset += batchSize;
  }
  
  // Final checkpoint save
  if (!dryRun) {
    saveCheckpoint(checkpoint);
  }
  
  const durationSec = (Date.now() - startTime) / 1000;
  const durationMin = (durationSec / 60).toFixed(1);
  const rate = processed > 0 ? (processed / durationSec).toFixed(2) : '0.00';
  const avgTimePerItem = processed > 0 ? (durationSec / processed).toFixed(2) : '0.00';
  
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Buffets scanned: ${scanned}`);
  console.log(`Total processed: ${processed}`);
  console.log(`  ✓ Generated: ${generated}`);
  console.log(`  ⊘ Skipped (existing): ${skippedExisting}`);
  console.log(`  ⊘ Skipped (no eligible POIs): ${skippedNoPois}`);
  console.log(`  ✗ Failed: ${failed}`);
  console.log('');
  console.log(`Duration: ${durationMin} minutes (${durationSec.toFixed(0)} seconds)`);
  console.log(`Processing rate: ${rate} items/second`);
  console.log(`Average time per item: ${avgTimePerItem} seconds`);
  if (generated > 0) {
    console.log(`Successfully generated ${generated} travel & tourism services descriptions`);
    if (!dryRun) {
      console.log(`✓ All descriptions saved to database`);
    }
  }
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
