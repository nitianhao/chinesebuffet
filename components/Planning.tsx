'use client';

interface PlanningProps {
  data: Record<string, any> | any[];
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function normalizeList(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function flattenEntries(input: Record<string, any>, prefix: string[] = []): Array<[string, boolean | string | number]> {
  const results: Array<[string, boolean | string | number]> = [];

  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      results.push([[...prefix, key].join(' '), value]);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string' && item.trim()) {
          results.push([item.trim(), true]);
        }
      });
      return;
    }

    if (typeof value === 'object') {
      results.push(...flattenEntries(value, [...prefix, key]));
    }
  });

  return results;
}

export default function Planning({ data }: PlanningProps) {
  if (!data) return null;

  const entries: Array<[string, boolean | string | number]> = [];

  if (Array.isArray(data)) {
    entries.push(...normalizeList(data).map((item) => [item, true]));
  } else if (typeof data === 'object') {
    entries.push(...flattenEntries(data as Record<string, any>));
  }

  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">📋</span>
        Planning
      </h2>
      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100 p-6 shadow-sm space-y-3">
        {entries.map(([key, value]) => {
          const isAvailable = value === true || value === 'true' || value === 'yes' || value === 1;
          const isUnavailable = value === false || value === 'false' || value === 'no' || value === 0;
          return (
            <div key={`${key}`} className="flex items-center gap-3">
              <div className="flex-1 font-medium text-gray-800">{formatLabel(String(key))}</div>
              <div
                className={`px-4 py-2 rounded-lg font-medium ${
                  isAvailable
                    ? 'bg-green-100 text-green-800'
                    : isUnavailable
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {isAvailable ? 'Available' : isUnavailable ? 'Not Available' : String(value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
