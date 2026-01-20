'use client';

interface FoodOptionsProps {
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

export default function FoodOptions({ data }: FoodOptionsProps) {
  if (!data) return null;

  const diningOptions = normalizeList((data as any).diningOptions);
  const popularFor = normalizeList((data as any).popularFor);
  const serviceOptions = typeof (data as any).foodServiceOptions === 'object' && (data as any).foodServiceOptions
    ? Object.entries((data as any).foodServiceOptions).filter(([, value]) =>
        typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number'
      )
    : [];

  const fallbackTags = Array.isArray(data)
    ? normalizeList(data)
    : Object.entries(data as Record<string, any>)
        .filter(([, value]) => Array.isArray(value))
        .flatMap(([, value]) => normalizeList(value));

  const hasContent =
    diningOptions.length > 0 ||
    popularFor.length > 0 ||
    serviceOptions.length > 0 ||
    fallbackTags.length > 0;

  if (!hasContent) return null;

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">🍽️</span>
        Food Options
      </h2>
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl border border-orange-100 p-6 shadow-sm space-y-6">
        {diningOptions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-2">
              Dining Options
            </h3>
            <div className="flex flex-wrap gap-2">
              {diningOptions.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-orange-200 text-gray-800 shadow-sm"
                >
                  <span>{item}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {popularFor.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-2">
              Popular For
            </h3>
            <div className="flex flex-wrap gap-2">
              {popularFor.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-orange-200 text-gray-800 shadow-sm"
                >
                  <span>{item}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {serviceOptions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-orange-700 uppercase tracking-wide mb-2">
              Service Options
            </h3>
            <div className="space-y-3">
              {serviceOptions.map(([key, value]) => {
                const isAvailable = value === true || value === 'true' || value === 'yes' || value === 1;
                const isUnavailable = value === false || value === 'false' || value === 'no' || value === 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex-1 font-medium text-gray-800">{formatLabel(key)}</div>
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
        )}

        {fallbackTags.length > 0 && diningOptions.length === 0 && popularFor.length === 0 && serviceOptions.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {fallbackTags.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-orange-200 text-gray-800 shadow-sm"
              >
                <span>{item}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
