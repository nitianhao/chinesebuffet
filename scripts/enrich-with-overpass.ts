// Script to enrich buffet data with Overpass API location information
// This script adds neighborhood, administrative boundaries, and nearby POI data

import fs from 'fs';
import path from 'path';
import {
  getNeighborhoodInfo,
  getAdministrativeBoundaries,
  findNearbyPOIs,
  getLocationDetails,
} from '../lib/overpass-api';
import { Buffet } from '../lib/data';

interface OverpassEnrichment {
  neighborhood?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  administrativeBoundaries?: Array<{
    name?: string;
    adminLevel: number;
    type: string;
  }>;
  nearbyPOIs?: Array<{
    name?: string;
    category?: string;
    distance: number;
  }>;
  enrichedAt: string;
}

interface EnrichedBuffet extends Buffet {
  overpassData?: OverpassEnrichment;
}

async function enrichBuffet(buffet: Buffet): Promise<OverpassEnrichment | null> {
  if (!buffet.location || !buffet.location.lat || !buffet.location.lng) {
    console.log(`Skipping ${buffet.name}: No location data`);
    return null;
  }

  const lat = buffet.location.lat;
  const lon = buffet.location.lng;

  try {
    console.log(`Enriching ${buffet.name} (${lat}, ${lon})...`);

    // Get neighborhood information
    const neighborhoodInfo = await getNeighborhoodInfo(lat, lon);

    // Get administrative boundaries
    const boundaries = await getAdministrativeBoundaries(lat, lon, [4, 6, 8, 10]);
    const boundaryData = boundaries.map(b => ({
      name: b.name,
      adminLevel: b.adminLevel,
      type: b.type,
    }));

    // Get nearby POIs (restaurants, cafes, etc.)
    const nearbyPOIs = await findNearbyPOIs(lat, lon, 500, ['restaurant', 'cafe', 'park'], 10);
    const poiData = nearbyPOIs.map(poi => ({
      name: poi.name,
      category: poi.category,
      distance: Math.round(poi.distance),
    }));

    return {
      ...neighborhoodInfo,
      administrativeBoundaries: boundaryData,
      nearbyPOIs: poiData,
      enrichedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error enriching ${buffet.name}:`, error);
    return null;
  }
}

async function enrichBuffetsFromFile(
  inputFile: string,
  outputFile: string,
  batchSize: number = 10,
  delayMs: number = 1000
): Promise<void> {
  console.log(`Reading buffets from ${inputFile}...`);
  const filePath = path.join(process.cwd(), inputFile);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const buffets: Record<string, Buffet> = JSON.parse(fileContents);

  const enrichedBuffets: Record<string, EnrichedBuffet> = {};
  const buffetEntries = Object.entries(buffets);
  const total = buffetEntries.length;

  console.log(`Found ${total} buffets to enrich\n`);

  for (let i = 0; i < buffetEntries.length; i++) {
    const [id, buffet] = buffetEntries[i];
    const progress = `[${i + 1}/${total}]`;

    // Skip if already enriched
    if ((buffet as EnrichedBuffet).overpassData) {
      console.log(`${progress} Skipping ${buffet.name}: Already enriched`);
      enrichedBuffets[id] = buffet as EnrichedBuffet;
      continue;
    }

    const enrichment = await enrichBuffet(buffet);
    enrichedBuffets[id] = {
      ...buffet,
      overpassData: enrichment || undefined,
    };

    // Add delay to respect rate limits
    if (i < buffetEntries.length - 1 && (i + 1) % batchSize === 0) {
      console.log(`\nProcessed ${i + 1} buffets. Waiting ${delayMs}ms before continuing...\n`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log(`\nWriting enriched data to ${outputFile}...`);
  const outputPath = path.join(process.cwd(), outputFile);
  fs.writeFileSync(outputPath, JSON.stringify(enrichedBuffets, null, 2), 'utf8');

  const enrichedCount = Object.values(enrichedBuffets).filter(b => b.overpassData).length;
  console.log(`\nEnrichment complete!`);
  console.log(`  Total buffets: ${total}`);
  console.log(`  Enriched: ${enrichedCount}`);
  console.log(`  Skipped: ${total - enrichedCount}`);
}

async function enrichSingleBuffet(buffetId: string): Promise<void> {
  const filePath = path.join(process.cwd(), 'data', 'buffets-by-id.json');
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const buffets: Record<string, Buffet> = JSON.parse(fileContents);

  const buffet = buffets[buffetId];
  if (!buffet) {
    console.error(`Buffet with ID ${buffetId} not found`);
    process.exit(1);
  }

  console.log(`Enriching buffet: ${buffet.name}`);
  const enrichment = await enrichBuffet(buffet);

  if (enrichment) {
    console.log('\nEnrichment data:');
    console.log(JSON.stringify(enrichment, null, 2));
  } else {
    console.log('Failed to enrich buffet');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'single' && args[1]) {
    // Enrich a single buffet
    await enrichSingleBuffet(args[1]);
  } else if (command === 'all') {
    // Enrich all buffets
    const inputFile = args[1] || 'data/buffets-by-id.json';
    const outputFile = args[2] || 'data/buffets-by-id-enriched-overpass.json';
    const batchSize = parseInt(args[3] || '10', 10);
    const delayMs = parseInt(args[4] || '1000', 10);

    await enrichBuffetsFromFile(inputFile, outputFile, batchSize, delayMs);
  } else {
    console.log('Usage:');
    console.log('  Enrich single buffet: npx tsx scripts/enrich-with-overpass.ts single <buffet-id>');
    console.log('  Enrich all buffets:   npx tsx scripts/enrich-with-overpass.ts all [input-file] [output-file] [batch-size] [delay-ms]');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx scripts/enrich-with-overpass.ts single ChIJ27isjSkjhYARsl2iAuDOEeU');
    console.log('  npx tsx scripts/enrich-with-overpass.ts all');
    console.log('  npx tsx scripts/enrich-with-overpass.ts all data/buffets-by-id.json data/enriched.json 5 2000');
  }
}

main().catch(console.error);

export { enrichBuffet, enrichBuffetsFromFile };

