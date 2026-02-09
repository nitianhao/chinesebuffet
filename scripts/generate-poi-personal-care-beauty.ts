/**
 * Generate SEO-optimized "Personal Care & Beauty" descriptions for buffets
 * 
 * Generates deterministic JSON descriptions based on POI data from the database.
 * No LLM required - uses template-based generation for reliable, low-cost output.
 * 
 * Output stored in: buffets.personalCareBeauty (JSON string)
 * 
 * Example commands:
 *   npx tsx scripts/generate-poi-personal-care-beauty.ts --dry-run --limit 5
 *   npx tsx scripts/generate-poi-personal-care-beauty.ts --concurrency 5
 *   npx tsx scripts/generate-poi-personal-care-beauty.ts --buffetId <id> --dry-run
 *   npx tsx scripts/generate-poi-personal-care-beauty.ts --resume
 *   npx tsx scripts/generate-poi-personal-care-beauty.ts --force --limit 100
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

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_LIMIT = 0; // 0 = no limit
const DEFAULT_CONCURRENCY = 5;
const TARGET_GROUP = 'Personal Care & Beauty';
const MAX_ITEMS_PER_BUCKET = 6;
const MAX_TOTAL_ITEMS = 12;
const CHECKPOINT_DIR = path.join(__dirname, 'checkpoints');
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, 'personal-care-beauty.checkpoint.json');

// ============================================================================
// TYPES
// ============================================================================

type BuffetRecord = {
  id: string;
  name?: string | null;
  personalCareBeauty?: string | null;
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
  addressText: string | null;
  hoursText: string | null;
  phone: string | null;
  website: string | null;
  bucketKey: string;
  bucketLabel: string;
  osmId?: number | null;
  recordId: string;
};

type HighlightItem = {
  name: string;
  distanceText: string;
  category: string;
  addressText: string | null;
  hoursText: string | null;
  phone: string | null;
  website: string | null;
  osmId?: number | null;
  recordId?: string;
};

type HighlightGroup = {
  label: string;
  items: HighlightItem[];
};

type PersonalCareBeautyOutput = {
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

type ProcessExtras = {
  poiCount: number;
  nearestDistanceText: string;
  farthestDistanceText: string;
  rangeText: string;
  closestSummaryDistanceText: string;
  bucketCounts: Record<string, number>;
  bucketTypePhrases: Record<string, string>;
  closestBucketKey: string;
  hasWebsite: boolean;
  hasPhone: boolean;
  hasHours: boolean;
};

// ============================================================================
// CHECKPOINT MANAGEMENT
// ============================================================================

if (!fs.existsSync(CHECKPOINT_DIR)) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Safely parse JSON string, return empty object on failure
 */
function safeJsonParse(str: string | null | undefined): Record<string, any> {
  if (!str || typeof str !== 'string') return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * Format distance from feet to human-readable text
 * - Use feet if < 1056 ft (0.2 mi): "~870 ft"
 * - Else convert to miles with 1 decimal: "~0.5 mi", "~1.2 mi"
 */
function formatDistance(distanceFt: number | null | undefined): string {
  if (!distanceFt || distanceFt < 0 || !Number.isFinite(distanceFt)) {
    return 'unknown distance';
  }
  
  if (distanceFt < 1056) {
    // Round to nearest 10
    const rounded = Math.round(distanceFt / 10) * 10;
    return `~${rounded} ft`;
  }
  
  const miles = distanceFt / 5280;
  // Round to 1 decimal place
  const roundedMiles = Math.round(miles * 10) / 10;
  return `~${roundedMiles} mi`;
}

/**
 * Extract address from tags (NO city/state/zip)
 * Returns: "1435 Bedford Street" or "Bedford Street" or null
 */
function extractAddress(tagsObj: Record<string, any>): string | null {
  const houseNumber = tagsObj['addr:housenumber'] || '';
  const street = tagsObj['addr:street'] || '';
  
  if (houseNumber && street) {
    return `${houseNumber} ${street}`;
  }
  if (street) {
    return street;
  }
  return null;
}

/**
 * Normalize hours text: replace unicode dashes, collapse whitespace, truncate if too long
 */
function normalizeHours(rawHours: string): string {
  let normalized = rawHours
    // Replace unicode dashes with ASCII dash
    .replace(/[–—]/g, '-')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  // Truncate if longer than 140 chars
  if (normalized.length > 140) {
    normalized = normalized.substring(0, 137) + '…';
  }
  
  return normalized;
}

/**
 * Extract contact/operational details from tags
 * Returns: { hoursText, phone, website }
 */
function normalizeContact(tagsObj: Record<string, any>): {
  hoursText: string | null;
  phone: string | null;
  website: string | null;
} {
  // Opening hours - normalize unicode dashes, whitespace, truncate if needed
  let hoursText: string | null = null;
  const rawHours = tagsObj.opening_hours || tagsObj['opening_hours'] || null;
  if (rawHours && typeof rawHours === 'string' && rawHours.trim()) {
    hoursText = normalizeHours(rawHours);
  }
  
  // Phone - prefer direct phone over contact:phone
  let phone: string | null = null;
  const rawPhone = tagsObj.phone || tagsObj['contact:phone'] || null;
  if (rawPhone && typeof rawPhone === 'string') {
    phone = rawPhone.trim();
  }
  
  // Website - prefer direct website over contact:website
  let website: string | null = null;
  const rawWebsite = tagsObj.website || tagsObj['contact:website'] || null;
  if (rawWebsite && typeof rawWebsite === 'string') {
    website = rawWebsite.trim();
  }
  
  return { hoursText, phone, website };
}

/**
 * Get bucket key, label, and type phrase for a category
 */
function bucketize(category: string | null | undefined): { bucketKey: string; bucketLabel: string; typePhrase: string } {
  const cat = (category || '').toLowerCase().trim();
  
  const bucketMap: Record<string, { bucketKey: string; bucketLabel: string; typePhrase: string }> = {
    // Hair services
    'hairdresser': { bucketKey: 'hair', bucketLabel: 'Hair services', typePhrase: 'hair services' },
    'barber': { bucketKey: 'hair', bucketLabel: 'Hair services', typePhrase: 'hair services' },
    
    // Beauty & spa
    'beauty': { bucketKey: 'beauty', bucketLabel: 'Beauty & spa', typePhrase: 'beauty and spa services' },
    'spa': { bucketKey: 'beauty', bucketLabel: 'Beauty & spa', typePhrase: 'beauty and spa services' },
    'sauna': { bucketKey: 'beauty', bucketLabel: 'Beauty & spa', typePhrase: 'beauty and spa services' },
    'hot_tub': { bucketKey: 'beauty', bucketLabel: 'Beauty & spa', typePhrase: 'beauty and spa services' },
    'whirlpool': { bucketKey: 'beauty', bucketLabel: 'Beauty & spa', typePhrase: 'beauty and spa services' },
    
    // Nail services
    'nail_salon': { bucketKey: 'nails', bucketLabel: 'Nail services', typePhrase: 'nail services' },
    'nails': { bucketKey: 'nails', bucketLabel: 'Nail services', typePhrase: 'nail services' },
    
    // Tanning
    'tanning_salon': { bucketKey: 'tanning', bucketLabel: 'Tanning services', typePhrase: 'tanning services' },
    
    // Body art
    'tattoo': { bucketKey: 'body_art', bucketLabel: 'Body art', typePhrase: 'body art services' },
    'tattoo_removal': { bucketKey: 'body_art', bucketLabel: 'Body art', typePhrase: 'body art services' },
    'piercing': { bucketKey: 'body_art', bucketLabel: 'Body art', typePhrase: 'body art services' },
    
    // Other personal care
    'electrologist': { bucketKey: 'other', bucketLabel: 'Other personal care', typePhrase: 'personal care services' },
  };
  
  return bucketMap[cat] || { bucketKey: 'other', bucketLabel: 'Other personal care & beauty', typePhrase: 'personal care & beauty services' };
}

/**
 * Get fallback name for POI when name is null/empty
 * Uses human-friendly names, no placeholders like "point"
 */
function getCategoryFallback(category: string | null | undefined, tagsObj: Record<string, any>): string {
  const cat = (category || '').toLowerCase().trim();
  
  const fallbacks: Record<string, string> = {
    'hairdresser': 'Hair salon',
    'barber': 'Barbershop',
    'beauty': 'Beauty salon',
    'nail_salon': 'Nail salon',
    'nails': 'Nail salon',
    'spa': 'Spa',
    'sauna': 'Sauna',
    'hot_tub': 'Hot tub',
    'whirlpool': 'Whirlpool',
    'tanning_salon': 'Tanning salon',
    'tattoo': 'Tattoo shop',
    'tattoo_removal': 'Tattoo removal service',
    'piercing': 'Piercing studio',
    'electrologist': 'Electrology service',
  };
  
  return fallbacks[cat] || 'Personal care service';
}

/**
 * Derive POI display name with fallback logic
 */
function derivePoiName(poi: PoiRecord, tagsObj: Record<string, any>): string {
  // Priority 1: poi.name
  if (poi.name && poi.name.trim()) {
    return poi.name.trim();
  }
  
  // Priority 2: tags.name
  if (tagsObj.name && typeof tagsObj.name === 'string' && tagsObj.name.trim()) {
    return tagsObj.name.trim();
  }
  
  // Priority 3: tags.brand or tags.operator
  if (tagsObj.brand && typeof tagsObj.brand === 'string' && tagsObj.brand.trim()) {
    return tagsObj.brand.trim();
  }
  if (tagsObj.operator && typeof tagsObj.operator === 'string' && tagsObj.operator.trim()) {
    return tagsObj.operator.trim();
  }
  
  // Priority 4: Category-based fallback (with tags for context)
  return getCategoryFallback(poi.category, tagsObj);
}

/**
 * Normalize name for deduplication
 * - Lowercase
 * - Trim whitespace
 * - Remove repeated spaces
 */
function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Normalize address for deduplication
 * - Lowercase
 * - Trim
 * - Collapse spaces
 */
function normalizeAddress(address: string | null): string {
  if (!address) return '';
  return address.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ============================================================================
// POI PROCESSING
// ============================================================================

/**
 * Deduplicate POIs - keep nearest instance
 * Primary: osmId if present
 * Secondary: (category + normalizedName + normalizedAddress) if osmId missing
 * Special: Category-specific dedupe for public_bookcase (Little Free Library)
 */
function dedupePois(pois: PoiRecord[]): { deduped: PoiRecord[]; removedCount: number } {
  const originalCount = pois.length;
  
  // Primary key: osmId if present
  const byOsmId = new Map<number, PoiRecord>();
  // Secondary key: category + normalizedName + normalizedAddress
  const byCategoryNameAddress = new Map<string, PoiRecord>();

  for (const poi of pois) {
    const distanceFt = poi.distanceFt || Infinity;
    
    if (poi.osmId != null && Number.isFinite(poi.osmId)) {
      // Primary deduplication by osmId
      const existing = byOsmId.get(poi.osmId);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byOsmId.set(poi.osmId, poi);
      }
    } else {
      // Secondary deduplication by category + name + address
      const tagsObj = safeJsonParse(poi.tags);
      const category = (poi.category || '').toLowerCase().trim();
      const name = derivePoiName(poi, tagsObj);
      const normalizedName = normalizeName(name);
      const addressText = extractAddress(tagsObj);
      const normalizedAddress = normalizeAddress(addressText);
      
      const key = `${category}|${normalizedName}|${normalizedAddress}`;
      
      const existing = byCategoryNameAddress.get(key);
      if (!existing || (distanceFt < (existing.distanceFt || Infinity))) {
        byCategoryNameAddress.set(key, poi);
      }
    }
  }

  // Combine results, prioritizing osmId entries
  const result: PoiRecord[] = [];
  const seenSecondary = new Set<string>();

  for (const poi of byOsmId.values()) {
    result.push(poi);
  }

  for (const poi of byCategoryNameAddress.values()) {
    // Skip if we already have this via osmId
    if (poi.osmId != null && byOsmId.has(poi.osmId)) {
      continue;
    }
    
    const tagsObj = safeJsonParse(poi.tags);
    const category = (poi.category || '').toLowerCase().trim();
    const name = derivePoiName(poi, tagsObj);
    const normalizedName = normalizeName(name);
    const addressText = extractAddress(tagsObj);
    const normalizedAddress = normalizeAddress(addressText);
    const key = `${category}|${normalizedName}|${normalizedAddress}`;
    
    if (!seenSecondary.has(key)) {
      seenSecondary.add(key);
      result.push(poi);
    }
  }

  // Sort by distance ascending
  let sorted = result.sort((a, b) => {
    const distA = a.distanceFt || Infinity;
    const distB = b.distanceFt || Infinity;
    return distA - distB;
  });
  
  // No special category-specific dedupe needed for Personal Care & Beauty
  
  const removedCount = originalCount - sorted.length;
  return { deduped: sorted, removedCount };
}

/**
 * Prepare clean POI data with all computed fields
 */
function prepareCleanPois(pois: PoiRecord[]): CleanPoi[] {
  return pois.map(poi => {
    const tagsObj = safeJsonParse(poi.tags);
    const name = derivePoiName(poi, tagsObj);
    const distanceFt = poi.distanceFt || 0;
    const distanceText = formatDistance(distanceFt);
    const category = poi.category || 'other';
    const addressText = extractAddress(tagsObj);
    const { hoursText, phone, website } = normalizeContact(tagsObj);
    const { bucketKey, bucketLabel } = bucketize(category);

    return {
      name,
      distanceFt,
      distanceText,
      category,
      addressText,
      hoursText,
      phone,
      website,
      bucketKey,
      bucketLabel,
      osmId: poi.osmId ?? null,
      recordId: poi.id,
    };
  });
}

/**
 * Update names for bucket context (no special handling needed for Personal Care & Beauty)
 */
function updateNamesForBucketContext(items: CleanPoi[]): CleanPoi[] {
  // No special name updates needed for Personal Care & Beauty
  return items;
}

/**
 * Group POIs into highlight buckets
 * - Sort items within each bucket by distance
 * - Limit to MAX_ITEMS_PER_BUCKET per bucket
 * - Sort buckets by nearest item distance
 * - Limit total items to MAX_TOTAL_ITEMS
 */
function groupIntoBuckets(cleanPois: CleanPoi[]): { highlights: HighlightGroup[]; trimmedPois: CleanPoi[]; bucketCounts: Record<string, number>; bucketTypePhrases: Record<string, string> } {
  // Group by bucketKey
  const bucketMap = new Map<string, { label: string; typePhrase: string; items: CleanPoi[] }>();
  
  for (const poi of cleanPois) {
    if (!bucketMap.has(poi.bucketKey)) {
      const bucketInfo = bucketize(poi.category);
      bucketMap.set(poi.bucketKey, { label: poi.bucketLabel, typePhrase: bucketInfo.typePhrase, items: [] });
    }
    bucketMap.get(poi.bucketKey)!.items.push(poi);
  }
  
  // Sort items within each bucket by distance, limit to MAX_ITEMS_PER_BUCKET
  const buckets: Array<{ key: string; label: string; typePhrase: string; items: CleanPoi[]; nearestDist: number }> = [];
  
  for (const [key, { label, typePhrase, items }] of bucketMap.entries()) {
    const sorted = [...items].sort((a, b) => a.distanceFt - b.distanceFt);
    const limited = sorted.slice(0, MAX_ITEMS_PER_BUCKET);
    
    // Update names based on bucket context (for public_bookcase consistency)
    const updatedItems = updateNamesForBucketContext(limited);
    
    const nearestDist = updatedItems[0]?.distanceFt ?? Infinity;
    buckets.push({ key, label, typePhrase, items: updatedItems, nearestDist });
  }
  
  // Sort buckets by nearest item distance
  buckets.sort((a, b) => a.nearestDist - b.nearestDist);
  
  // Collect all items across buckets, respect MAX_TOTAL_ITEMS
  let totalItems = 0;
  const finalBuckets: HighlightGroup[] = [];
  const trimmedPois: CleanPoi[] = [];
  const bucketCounts: Record<string, number> = {};
  const bucketTypePhrases: Record<string, string> = {};
  
  for (const bucket of buckets) {
    const remainingSlots = MAX_TOTAL_ITEMS - totalItems;
    if (remainingSlots <= 0) break;
    
    const itemsToInclude = bucket.items.slice(0, remainingSlots);
    totalItems += itemsToInclude.length;
    
    // Track bucket counts and type phrases
    bucketCounts[bucket.key] = itemsToInclude.length;
    bucketTypePhrases[bucket.key] = bucket.typePhrase;
    
    // Add to trimmedPois for extras computation
    trimmedPois.push(...itemsToInclude);
    
    // Convert to HighlightGroup format
    finalBuckets.push({
      label: bucket.label,
      items: itemsToInclude.map(poi => ({
        name: poi.name,
        distanceText: poi.distanceText,
        category: poi.category,
        addressText: poi.addressText,
        hoursText: poi.hoursText,
        phone: poi.phone,
        website: poi.website,
        osmId: poi.osmId ?? undefined,
        recordId: poi.recordId,
      })),
    });
  }
  
  return { highlights: finalBuckets, trimmedPois, bucketCounts, bucketTypePhrases };
}

/**
 * Format distance in feet (for range text)
 * Round to nearest 50 ft for less precise look
 */
function formatDistanceFeet(distanceFt: number): string {
  const rounded = Math.round(distanceFt / 50) * 50;
  return `~${rounded} ft`;
}

/**
 * Format distance in miles (for range text)
 */
function formatDistanceMiles(distanceFt: number): string {
  const miles = distanceFt / 5280;
  const roundedMiles = Math.round(miles * 10) / 10;
  return `~${roundedMiles} mi`;
}

/**
 * Compute extras for summary generation
 */
function computeExtras(trimmedPois: CleanPoi[], bucketCounts: Record<string, number>, bucketTypePhrases: Record<string, string>, highlights: HighlightGroup[]): ProcessExtras {
  const sorted = [...trimmedPois].sort((a, b) => a.distanceFt - b.distanceFt);
  const poiCount = sorted.length;
  const nearestDistanceText = sorted[0]?.distanceText || '';
  const farthestDistanceText = sorted[sorted.length - 1]?.distanceText || '';
  const nearestDistanceFt = sorted[0]?.distanceFt || 0;
  const farthestDistanceFt = sorted[sorted.length - 1]?.distanceFt || 0;
  
  // Find closest bucket key (first bucket in highlights is closest)
  const closestBucketKey = highlights.length > 0 ? sorted[0]?.bucketKey || '' : '';
  
  // Check contact details across all items
  const hasWebsite = trimmedPois.some(p => p.website);
  const hasPhone = trimmedPois.some(p => p.phone);
  const hasHours = trimmedPois.some(p => p.hoursText);
  
  // Range text only if poiCount >= 2
  // Use consistent units: feet if farthest < 5280, else miles
  let rangeText = '';
  let closestSummaryDistanceText = '';
  
  if (poiCount >= 2) {
    if (farthestDistanceFt < 5280) {
      // Both in feet
      const nearestFeet = formatDistanceFeet(nearestDistanceFt);
      const farthestFeet = formatDistanceFeet(farthestDistanceFt);
      rangeText = `(${nearestFeet} to ${farthestFeet})`;
      closestSummaryDistanceText = nearestFeet;
    } else {
      // Both in miles
      const nearestMiles = formatDistanceMiles(nearestDistanceFt);
      const farthestMiles = formatDistanceMiles(farthestDistanceFt);
      rangeText = `(${nearestMiles} to ${farthestMiles})`;
      closestSummaryDistanceText = nearestMiles;
    }
  } else {
    // Single POI - use same unit logic
    if (nearestDistanceFt < 1056) {
      closestSummaryDistanceText = formatDistanceFeet(nearestDistanceFt);
    } else {
      closestSummaryDistanceText = formatDistanceMiles(nearestDistanceFt);
    }
  }
  
  return { 
    poiCount, 
    nearestDistanceText, 
    farthestDistanceText, 
    rangeText, 
    closestSummaryDistanceText,
    bucketCounts, 
    bucketTypePhrases,
    closestBucketKey,
    hasWebsite,
    hasPhone,
    hasHours
  };
}

/**
 * Simple hash function for deterministic variation based on buffetId
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get variation phrase for "includes" sentence (deterministic based on buffetId)
 * Uses: "Includes" or "Nearby options include" (not "Lists")
 */
function getBucketTypesSentence(
  bucketKeys: string[], 
  bucketTypePhrases: Record<string, string>, 
  bucketCounts: Record<string, number>,
  poiCount: number,
  buffetId: string
): string {
  if (bucketKeys.length !== 2) return '';
  
  const typeA = bucketTypePhrases[bucketKeys[0]] || 'personal care & beauty services';
  const typeB = bucketTypePhrases[bucketKeys[1]] || 'personal care & beauty services';
  const countA = bucketCounts[bucketKeys[0]] || 0;
  const countB = bucketCounts[bucketKeys[1]] || 0;
  
  // Pick one of 2 phrasings based on hash
  const hash = simpleHash(buffetId);
  const variant = hash % 2;
  
  // If poiCount >= 3, include counts
  if (poiCount >= 3) {
    const countPhraseA = countA === 1 ? typeA : `${countA} ${typeA}`;
    const countPhraseB = countB === 1 ? typeB : `${countB} ${typeB}`;
    
    if (variant === 0) {
      return `Includes ${countPhraseA} and ${countPhraseB}.`;
    } else {
      return `Nearby options include ${countPhraseA} and ${countPhraseB}.`;
    }
  } else {
    // Simpler sentence for poiCount < 3
    if (variant === 0) {
      return `Includes ${typeA} and ${typeB}.`;
    } else {
      return `Nearby options include ${typeA} and ${typeB}.`;
    }
  }
}

/**
 * Build deterministic summary using templates with code-provided facts
 * MAX 2 sentences: Sentence 1 (always) + Sentence 2 (optional, choose at most one)
 */
function buildSummary(extras: ProcessExtras, trimmedPois: CleanPoi[], buffetId: string): string {
  const { 
    poiCount, 
    rangeText, 
    closestSummaryDistanceText,
    bucketCounts, 
    bucketTypePhrases,
    closestBucketKey,
    hasWebsite,
    hasPhone,
    hasHours
  } = extras;
  
  // Sentence 1: Always present
  const venueWord = poiCount === 1 ? 'service' : 'services';
  // Single-item: remove "about" hedge
  if (poiCount === 1) {
    const sentence1 = `1 personal care & beauty service is listed ${closestSummaryDistanceText} from the buffet.`;
    
    // Sentence 2: Contact sentence for single item
    let sentence2 = '';
    if (hasHours) {
      sentence2 = 'Hours may vary.';
    } else if (hasWebsite && hasPhone) {
      sentence2 = 'Website and phone details are available.';
    } else if (hasWebsite) {
      sentence2 = 'A website link is available.';
    } else if (hasPhone) {
      sentence2 = 'A phone number is available.';
    }
    // If no contact info and no hours, omit sentence2
    
    return sentence2 ? `${sentence1} ${sentence2}` : sentence1;
  }
  
  // Multiple POIs
  const sentence1 = `${poiCount} personal care & beauty services are listed ${rangeText}, with the closest at ${closestSummaryDistanceText}.`;
  
  // Sentence 2: Choose AT MOST ONE option
  let sentence2 = '';
  const bucketKeys = Object.keys(bucketCounts);
  
  // Option 1: Bucket types sentence (only when exactly 2 buckets, for multi-item)
  if (bucketKeys.length === 2) {
    sentence2 = getBucketTypesSentence(bucketKeys, bucketTypePhrases, bucketCounts, poiCount, buffetId);
  }
  
  // No intent hooks for Personal Care & Beauty
  
  // Combine sentences
  return sentence2 ? `${sentence1} ${sentence2}` : sentence1;
}

/**
 * Validate output structure
 */
function validateOutput(output: PersonalCareBeautyOutput, extras: ProcessExtras): { valid: boolean; error?: string } {
  // Check required keys
  if (!output.summary || typeof output.summary !== 'string') {
    return { valid: false, error: 'Missing or invalid summary' };
  }
  
  if (!Array.isArray(output.highlights) || output.highlights.length === 0) {
    return { valid: false, error: 'Missing or empty highlights' };
  }
  
  if (typeof output.poiCount !== 'number' || output.poiCount !== extras.poiCount) {
    return { valid: false, error: `poiCount mismatch: expected ${extras.poiCount}, got ${output.poiCount}` };
  }
  
  if (!output.generatedAt || typeof output.generatedAt !== 'string') {
    return { valid: false, error: 'Missing or invalid generatedAt' };
  }
  
  if (output.model !== 'deterministic') {
    return { valid: false, error: `Invalid model: expected 'deterministic', got '${output.model}'` };
  }
  
  // Validate each highlight group
  for (const group of output.highlights) {
    if (!group.label || typeof group.label !== 'string') {
      return { valid: false, error: 'Highlight group missing label' };
    }
    
    if (!Array.isArray(group.items) || group.items.length === 0) {
      return { valid: false, error: `Highlight group "${group.label}" has no items` };
    }
    
    for (const item of group.items) {
      if (!item.name || typeof item.name !== 'string') {
        return { valid: false, error: 'Highlight item missing name' };
      }
      if (!item.distanceText || typeof item.distanceText !== 'string') {
        return { valid: false, error: 'Highlight item missing distanceText' };
      }
      if (!item.category || typeof item.category !== 'string') {
        return { valid: false, error: 'Highlight item missing category' };
      }
    }
  }
  
  return { valid: true };
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processBuffet(
  buffet: BuffetRecord,
  checkpoint: Checkpoint,
  db: any,
  options: { dryRun: boolean; resume: boolean; force: boolean }
): Promise<{ status: string; output?: PersonalCareBeautyOutput; poiCount?: number; removedCount?: number }> {
  const buffetId = buffet.id;
  
  // Skip if already in checkpoint (resume mode)
  if (options.resume && checkpoint[buffetId]) {
    const existing = checkpoint[buffetId];
    if (existing.status === 'generated' || existing.status === 'skipped_existing') {
      return { 
        status: existing.status,
        poiCount: existing.poiCount
      };
    }
    // Re-process skipped_no_pois or error to check with updated logic
  }
  
  // Skip if personalCareBeauty already exists (unless force)
  if (!options.force && buffet.personalCareBeauty && buffet.personalCareBeauty.trim().length > 0) {
    checkpoint[buffetId] = {
      status: 'skipped_existing',
      timestamp: Date.now()
    };
    return { status: 'skipped_existing' };
  }
  
  // Get POIs and filter by group
  const poiRecords = buffet.poiRecords || [];
  const filteredPOIs = poiRecords.filter((poi: PoiRecord) => {
    if (!poi.group) return false;
    const normalizedGroup = poi.group.trim();
    return normalizedGroup === TARGET_GROUP;
  });

  // If no eligible POIs => SKIP (do not write anything)
  if (filteredPOIs.length === 0) {
    checkpoint[buffetId] = {
      status: 'skipped_no_pois',
      timestamp: Date.now()
    };
    return { status: 'skipped_no_pois' };
  }

  // Dedupe POIs (keep closest for same osmId or category+name+address)
  const { deduped: dedupedPOIs, removedCount } = dedupePois(filteredPOIs);
  
  // Prepare clean data
  const cleanPois = prepareCleanPois(dedupedPOIs);
  
  // Group into buckets and trim
  const { highlights, trimmedPois, bucketCounts, bucketTypePhrases } = groupIntoBuckets(cleanPois);
  
  // Compute extras (pass highlights to find closest bucket)
  const extras = computeExtras(trimmedPois, bucketCounts, bucketTypePhrases, highlights);
  
  // Build summary using templates
  const summary = buildSummary(extras, trimmedPois, buffetId);
  
  // Log deduplication stats (for debugging)
  if (removedCount > 0) {
    console.log(`  [${buffet.name || buffetId}] Removed ${removedCount} duplicate POI(s) via deduplication`);
  }
  
  // Assemble output
  const output: PersonalCareBeautyOutput = {
    summary,
    highlights,
    poiCount: extras.poiCount,
    generatedAt: new Date().toISOString(),
    model: 'deterministic',
  };
  
  // Validate output
  const validation = validateOutput(output, extras);
  if (!validation.valid) {
    checkpoint[buffetId] = {
      status: 'error',
      timestamp: Date.now(),
      errorMessage: validation.error
    };
    throw new Error(`Validation failed: ${validation.error}`);
  }
  
  // Write to database if not dry run
  if (!options.dryRun) {
    const jsonString = JSON.stringify(output);
    await db.transact([db.tx.buffets[buffetId].update({ personalCareBeauty: jsonString })]);
  }
  
  checkpoint[buffetId] = {
    status: 'generated',
    timestamp: Date.now(),
    poiCount: extras.poiCount
  };
  
  return { 
    status: 'generated', 
    output, 
    poiCount: extras.poiCount,
    removedCount
  };
}

function printBuffetOutput(
  buffet: BuffetRecord,
  result: { 
    status: string; 
    output?: PersonalCareBeautyOutput;
    poiCount?: number;
    removedCount?: number;
  }
) {
  const buffetId = buffet.id;
  const buffetName = buffet.name || buffetId;
  
  console.log('='.repeat(80));
  console.log(`BUFFET: ${buffetName}`);
  console.log(`ID: ${buffetId}`);
  
  if (result.status === 'generated') {
    console.log(`STATUS: GENERATED`);
    console.log(`POI COUNT: ${result.poiCount || 0}`);
    if (result.removedCount && result.removedCount > 0) {
      console.log(`DUPLICATES REMOVED: ${result.removedCount}`);
    }
    console.log('-'.repeat(80));
    if (result.output) {
      console.log('OUTPUT:');
      console.log(JSON.stringify(result.output, null, 2));
    }
  } else if (result.status === 'skipped_existing') {
    console.log(`STATUS: SKIPPED_EXISTING (personalCareBeauty already present)`);
  } else if (result.status === 'skipped_no_pois') {
    console.log(`STATUS: SKIPPED_NO_POIS (no eligible POIs in "${TARGET_GROUP}")`);
  }
  
  console.log('='.repeat(80));
  console.log('');
}

// ============================================================================
// CLI & MAIN
// ============================================================================

async function main() {
  const argv = process.argv.slice(2);
  
  const hasFlag = (flag: string) => {
    return argv.includes(flag) || argv.includes(flag.replace(/([A-Z])/g, '-$1').toLowerCase());
  };
  
  const getFlagValue = (flag: string, defaultValue: string | number): string | number => {
    // Support "--flag=value" style
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

    // Support "--flag value" style
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
  const dryRun = hasFlag('--dry-run') || hasFlag('--dryRun');
  const resume = hasFlag('--resume');
  const force = hasFlag('--force');
  const buffetId = getFlagValue('--buffetId', '') as string;

  // Validate environment
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('ERROR: INSTANT_ADMIN_TOKEN is not set in .env.local');
    process.exit(1);
  }

  // Initialize database
  const db = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
    schema: schema.default || schema,
  });

  // Print header
  console.log('='.repeat(80));
  console.log('SEO Personal Care & Beauty Description Generator (Deterministic)');
  console.log('='.repeat(80));
  console.log(`Target group: ${TARGET_GROUP}`);
  console.log(`Output field: buffets.personalCareBeauty`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Limit: ${limit === 0 ? 'unlimited' : limit}`);
  console.log(`Dry run: ${dryRun ? 'YES (no database writes)' : 'NO (will save to database)'}`);
  console.log(`Resume: ${resume ? 'YES' : 'NO'}`);
  console.log(`Force: ${force ? 'YES (overwrite existing)' : 'NO'}`);
  if (buffetId) {
    console.log(`Single buffet: ${buffetId}`);
  }
  console.log('');

  const checkpoint = resume ? loadCheckpoint() : {};
  const limiter = pLimit(concurrency);
  
  let scanned = 0;
  let generated = 0;
  let skippedExisting = 0;
  let skippedNoPois = 0;
  let failed = 0;
  const startTime = Date.now();

  // Single buffet mode
  if (buffetId) {
    try {
      const result = await db.query({
        buffets: {
          $: {
            where: { id: buffetId },
            limit: 1,
          },
          poiRecords: {
            $: {
              where: { group: TARGET_GROUP },
            },
          },
        },
      });
      
      const buffets = (result.buffets || []) as BuffetRecord[];
      if (buffets.length === 0) {
        console.error(`ERROR: Buffet with id "${buffetId}" not found`);
        process.exit(1);
      }
      
      const buffet = buffets[0];
      scanned = 1;
      
      try {
        const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume, force });
        
        if (result.status === 'generated') {
          generated++;
        } else if (result.status === 'skipped_existing') {
          skippedExisting++;
        } else if (result.status === 'skipped_no_pois') {
          skippedNoPois++;
        }
        
        printBuffetOutput(buffet, result);
      } catch (error: any) {
        failed++;
        console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
      }
    } catch (error: any) {
      console.error(`[FATAL ERROR] ${error?.message || error}`);
      process.exit(1);
    }
  } else {
    // Batch processing mode
    const batchSize = 100;
    let offset = 0;
    let processed = 0;
    let scheduled = 0;
    const maxScans = limit > 0 ? limit * 50 : Infinity;
    
    while (true) {
      // Stop once we've generated enough items
      if (limit > 0 && generated >= limit) {
        break;
      }
      
      // Stop if we've scanned too many buffets
      if (limit > 0 && scanned >= maxScans) {
        console.log(`\nStopping after scanning ${scanned} buffets (generated: ${generated}, target: ${limit})`);
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
      
      // Filter buffets that need processing
      const toProcess: BuffetRecord[] = [];
      
      for (const buffet of buffets) {
        // Stop scheduling if we've generated enough
        if (limit > 0 && generated >= limit) {
          break;
        }
        
        // Skip if already in checkpoint (resume mode)
        if (resume && checkpoint[buffet.id]) {
          const existing = checkpoint[buffet.id];
          if (existing.status === 'generated' || existing.status === 'skipped_existing') {
            continue;
          }
        }
        
        // Skip if already has personalCareBeauty (unless force)
        if (!force && buffet.personalCareBeauty && buffet.personalCareBeauty.trim().length > 0) {
          checkpoint[buffet.id] = {
            status: 'skipped_existing',
            timestamp: Date.now()
          };
          skippedExisting++;
          if (dryRun && skippedExisting <= 3) {
            printBuffetOutput(buffet, { status: 'skipped_existing' });
          }
          continue;
        }
        
        // Check for eligible POIs
        const pois = buffet.poiRecords || [];
        const hasEligiblePOIs = pois.some((p: PoiRecord) => {
          if (!p.group) return false;
          return p.group.trim() === TARGET_GROUP;
        });
        
        if (!hasEligiblePOIs) {
          checkpoint[buffet.id] = {
            status: 'skipped_no_pois',
            timestamp: Date.now()
          };
          skippedNoPois++;
          if (dryRun && skippedNoPois <= 3) {
            printBuffetOutput(buffet, { status: 'skipped_no_pois' });
          }
          continue;
        }
        
        toProcess.push(buffet);
        scheduled++;
      }
      
      // If no items to process, check if we should continue
      if (toProcess.length === 0) {
        if (limit > 0 && generated >= limit) break;
        if (buffets.length < batchSize) break;
        if (limit > 0 && scanned >= maxScans) break;
        offset += batchSize;
        continue;
      }
      
      // Process with concurrency
      const promises = toProcess.map(buffet =>
        limiter(async () => {
          // Safety check
          if (limit > 0 && generated >= limit) {
            return;
          }
          
          try {
            const result = await processBuffet(buffet, checkpoint, db, { dryRun, resume, force });
            
            if (result.status === 'generated') {
              generated++;
              // Print output in dry-run mode or for first few items
              if (dryRun || generated <= 5) {
                printBuffetOutput(buffet, result);
              }
            }
            
            processed++;
            
            // Progress reporting every 10 items
            if (processed % 10 === 0) {
              const elapsed = (Date.now() - startTime) / 1000;
              const rate = processed / elapsed;
              const remaining = limit > 0 ? limit - generated : null;
              const eta = remaining && rate > 0 ? Math.round(remaining / rate) : null;
              
              let msg = `[PROGRESS] Processed: ${processed} | Generated: ${generated} | Skipped: ${skippedExisting + skippedNoPois} | Failed: ${failed}`;
              if (limit > 0) {
                const pct = ((generated / limit) * 100).toFixed(1);
                msg += ` | ${pct}% complete`;
              }
              msg += ` | Rate: ${rate.toFixed(1)}/s`;
              if (eta !== null) {
                msg += ` | ETA: ${Math.floor(eta / 60)}m ${eta % 60}s`;
              }
              console.log(msg);
            }
            
            // Save checkpoint periodically
            if (!dryRun && processed % 10 === 0) {
              saveCheckpoint(checkpoint);
            }
          } catch (error: any) {
            failed++;
            checkpoint[buffet.id] = {
              status: 'error',
              timestamp: Date.now(),
              errorMessage: error?.message || String(error)
            };
            console.error(`[ERROR] ${buffet.name || buffet.id}: ${error?.message || error}`);
            processed++;
          }
        })
      );
      
      await Promise.all(promises);
      
      // Break if we've reached the generated limit
      if (limit > 0 && generated >= limit) {
        break;
      }
      
      if (buffets.length < batchSize) break;
      offset += batchSize;
    }
  }
  
  // Final checkpoint save
  if (!dryRun) {
    saveCheckpoint(checkpoint);
  }
  
  const durationSec = (Date.now() - startTime) / 1000;
  const durationMin = (durationSec / 60).toFixed(1);
  const rate = scanned > 0 ? (scanned / durationSec).toFixed(2) : '0.00';
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('FINAL SUMMARY');
  console.log('-'.repeat(80));
  console.log(`Buffets scanned: ${scanned}`);
  console.log(`Generated: ${generated}`);
  console.log(`Skipped (existing): ${skippedExisting}`);
  console.log(`Skipped (no eligible POIs): ${skippedNoPois}`);
  console.log(`Failed: ${failed}`);
  console.log(`Duration: ${durationMin} minutes (${durationSec.toFixed(0)}s)`);
  console.log(`Rate: ${rate} buffets/second`);
  if (generated > 0 && !dryRun) {
    console.log(`✓ All ${generated} descriptions saved to database`);
  }
  console.log('='.repeat(80));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
