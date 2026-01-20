'use client';

interface AtmosphereProps {
  data: Record<string, any> | any[];
}

function formatLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

function normalizeAtmosphere(data: Record<string, any> | any[]) {
  const tags: string[] = [];
  let noiseLevel: string | null = null;

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        tags.push(item.trim());
      }
    });
    return { tags, noiseLevel };
  }

  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'noiseLevel' && typeof value === 'string') {
        noiseLevel = value;
        return;
      }
      if (key === 'atmosphere' && Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string' && item.trim()) {
            tags.push(item.trim());
          }
        });
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (typeof item === 'string' && item.trim()) {
            tags.push(item.trim());
          }
        });
        return;
      }
      if (typeof value === 'boolean') {
        tags.push(value ? formatLabel(key) : `No ${formatLabel(key)}`);
        return;
      }
      if (typeof value === 'string') {
        tags.push(`${formatLabel(key)}: ${value}`);
      }
    });
  }

  return { tags, noiseLevel };
}

export default function Atmosphere({ data }: AtmosphereProps) {
  if (!data) return null;

  const { tags, noiseLevel } = normalizeAtmosphere(data);
  if (tags.length === 0 && !noiseLevel) return null;

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">✨</span>
        Atmosphere
      </h2>
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-100 p-6 shadow-sm space-y-6">
        {tags.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-2">
              Atmosphere
            </h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-purple-200 text-gray-800 shadow-sm"
                >
                  <span>{item}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {noiseLevel && (
          <div>
            <h3 className="text-sm font-semibold text-purple-700 uppercase tracking-wide mb-2">
              Noise Level
            </h3>
            <div className="text-sm font-medium text-purple-800">
              {formatLabel(noiseLevel)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
