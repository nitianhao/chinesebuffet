import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface ServiceOptionsSectionProps {
  data: Record<string, unknown> | unknown[];
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

export default function ServiceOptionsSection({ data }: ServiceOptionsSectionProps) {
  if (!data) return null;

  const items: ChipItem[] = [];

  if (Array.isArray(data)) {
    (data as string[]).forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        items.push({ label: item.trim(), available: true });
      }
    });
  } else if (typeof data === 'object') {
    flattenBooleans(data as Record<string, unknown>).forEach(([key, value]) => {
      const label = mapLabel(key);
      if (value === true || value === 'true' || value === 'yes') {
        items.push({ label, available: true });
      } else if (value === false || value === 'false' || value === 'no') {
        items.push({ label, available: false });
      }
    });
  }

  if (items.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={items}
      initialCount={6}
      className="mt-1"
    />
  );
}
