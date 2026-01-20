'use client';

interface ServiceOptionsSectionProps {
  data: Record<string, any> | any[];
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function mapLabel(value: string): string {
  const rawKey = value.split(' ').pop() || value;
  const normalized = rawKey.replace(/\s+/g, '').toLowerCase();
  const mapping: Record<string, string> = {
    takeout: 'Takeout',
    dinein: 'Dine-in',
    delivery: 'Delivery',
    reservable: 'Accepts Reservations',
    curbsidepickup: 'Curbside Pickup',
    drivethrough: 'Drive-through',
    waiterservice: 'Waiter Service',
    selfservice: 'Self Service',
    tablereservation: 'Table Reservation',
    takeoutservice: 'Takeout',
  };

  return mapping[normalized] || formatLabel(value);
}

function flattenBooleans(input: Record<string, any>, prefix: string[] = []): Array<[string, boolean | string | number]> {
  const results: Array<[string, boolean | string | number]> = [];

  Object.entries(input).forEach(([key, value]) => {
    if (value === null || value === undefined) return;

    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      results.push([[...prefix, key].join(' '), value]);
      return;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      results.push(...flattenBooleans(value, [...prefix, key]));
    }
  });

  return results;
}

export default function ServiceOptionsSection({ data }: ServiceOptionsSectionProps) {
  if (!data) return null;

  const entries: Array<[string, boolean | string | number]> = [];

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        entries.push([item.trim(), true]);
      }
    });
  } else if (typeof data === 'object') {
    entries.push(...flattenBooleans(data as Record<string, any>));
  }

  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">🛎️</span>
        Service Options
      </h2>
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-100 p-6 shadow-sm space-y-3">
        {entries.map(([key, value]) => {
          const isAvailable = value === true || value === 'true' || value === 'yes' || value === 1;
          const isUnavailable = value === false || value === 'false' || value === 'no' || value === 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="flex-1 font-medium text-gray-800">{mapLabel(key)}</div>
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
