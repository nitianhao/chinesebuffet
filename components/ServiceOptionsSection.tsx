import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface ServiceOptionsSectionProps {
  data: Record<string, unknown> | unknown[];
  // Yelp service options ({ "Offers delivery": true, ... }) merged in; duplicates of `data` are skipped.
  yelpServiceOptions?: Record<string, unknown> | null;
}

// Canonical token used to detect the same service across Google + Yelp (dedup key).
function canonicalService(label: string): string {
  const cleaned = label
    .toLowerCase()
    .replace(/^(offers|takes|has|provides)\s+/, '')
    .replace(/[^a-z0-9]/g, '');
  const synonyms: Record<string, string> = {
    takeout: 'takeout',
    takeaway: 'takeout',
    delivery: 'delivery',
    reservations: 'reservations',
    reservable: 'reservations',
    reservation: 'reservations',
    dinein: 'dinein',
    outdoorseating: 'outdoorseating',
    curbside: 'curbside',
    curbsidepickup: 'curbside',
    drivethrough: 'drivethrough',
    drivethru: 'drivethrough',
  };
  return synonyms[cleaned] || cleaned;
}

// Display label for a Yelp service-option key.
function yelpServiceLabel(raw: string): string {
  const nice: Record<string, string> = {
    takeout: 'Takeout',
    delivery: 'Delivery',
    reservations: 'Reservations',
    dinein: 'Dine-in',
    outdoorseating: 'Outdoor Seating',
    curbside: 'Curbside Pickup',
    drivethrough: 'Drive-through',
  };
  const token = canonicalService(raw);
  if (nice[token]) return nice[token];
  return raw
    .replace(/^(Offers|Takes|Has|Provides)\s+/i, '')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapLabel(value: string): string {
  const rawKey = value.split(' ').pop() || value;
  const normalized = rawKey.replace(/\s+/g, '').toLowerCase();
  const mapping: Record<string, string> = {
    takeout: 'Takeout',
    dinein: 'Dine-in',
    delivery: 'Delivery',
    reservable: 'Reservations',
    curbsidepickup: 'Curbside Pickup',
    drivethrough: 'Drive-through',
    waiterservice: 'Waiter Service',
    selfservice: 'Self Service',
  };
  return mapping[normalized] || value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function flattenBooleans(
  input: Record<string, unknown>,
  prefix: string[] = []
): Array<[string, boolean | string | number]> {
  const results: Array<[string, boolean | string | number]> = [];
  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      results.push([[...prefix, key].join(' '), value]);
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      results.push(...flattenBooleans(value as Record<string, unknown>, [...prefix, key]));
    }
  });
  return results;
}

export function buildServiceOptionsItems(
  data: ServiceOptionsSectionProps['data'],
  yelpServiceOptions?: ServiceOptionsSectionProps['yelpServiceOptions']
): ChipItem[] {
  const items: ChipItem[] = [];

  if (Array.isArray(data)) {
    (data as string[]).forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        items.push({ label: item.trim(), available: true });
      }
    });
  } else if (data && typeof data === 'object') {
    flattenBooleans(data as Record<string, unknown>).forEach(([key, value]) => {
      const label = mapLabel(key);
      if (value === true || value === 'true' || value === 'yes') {
        items.push({ label, available: true });
      } else if (value === false || value === 'false' || value === 'no') {
        items.push({ label, available: false });
      }
    });
  }

  // Merge Yelp service options, skipping any that duplicate a Google (primary) point.
  if (yelpServiceOptions && typeof yelpServiceOptions === 'object') {
    const seen = new Set(items.map((it) => canonicalService(it.label)));
    Object.entries(yelpServiceOptions).forEach(([rawLabel, value]) => {
      const token = canonicalService(rawLabel);
      if (seen.has(token)) return; // duplicate → keep Google original, skip Yelp
      const available = value === true || value === 'true' || value === 'yes';
      const unavailable = value === false || value === 'false' || value === 'no';
      if (!available && !unavailable) return;
      seen.add(token);
      items.push({ label: yelpServiceLabel(rawLabel), available });
    });
  }

  return items;
}

export default function ServiceOptionsSection({ data, yelpServiceOptions }: ServiceOptionsSectionProps) {
  const items = buildServiceOptionsItems(data, yelpServiceOptions);
  if (items.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={items}
      initialCount={6}
      className="mt-1"
    />
  );
}
