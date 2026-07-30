import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface AtmosphereProps {
  data: Record<string, unknown> | unknown[];
  // Yelp ambience tags, e.g. ["Casual","Good for groups"] (some comma-joined). Merged, dedup vs `data`.
  yelpAmbience?: string[] | null;
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

// Known Yelp ambience vocabulary (lowercase). Anything else (sentence fragments) is dropped.
const AMBIENCE_ALLOWED = new Set([
  'casual', 'classy', 'trendy', 'intimate', 'upscale', 'romantic', 'divey', 'hipster',
  'touristy', 'casual dress', 'good for groups', 'good for kids', 'good for working',
]);

export function buildAtmosphereItems(
  data: AtmosphereProps['data'],
  yelpAmbience?: AtmosphereProps['yelpAmbience']
): ChipItem[] {
  if (!data && !(Array.isArray(yelpAmbience) && yelpAmbience.length)) return [];

  const items: ChipItem[] = [];
  let noiseLevel: string | null = null;

  if (Array.isArray(data)) {
    (data as string[]).forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        items.push({ label: item.trim(), available: true });
      }
    });
  } else if (data && typeof data === 'object') {
    Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
      if (['id', 'createdAt', 'updatedAt', 'type', 'group'].includes(key)) return;
      if (key === 'noiseLevel' && typeof value === 'string') {
        noiseLevel = value;
        return;
      }
      if (key === 'atmosphere' && Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string' && item.trim()) items.push({ label: item.trim(), available: true });
        });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string' && item.trim()) items.push({ label: item.trim(), available: true });
        });
        return;
      }
      if (typeof value === 'boolean' && value) {
        items.push({ label: formatLabel(key), available: true });
      }
    });
  }

  // Merge Yelp ambience tags (split comma-joined, whitelist, dedup vs Google data).
  if (Array.isArray(yelpAmbience)) {
    const seen = new Set(items.map((it) => it.label.toLowerCase().replace(/[^a-z0-9]/g, '')));
    yelpAmbience.forEach((raw) => {
      if (typeof raw !== 'string') return;
      raw.split(',').forEach((part) => {
        const tag = part.trim();
        if (!AMBIENCE_ALLOWED.has(tag.toLowerCase())) return;
        const key = tag.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ label: tag, available: true });
      });
    });
  }

  return noiseLevel
    ? [...items, { label: `Noise: ${formatLabel(noiseLevel)}`, available: true as const }]
    : items;
}

export default function Atmosphere({ data, yelpAmbience }: AtmosphereProps) {
  const allItems = buildAtmosphereItems(data, yelpAmbience);
  if (allItems.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={allItems}
      initialCount={6}
      availableVariant="default"
      className="mt-1"
    />
  );
}
