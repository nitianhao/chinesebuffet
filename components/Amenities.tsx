import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface AmenitiesProps {
  data: Record<string, unknown>;
  // Yelp amenities ({ "Wi-Fi": true, ... }) — noisy; whitelisted + deduped before merge.
  yelpAmenities?: Record<string, boolean> | null;
}

// Known standalone Yelp amenity labels (lowercase). Pattern rules below cover the rest.
const AMENITY_ALLOWED = new Set([
  'tv', 'alcohol', 'quiet', 'loud', 'moderate noise', 'waiter service', 'dogs allowed',
  'bike parking', 'full bar', 'beer & wine only', 'happy hour specials', 'private dining',
  'pool table', 'smoking allowed', 'tipping optional', 'tipping optional for large parties',
  'tip auto included for large parties', 'closed captioning on tvs', 'gender-neutral restrooms',
  'asl proficient', 'braille menus available', 'qr code menus available', 'provides reusable tableware',
  'compostable containers available', 'bring your own container allowed', 'plastic-free packaging',
  'ev charging station available', 'open to all', 'asian-owned', 'women-owned', 'latina-owned',
  'latino-owned', 'black-owned', 'lgbtq friendly', 'staff wears masks', 'wheelchair accessible',
  'accessible parking near entrance', 'ada-compliant main entrance', 'ada-compliant restroom',
]);

// Keep real amenities, drop scraped junk (health scores, review fragments, place names, etc.).
function isRealAmenity(label: string): boolean {
  const l = label.trim();
  if (l.length < 2 || l.length > 40 || l.includes('.') || /^\d/.test(l)) return false;
  const low = l.toLowerCase();
  if (/out of \d|health score|inspection|re-?inspection|closure|^pass$|^participating$|^met\b|^the$|^in$|^on$|^an?$/i.test(low)) return false;
  if (AMENITY_ALLOWED.has(low)) return true;
  if (low.startsWith('accepts ') || low.startsWith('good for ')) return true;
  if (low.includes('parking') || low.includes('restroom')) return true;
  if (/vegetarian|vegan|pescatarian/.test(low)) return true;
  if (/wi-?fi/.test(low)) return true;
  return false;
}

// Dedup key that collapses e.g. "TV" vs "TV Available", "Dogs allowed" vs "Dogs Allowed".
function canonicalAmenity(label: string): string {
  return label.toLowerCase().trim().replace(/\s*available$/, '').replace(/[^a-z0-9]/g, '');
}

function formatKey(key: string): string {
  const patterns: Record<string, string> = {
    takeout: 'Takeout',
    dineIn: 'Dine-in',
    delivery: 'Delivery',
    reservable: 'Reservations',
    curbsidePickup: 'Curbside Pickup',
    allowsDogs: 'Dogs Allowed',
    hasTv: 'TV Available',
    restroom: 'Restroom',
  };
  if (patterns[key]) return patterns[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

export function buildAmenitiesItems(
  data: AmenitiesProps['data'],
  yelpAmenities?: AmenitiesProps['yelpAmenities']
): ChipItem[] {
  const hasYelp = !!yelpAmenities && typeof yelpAmenities === 'object' && Object.keys(yelpAmenities).length > 0;
  if ((!data || typeof data !== 'object') && !hasYelp) return [];

  const available: ChipItem[] = [];
  const unavailable: ChipItem[] = [];

  const amenitiesGroup = (data && typeof data === 'object' ? data.amenities : undefined) as Record<string, unknown> | undefined;

  // Handle amenities list (array of strings)
  if (amenitiesGroup?.amenities && Array.isArray(amenitiesGroup.amenities)) {
    (amenitiesGroup.amenities as string[]).forEach((item: string) => {
      if (typeof item === 'string' && item.trim()) {
        available.push({ label: item.trim(), available: true });
      }
    });
  }

  // Handle boolean flags
  if (amenitiesGroup && typeof amenitiesGroup === 'object') {
    Object.entries(amenitiesGroup).forEach(([key, value]) => {
      if (key === 'amenities' || ['id', 'createdAt', 'updatedAt', 'type', 'group'].includes(key)) return;

      let actualValue = value;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const obj = value as Record<string, unknown>;
        if (key in obj) {
          actualValue = obj[key];
        }
      }

      const label = formatKey(key);
      if (actualValue === true || actualValue === 'yes' || actualValue === 'true') {
        available.push({ label, available: true });
      } else if (actualValue === false || actualValue === 'no' || actualValue === 'false') {
        unavailable.push({ label, available: false });
      }
    });
  }

  // Merge Yelp amenities (whitelist junk out, dedup vs Google data).
  if (hasYelp) {
    const seen = new Set([...available, ...unavailable].map((it) => canonicalAmenity(it.label)));
    Object.entries(yelpAmenities as Record<string, boolean>).forEach(([rawLabel, value]) => {
      const label = rawLabel.trim();
      if (!isRealAmenity(label)) return;
      const key = canonicalAmenity(label);
      if (seen.has(key)) return; // duplicate → keep Google original, skip Yelp
      seen.add(key);
      if (value === true) available.push({ label, available: true });
      else if (value === false) unavailable.push({ label, available: false });
    });
  }

  return [...available, ...unavailable];
}

export default function Amenities({ data, yelpAmenities }: AmenitiesProps) {
  const items = buildAmenitiesItems(data, yelpAmenities);
  if (items.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={items}
      initialCount={6}
      className="mt-1"
    />
  );
}
