'use client';

import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface AmenitiesProps {
  data: Record<string, unknown>;
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

export default function Amenities({ data }: AmenitiesProps) {
  if (!data || typeof data !== 'object') return null;

  const available: ChipItem[] = [];
  const unavailable: ChipItem[] = [];

  const amenitiesGroup = data.amenities as Record<string, unknown> | undefined;

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

  const items: ChipItem[] = [...available, ...unavailable];
  if (items.length === 0) return null;

  return (
    <ChipGridWithExpand
      items={items}
      initialCount={6}
      className="mt-1"
    />
  );
}
