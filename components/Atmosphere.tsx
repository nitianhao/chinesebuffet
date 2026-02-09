import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface AtmosphereProps {
  data: Record<string, unknown> | unknown[];
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

export default function Atmosphere({ data }: AtmosphereProps) {
  if (!data) return null;

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

  const allItems = noiseLevel
    ? [...items, { label: `Noise: ${formatLabel(noiseLevel)}`, available: true as const }]
    : items;

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
