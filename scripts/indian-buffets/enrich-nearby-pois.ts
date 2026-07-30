import fs from 'fs';
import path from 'path';

type PoiSectionKey =
  | 'accommodationLodging'
  | 'artsCulture'
  | 'communicationsTechnology'
  | 'educationLearning'
  | 'financialServices'
  | 'foodDining'
  | 'governmentPublicServices'
  | 'healthcareMedicalServices'
  | 'homeImprovementGarden'
  | 'miscellaneousServices'
  | 'personalCareBeauty'
  | 'petCareVeterinary'
  | 'professionalBusinessServices'
  | 'recreationEntertainment'
  | 'religiousSpiritual'
  | 'repairMaintenance'
  | 'retailShopping'
  | 'sportsFitness'
  | 'transportationAutomotive'
  | 'travelTourismServices'
  | 'utilitiesInfrastructure';

interface DraftBundle {
  candidateKey: string;
  buffet: Record<string, unknown>;
  structuredDataDrafts: unknown[];
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface NearbyPoi {
  id: number;
  type: string;
  name?: string;
  category?: string;
  group: PoiSectionKey;
  groupLabel: string;
  distance: number;
  distanceFt: number;
  distanceText: string;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

const SECTION_LABELS: Record<PoiSectionKey, string> = {
  accommodationLodging: 'Accommodation & Lodging',
  artsCulture: 'Arts & Culture',
  communicationsTechnology: 'Communications & Technology',
  educationLearning: 'Education & Learning',
  financialServices: 'Financial Services',
  foodDining: 'Food & Dining',
  governmentPublicServices: 'Government & Public Services',
  healthcareMedicalServices: 'Healthcare & Medical',
  homeImprovementGarden: 'Home & Garden',
  miscellaneousServices: 'Miscellaneous Services',
  personalCareBeauty: 'Personal Care & Beauty',
  petCareVeterinary: 'Pet Care & Veterinary',
  professionalBusinessServices: 'Professional Services',
  recreationEntertainment: 'Recreation & Entertainment',
  religiousSpiritual: 'Religious & Spiritual',
  repairMaintenance: 'Repair & Maintenance',
  retailShopping: 'Retail & Shopping',
  sportsFitness: 'Sports & Fitness',
  transportationAutomotive: 'Transportation & Automotive',
  travelTourismServices: 'Travel & Tourism',
  utilitiesInfrastructure: 'Utilities & Infrastructure',
};

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

function formatDistance(distanceFt: number): string {
  if (distanceFt < 1056) return `~${Math.round(distanceFt / 10) * 10} ft`;
  return `~${Math.round((distanceFt / 5280) * 10) / 10} mi`;
}

function getPoiCategory(tags: Record<string, string>): string | undefined {
  return tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.office || tags.public_transport || tags.healthcare || tags.craft;
}

function classifyPoi(tags: Record<string, string>): { group: PoiSectionKey; label: string } | null {
  const amenity = tags.amenity;
  const shop = tags.shop;
  const tourism = tags.tourism;
  const leisure = tags.leisure;
  const office = tags.office;
  const publicTransport = tags.public_transport;
  const healthcare = tags.healthcare;
  const craft = tags.craft;

  if (['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'food_court', 'ice_cream'].includes(amenity || '')) {
    return { group: 'foodDining', label: 'Restaurants, cafes, and bars' };
  }
  if (shop) {
    if (['car', 'car_repair', 'car_parts', 'tyres', 'bicycle'].includes(shop)) {
      return { group: 'transportationAutomotive', label: 'Automotive and bicycle services' };
    }
    if (['hairdresser', 'beauty', 'massage', 'cosmetics'].includes(shop)) {
      return { group: 'personalCareBeauty', label: 'Personal care and beauty' };
    }
    if (['doityourself', 'hardware', 'garden_centre', 'furniture'].includes(shop)) {
      return { group: 'homeImprovementGarden', label: 'Home and garden stores' };
    }
    if (['pet', 'pet_grooming'].includes(shop)) {
      return { group: 'petCareVeterinary', label: 'Pet care' };
    }
    return { group: 'retailShopping', label: 'Shops and retail' };
  }
  if (['parking', 'parking_space', 'bicycle_parking', 'fuel', 'charging_station', 'car_rental', 'car_sharing', 'taxi', 'bus_station'].includes(amenity || '') || publicTransport) {
    return { group: 'transportationAutomotive', label: 'Parking and transportation' };
  }
  if (['hotel', 'motel', 'hostel', 'guest_house', 'apartment'].includes(tourism || '')) {
    return { group: 'accommodationLodging', label: 'Hotels and lodging' };
  }
  if (['museum', 'gallery', 'artwork'].includes(tourism || '') || ['arts_centre', 'theatre', 'cinema'].includes(amenity || '')) {
    return { group: 'artsCulture', label: 'Arts and culture' };
  }
  if (['attraction', 'viewpoint', 'zoo', 'aquarium'].includes(tourism || '') || ['park', 'playground'].includes(leisure || '')) {
    return { group: 'recreationEntertainment', label: 'Attractions and recreation' };
  }
  if (['bank', 'atm', 'bureau_de_change'].includes(amenity || '')) {
    return { group: 'financialServices', label: 'Banks and ATMs' };
  }
  if (['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'].includes(amenity || '') || healthcare) {
    return { group: 'healthcareMedicalServices', label: 'Healthcare nearby' };
  }
  if (['school', 'college', 'university', 'kindergarten', 'library'].includes(amenity || '')) {
    return { group: 'educationLearning', label: 'Education and libraries' };
  }
  if (['place_of_worship'].includes(amenity || '')) {
    return { group: 'religiousSpiritual', label: 'Religious and spiritual places' };
  }
  if (['police', 'fire_station', 'townhall', 'courthouse', 'post_office'].includes(amenity || '')) {
    return { group: 'governmentPublicServices', label: 'Government and public services' };
  }
  if (['fitness_centre', 'sports_centre', 'swimming_pool'].includes(leisure || '')) {
    return { group: 'sportsFitness', label: 'Sports and fitness' };
  }
  if (['veterinary'].includes(amenity || '')) {
    return { group: 'petCareVeterinary', label: 'Veterinary services' };
  }
  if (office) {
    return { group: 'professionalBusinessServices', label: 'Professional services' };
  }
  if (['telephone', 'internet_cafe'].includes(amenity || '')) {
    return { group: 'communicationsTechnology', label: 'Communications and technology' };
  }
  if (['toilets', 'drinking_water', 'bench'].includes(amenity || '')) {
    return { group: 'miscellaneousServices', label: 'Public amenities' };
  }
  if (['travel_agency'].includes(shop || '') || ['information'].includes(tourism || '')) {
    return { group: 'travelTourismServices', label: 'Travel and tourism services' };
  }
  if (['waste_basket', 'recycling'].includes(amenity || '')) {
    return { group: 'utilitiesInfrastructure', label: 'Utilities and infrastructure' };
  }
  if (craft) {
    return { group: 'repairMaintenance', label: 'Repair and maintenance' };
  }
  return null;
}

function buildOverpassQuery(bbox: string): string {
  return `
    [out:json][timeout:60];
    (
      node["amenity"](${bbox});
      way["amenity"](${bbox});
      relation["amenity"](${bbox});
      node["shop"](${bbox});
      way["shop"](${bbox});
      relation["shop"](${bbox});
      node["tourism"](${bbox});
      way["tourism"](${bbox});
      relation["tourism"](${bbox});
      node["leisure"](${bbox});
      way["leisure"](${bbox});
      relation["leisure"](${bbox});
      node["office"](${bbox});
      way["office"](${bbox});
      relation["office"](${bbox});
      node["public_transport"](${bbox});
      way["public_transport"](${bbox});
      relation["public_transport"](${bbox});
      node["healthcare"](${bbox});
      way["healthcare"](${bbox});
      relation["healthcare"](${bbox});
    );
    out center tags;
  `;
}

async function fetchPois(bbox: string, endpoint: string): Promise<OverpassElement[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'BuffetLocator Indian POI parity enrichment',
    },
    body: new URLSearchParams({ data: buildOverpassQuery(bbox) }),
  });
  if (!response.ok) throw new Error(`Overpass POI request failed: ${response.status} ${response.statusText}`);
  const data = await response.json() as { elements?: OverpassElement[] };
  return data.elements || [];
}

function buildBbox(bundles: DraftBundle[], radiusMeters: number): string {
  const coords = bundles
    .map((bundle) => ({
      lat: Number(bundle.buffet.lat),
      lng: Number(bundle.buffet.lng),
    }))
    .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng));
  const padLat = radiusMeters / 111320;
  const avgLat = coords.reduce((sum, coord) => sum + coord.lat, 0) / coords.length;
  const padLng = radiusMeters / (111320 * Math.cos(toRad(avgLat)));
  const minLat = Math.min(...coords.map((coord) => coord.lat)) - padLat;
  const maxLat = Math.max(...coords.map((coord) => coord.lat)) + padLat;
  const minLng = Math.min(...coords.map((coord) => coord.lng)) - padLng;
  const maxLng = Math.max(...coords.map((coord) => coord.lng)) + padLng;
  return `${minLat.toFixed(6)},${minLng.toFixed(6)},${maxLat.toFixed(6)},${maxLng.toFixed(6)}`;
}

function elementToPoi(element: OverpassElement): Omit<NearbyPoi, 'distance' | 'distanceFt' | 'distanceText'> | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const tags = element.tags || {};
  if (!lat || !lon || !tags.name) return null;
  const classification = classifyPoi(tags);
  if (!classification) return null;
  return {
    id: element.id,
    type: element.type,
    name: tags.name,
    category: getPoiCategory(tags),
    group: classification.group,
    groupLabel: classification.label,
    lat,
    lon,
    tags,
  };
}

function buildPoiSection(sectionKey: PoiSectionKey, pois: NearbyPoi[]): string | undefined {
  const grouped = new Map<string, NearbyPoi[]>();
  for (const poi of pois.filter((item) => item.group === sectionKey).slice(0, 25)) {
    if (!grouped.has(poi.groupLabel)) grouped.set(poi.groupLabel, []);
    grouped.get(poi.groupLabel)?.push(poi);
  }
  const highlights = Array.from(grouped.entries()).map(([label, items]) => ({
    label,
    items: items.slice(0, 8).map((poi) => ({
      name: poi.name,
      category: poi.category,
      distanceText: poi.distanceText,
      distanceFt: Math.round(poi.distanceFt),
      addressText: [poi.tags['addr:housenumber'], poi.tags['addr:street']].filter(Boolean).join(' ') || undefined,
      phone: poi.tags.phone || poi.tags['contact:phone'] || undefined,
      website: poi.tags.website || poi.tags['contact:website'] || undefined,
    })),
  }));
  if (!highlights.length) return undefined;
  const label = SECTION_LABELS[sectionKey];
  return JSON.stringify({
    summary: `${highlights.reduce((sum, group) => sum + (group.items?.length || 0), 0)} nearby ${label.toLowerCase()} places found within walking distance.`,
    highlights,
    poiCount: pois.filter((item) => item.group === sectionKey).length,
    source: 'overpass',
  });
}

function enrichBundle(bundle: DraftBundle, basePois: Array<Omit<NearbyPoi, 'distance' | 'distanceFt' | 'distanceText'>>, radiusMeters: number): DraftBundle {
  const lat = Number(bundle.buffet.lat);
  const lng = Number(bundle.buffet.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return bundle;
  const nearby = basePois
    .map((poi) => {
      const distance = distanceMeters(lat, lng, poi.lat, poi.lon);
      const distanceFt = metersToFeet(distance);
      return {
        ...poi,
        distance,
        distanceFt,
        distanceText: formatDistance(distanceFt),
      };
    })
    .filter((poi) => poi.distance <= radiusMeters)
    .sort((a, b) => a.distance - b.distance);

  const sectionKeys = Object.keys(SECTION_LABELS) as PoiSectionKey[];
  const sectionFields = Object.fromEntries(
    sectionKeys
      .map((key) => [key, buildPoiSection(key, nearby)])
      .filter(([, value]) => Boolean(value))
  );

  return {
    ...bundle,
    buffet: {
      ...bundle.buffet,
      overpassPOIs: JSON.stringify(nearby.slice(0, 100).map((poi) => ({
        id: poi.id,
        type: poi.type,
        name: poi.name,
        category: poi.category,
        group: SECTION_LABELS[poi.group],
        distance: Math.round(poi.distance),
        distanceFt: Math.round(poi.distanceFt),
        lat: poi.lat,
        lon: poi.lon,
        tags: poi.tags,
      }))),
      ...sectionFields,
    },
  };
}

function countSectionCoverage(bundles: DraftBundle[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of ['overpassPOIs', ...Object.keys(SECTION_LABELS)]) {
    result[key] = bundles.filter((bundle) => typeof bundle.buffet[key] === 'string' && String(bundle.buffet[key]).trim()).length;
  }
  return result;
}

async function main(): Promise<void> {
  const inputPath = process.env.INDIAN_BUFFET_POI_INPUT || 'data/indian-buffets/nyc-pilot-buffet-drafts.json';
  const outputPath = process.env.INDIAN_BUFFET_POI_OUTPUT || 'data/indian-buffets/nyc-pilot-poi-enriched-buffet-drafts.json';
  const radiusMeters = Number.parseInt(process.env.INDIAN_BUFFET_POI_RADIUS_METERS || '500', 10);
  const endpoint = process.env.OVERPASS_ENDPOINT || 'https://overpass.kumi.systems/api/interpreter';
  const bundles = readJson<DraftBundle[]>(inputPath);
  const bbox = buildBbox(bundles, radiusMeters);
  console.log(JSON.stringify({ event: 'poi_enrichment_start', candidates: bundles.length, bbox, radiusMeters, endpoint }));
  const elements = await fetchPois(bbox, endpoint);
  const basePois = elements.map(elementToPoi).filter((poi): poi is Omit<NearbyPoi, 'distance' | 'distanceFt' | 'distanceText'> => Boolean(poi));
  const enriched = bundles.map((bundle) => enrichBundle(bundle, basePois, radiusMeters));
  writeJson(outputPath, enriched);
  console.log(JSON.stringify({
    event: 'poi_enrichment_finish',
    overpassElements: elements.length,
    classifiedPois: basePois.length,
    outputPath,
    coverage: countSectionCoverage(enriched),
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
