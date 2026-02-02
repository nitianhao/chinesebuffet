'use client';

import ChipGridWithExpand, { ChipItem } from '@/components/ui/ChipGridWithExpand';

interface FoodAndDrinkProps {
  data: Record<string, unknown> | unknown[];
}

function formatLabel(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).replace(/_/g, ' ').trim();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return (value as string[]).filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function flattenEntries(
  input: Record<string, unknown>,
  prefix: string[] = []
): Array<[string, boolean | string | number]> {
  const results: Array<[string, boolean | string | number]> = [];
  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      results.push([[...prefix, key].join(' '), value]);
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string' && item.trim()) results.push([item.trim(), true]);
      });
    } else if (typeof value === 'object') {
      results.push(...flattenEntries(value as Record<string, unknown>, [...prefix, key]));
    }
  });
  return results;
}

export default function FoodAndDrink({ data }: FoodAndDrinkProps) {
  if (!data) return null;

  const items: ChipItem[] = [];

  if (Array.isArray(data)) {
    normalizeList(data).forEach((item) => items.push({ label: item, available: true }));
  } else if (typeof data === 'object') {
    flattenEntries(data as Record<string, unknown>).forEach(([key, value]) => {
      const label = formatLabel(String(key));
      if (value === true || value === 'true' || value === 'yes') {
        items.push({ label, available: true });
      } else if (value === false || value === 'false' || value === 'no') {
        items.push({ label, available: false });
      } else if (typeof value === 'string') {
        items.push({ label: value, available: true });
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
