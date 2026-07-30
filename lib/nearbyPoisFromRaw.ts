/**
 * Nearby-POI shape adapter.
 *
 * Chinese buffets store each nearby-POI category (foodDining, retailShopping, …)
 * as an *enriched* object: { summary, highlights: [{ label, items }], poiCount }.
 * That shape is what <NearbyHighlights> / POIBundle render.
 *
 * Indian buffets were enriched by scripts/enrich-indian-pois.js, which only wrote
 * the *raw* Overpass POI arrays (from the `overpassPOIs` field) into those same
 * per-category fields — e.g. foodDining = [{ osmId, name, category, distanceFt,
 * tags, … }, …]. The page's `safeParseJsonObject` drops arrays, so those sections
 * never rendered.
 *
 * `coercePoiSection` bridges the two: it passes already-enriched objects through
 * unchanged and converts raw Overpass arrays into the enriched `{ highlights }`
 * shape deterministically (no LLM), pulling address / hours / phone / website out
 * of the OSM tags. This lets Indian pages render nearby places exactly like
 * Chinese ones with no data migration.
 */

/** Per-category fields that render as POI sections (object-shaped on Chinese).
 *  Excludes the HTML-rendered categories (accommodationLodging, agriculturalFarming,
 *  educationLearning, petCareVeterinary, repairMaintenance). */
export const POI_SECTION_KEYS = [
  'artsCulture',
  'communicationsTechnology',
  'financialServices',
  'foodDining',
  'governmentPublicServices',
  'healthcareMedicalServices',
  'homeImprovementGarden',
  'industrialManufacturing',
  'miscellaneousServices',
  'personalCareBeauty',
  'professionalBusinessServices',
  'recreationEntertainment',
  'religiousSpiritual',
  'retailShopping',
  'socialCommunityServices',
  'sportsFitness',
  'transportationAutomotive',
  'travelTourismServices',
  'utilitiesInfrastructure',
] as const;

interface RawPoi {
  osmId?: number;
  name?: string | null;
  category?: string;
  group?: string;
  distance?: number;
  distanceFt?: number;
  tags?: Record<string, string>;
}

interface PoiItem {
  name?: string;
  category?: string;
  distanceText?: string;
  distanceFt?: number;
  addressText?: string;
  hoursText?: string;
  phone?: string;
  website?: string;
  osmId?: number;
}

interface PoiGroup {
  label: string;
  items: PoiItem[];
}

export interface PoiSection {
  summary?: string;
  highlights: PoiGroup[];
  poiCount: number;
}

const MAX_ITEMS_PER_GROUP = 8;
const MAX_GROUPS = 10;

/** "restaurant" -> "Restaurants", "place_of_worship" -> "Places Of Worship" */
function labelForCategory(category?: string): string {
  if (!category) return 'Places';
  const words = category
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (!words) return 'Places';
  return words.endsWith('s') ? words : `${words}s`;
}

function distanceText(distanceFt?: number): string | undefined {
  if (distanceFt == null || !Number.isFinite(distanceFt)) return undefined;
  const miles = distanceFt / 5280;
  return miles >= 0.1 ? `~${miles.toFixed(1)} mi` : `~${Math.round(distanceFt)} ft`;
}

function itemFromRaw(poi: RawPoi): PoiItem {
  const tags = poi.tags || {};
  const address = [tags['addr:housenumber'], tags['addr:street']]
    .filter(Boolean)
    .join(' ')
    .trim();
  return {
    name: poi.name || tags['name'] || undefined,
    category: poi.category,
    distanceText: distanceText(poi.distanceFt),
    distanceFt: poi.distanceFt,
    addressText: address || undefined,
    hoursText: tags['opening_hours'] || undefined,
    phone: tags['phone'] || tags['contact:phone'] || undefined,
    website: tags['website'] || tags['contact:website'] || undefined,
    osmId: poi.osmId,
  };
}

/**
 * Normalize a stored per-category POI value into the enriched section shape the
 * UI renders, or null when there is nothing to show.
 * - Enriched object ({ highlights }) is returned as-is.
 * - Raw Overpass array is grouped by category into highlights.
 * - HTML strings / empty / unparseable values return null.
 */
export function coercePoiSection(rawValue: unknown): PoiSection | null {
  if (rawValue == null) return null;

  let parsed: unknown = rawValue;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    if (!trimmed || trimmed.startsWith('<')) return null; // empty or HTML
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  // Already-enriched object shape — pass through unchanged.
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as { highlights?: unknown };
    return Array.isArray(obj.highlights) ? (parsed as PoiSection) : null;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return null;

  // Raw Overpass array (already distance-sorted by the enrich script). Group by
  // category label, keeping only named POIs and capping group / item counts.
  const byLabel = new Map<string, PoiItem[]>();
  for (const raw of parsed as RawPoi[]) {
    const item = itemFromRaw(raw);
    if (!item.name) continue;
    const label = labelForCategory(raw.category);
    let items = byLabel.get(label);
    if (!items) {
      if (byLabel.size >= MAX_GROUPS) continue;
      items = [];
      byLabel.set(label, items);
    }
    if (items.length < MAX_ITEMS_PER_GROUP) items.push(item);
  }

  const highlights: PoiGroup[] = [];
  let poiCount = 0;
  for (const [label, items] of byLabel) {
    if (items.length === 0) continue;
    highlights.push({ label, items });
    poiCount += items.length;
  }

  if (highlights.length === 0) return null;
  return { highlights, poiCount };
}
