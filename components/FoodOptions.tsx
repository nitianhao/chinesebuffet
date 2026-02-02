'use client';

import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface FoodOptionsProps {
  data: Record<string, unknown> | unknown[];
}

function formatLabel(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).replace(/_/g, ' ').trim();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as string[]).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

export default function FoodOptions({ data }: FoodOptionsProps) {
  if (!data) return null;

  const items: ChipItem[] = [];
  const dataObj = data as Record<string, unknown>;

  const diningOptions = normalizeList(dataObj.diningOptions);
  const popularFor = normalizeList(dataObj.popularFor);
  diningOptions.forEach((item) => items.push({ label: item, available: true }));
  popularFor.forEach((item) => items.push({ label: item, available: true }));

  const serviceOptions =
    typeof dataObj.foodServiceOptions === 'object' && dataObj.foodServiceOptions
      ? Object.entries(dataObj.foodServiceOptions as Record<string, unknown>)
      : [];

  serviceOptions.forEach(([key, value]) => {
    const label = formatLabel(key);
    if (value === true || value === 'true' || value === 'yes') {
      items.push({ label, available: true });
    } else if (value === false || value === 'false' || value === 'no') {
      items.push({ label, available: false });
    }
  });

  if (Array.isArray(data)) {
    normalizeList(data).forEach((item) => items.push({ label: item, available: true }));
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
