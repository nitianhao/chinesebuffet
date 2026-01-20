'use client';

interface AmenitiesProps {
  data: Record<string, any>;
}

// Icons for different amenities
function getIcon(key: string): string {
  const lower = key.toLowerCase();
  
  // Service Options
  if (lower.includes('takeout') || lower.includes('take-out') || lower.includes('togo')) return '🥡';
  if (lower.includes('delivery')) return '🚚';
  if (lower.includes('dinein') || lower.includes('dine-in') || lower.includes('dine in')) return '🍽️';
  if (lower.includes('reserv')) return '📅';
  if (lower.includes('curbside')) return '🚗';
  if (lower.includes('drive')) return '🚙';
  
  // Food Options
  if (lower.includes('breakfast')) return '🌅';
  if (lower.includes('brunch')) return '🥐';
  if (lower.includes('lunch')) return '☀️';
  if (lower.includes('dinner')) return '🌆';
  if (lower.includes('beer')) return '🍺';
  if (lower.includes('wine')) return '🍷';
  if (lower.includes('cocktail')) return '🍸';
  if (lower.includes('coffee')) return '☕';
  if (lower.includes('dessert')) return '🍰';
  if (lower.includes('vegetarian') || lower.includes('vegan')) return '🥬';
  if (lower.includes('children') || lower.includes('kids') || lower.includes('menu')) return '👶';
  
  // Parking
  if (lower.includes('bike') && lower.includes('parking')) return '🚲';
  if (lower.includes('valet')) return '🔑';
  if (lower.includes('garage')) return '🏢';
  if (lower.includes('street')) return '🛣️';
  if (lower.includes('lot')) return '🅿️';
  if (lower.includes('validated')) return '✅';
  if (lower.includes('parking')) return '🅿️';
  
  // Payments
  if (lower.includes('credit') || lower.includes('card')) return '💳';
  if (lower.includes('apple') && lower.includes('pay')) return '📱';
  if (lower.includes('google') && lower.includes('pay')) return '📱';
  if (lower.includes('cash')) return '💵';
  
  // Atmosphere
  if (lower.includes('noise') || lower.includes('quiet') || lower.includes('loud')) return '🔊';
  if (lower.includes('casual')) return '😊';
  if (lower.includes('romantic')) return '💕';
  if (lower.includes('trendy') || lower.includes('hip')) return '✨';
  if (lower.includes('upscale') || lower.includes('classy')) return '🎩';
  if (lower.includes('cozy') || lower.includes('intimate')) return '🕯️';
  if (lower.includes('divey')) return '🍻';
  if (lower.includes('touristy')) return '📸';
  
  // Pets
  if (lower.includes('dog') || lower.includes('pet')) return '🐕';
  
  // TV & Entertainment
  if (lower.includes('tv')) return '📺';
  
  // Highlights & Offerings
  if (lower.includes('tea')) return '🍵';
  if (lower.includes('all you can eat') || lower.includes('buffet')) return '🍱';
  if (lower.includes('comfort food')) return '🥘';
  if (lower.includes('quick bite')) return '⚡';
  if (lower.includes('healthy')) return '🥗';
  if (lower.includes('organic')) return '🌿';
  if (lower.includes('local') && lower.includes('ingredient')) return '🏡';
  
  // Planning
  if (lower.includes('group') || lower.includes('large')) return '👥';
  if (lower.includes('private')) return '🚪';
  if (lower.includes('event') || lower.includes('party')) return '🎉';
  if (lower.includes('catering')) return '👨‍🍳';
  
  // Default
  return '✓';
}

// Format key to readable label
function formatKey(key: string): string {
  // Handle specific patterns
  const patterns: Record<string, string> = {
    'takeout': 'Takeout',
    'dineIn': 'Dine-in',
    'delivery': 'Delivery',
    'reservable': 'Accepts Reservations',
    'curbsidePickup': 'Curbside Pickup',
    'allowsDogs': 'Dogs Allowed',
    'servesBreakfast': 'Serves Breakfast',
    'servesLunch': 'Serves Lunch',
    'servesDinner': 'Serves Dinner',
    'servesBrunch': 'Serves Brunch',
    'servesBeer': 'Serves Beer',
    'servesWine': 'Serves Wine',
    'servesCocktails': 'Serves Cocktails',
    'servesCoffee': 'Serves Coffee',
    'servesDessert': 'Serves Dessert',
    'servesVegetarianFood': 'Vegetarian Options',
    'menuForChildren': 'Kids Menu',
    'bikeParking': 'Bike Parking',
    'businessAcceptsCreditCards': 'Accepts Credit Cards',
    'acceptsGooglePay': 'Google Pay',
    'businessAcceptsApplePay': 'Apple Pay',
    'noiseLevel': 'Noise Level',
    'hasTv': 'Has TV',
  };
  
  if (patterns[key]) return patterns[key];
  
  // Convert camelCase to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .replace(/_/g, ' ')
    .trim();
}

// Get display-friendly group name
function formatGroupName(group: string): string {
  const groupNames: Record<string, string> = {
    'service options': 'Service Options',
    'food options': 'Food & Drinks',
    'parking': 'Parking',
    'payments': 'Payment Methods',
    'atmosphere': 'Atmosphere',
    'highlights': 'Highlights',
    'offerings': 'Offerings',
    'food and drink': 'Food & Drink',
    'planning': 'For Groups & Events',
    'amenities': 'Other Amenities',
  };
  
  return groupNames[group.toLowerCase()] || group.charAt(0).toUpperCase() + group.slice(1);
}

// Get group icon
function getGroupIcon(group: string): string {
  const icons: Record<string, string> = {
    'service options': '🍽️',
    'food options': '🍴',
    'parking': '🅿️',
    'payments': '💳',
    'atmosphere': '✨',
    'highlights': '⭐',
    'offerings': '🍱',
    'food and drink': '🥤',
    'planning': '📋',
    'amenities': '🏪',
  };
  
  return icons[group.toLowerCase()] || '📌';
}

// Helper function to extract a value from the data structure
// Handles nested structures like { allowsDogs: { allowsDogs: false } }
function extractValue(data: Record<string, any>, key: string): boolean | string | object | null {
  // Look in all groups for the key
  for (const [groupKey, groupData] of Object.entries(data)) {
    if (groupData && typeof groupData === 'object' && groupData !== null) {
      if (key in groupData) {
        const value = (groupData as any)[key];
        
        // Handle nested structure: { allowsDogs: { allowsDogs: false } }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          // Check if it's a nested object with the same key
          if (key in value) {
            return (value as any)[key];
          }
          // If it's an object but doesn't have the nested key, return the object
          // (might be a different structure)
          return value;
        }
        
        return value;
      }
    }
  }
  return null;
}

// Helper function to render an amenity item
function renderAmenityItem(
  key: string,
  value: boolean | string | number | object | null,
  description?: string
) {
  if (value === null || value === undefined) return null;

  // Handle nested objects - extract the actual value
  let actualValue: boolean | string | number = value as any;
  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    // If it's an object with the key matching the field name, unwrap it
    if (key in value) {
      actualValue = (value as any)[key];
    } else {
      // If it's an object but doesn't match, try to extract a boolean or string
      const objKeys = Object.keys(value);
      if (objKeys.length === 1 && typeof (value as any)[objKeys[0]] !== 'object') {
        actualValue = (value as any)[objKeys[0]];
      } else {
        // Can't determine value, don't render
        return null;
      }
    }
  }

  const isAvailable = actualValue === true || actualValue === 'true' || actualValue === 'yes' || actualValue === 1;
  const isUnavailable = actualValue === false || actualValue === 'false' || actualValue === 'no' || actualValue === 0;

  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl">{getIcon(key)}</span>
      <div className="flex-1">
        <div className="font-semibold text-gray-800">{formatKey(key)}</div>
        {description && (
          <div className="text-sm text-gray-600">{description}</div>
        )}
      </div>
      <div className={`px-4 py-2 rounded-lg font-medium ${
        isAvailable
          ? 'bg-green-100 text-green-800'
          : isUnavailable
          ? 'bg-red-100 text-red-800'
          : 'bg-gray-100 text-gray-800'
      }`}>
        {isAvailable
          ? 'Available'
          : isUnavailable
          ? 'Not Available'
          : String(actualValue)}
      </div>
    </div>
  );
}

export default function Amenities({ data }: AmenitiesProps) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // Extract hasTv value (type=hasTv)
  const hasTvValue = extractValue(data, 'hasTv');

  // Helper to unwrap nested values and normalize
  function unwrapValue(value: any): boolean | string | null {
    if (value === null || value === undefined) return null;
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length === 1 && typeof value[keys[0]] !== 'object') {
        return value[keys[0]];
      }
      return null;
    }
    
    return value;
  }

  // Extract data from type=amenities record only
  function extractAmenitiesGroup(source: Record<string, any>): Record<string, any> | null {
    const groupEntry = Object.entries(source).find(
      ([key]) => key.toLowerCase() === 'amenities'
    );

    if (!groupEntry) return null;
    const [, groupData] = groupEntry;

    if (groupData && typeof groupData === 'object') {
      return groupData as Record<string, any>;
    }

    return null;
  }

  const unwrappedHasTv = unwrapValue(hasTvValue);
  const amenitiesGroup = extractAmenitiesGroup(data);
  const amenitiesList = amenitiesGroup && Array.isArray((amenitiesGroup as any).amenities)
    ? (amenitiesGroup as any).amenities.filter((item: any) => typeof item === 'string' && item.trim())
    : [];
  const amenitiesFlags = amenitiesGroup
    ? Object.entries(amenitiesGroup).filter(([key, value]) => {
        if (key === 'amenities') return false;
        if (key.toLowerCase() === 'hastv') return false;
        if (['id', 'createdAt', 'updatedAt', 'type', 'group'].includes(key)) return false;
        return typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
      })
    : [];

  const hasTvDescription = unwrappedHasTv !== null
    ? (unwrappedHasTv === true || unwrappedHasTv === 'true' || unwrappedHasTv === 'yes'
        ? 'TVs are available for viewing'
        : unwrappedHasTv === false || unwrappedHasTv === 'false' || unwrappedHasTv === 'no'
        ? 'No TVs available'
        : `Status: ${unwrappedHasTv}`)
    : undefined;

  // Only render if hasTv or amenities list/flags exist
  if (unwrappedHasTv === null && amenitiesList.length === 0 && amenitiesFlags.length === 0) {
    return (
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <span className="text-2xl">🏪</span>
          Amenities & Services
        </h2>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">🏪</span>
        Amenities & Services
      </h2>
      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-6 shadow-sm space-y-4">
        {unwrappedHasTv !== null && renderAmenityItem('hasTv', unwrappedHasTv, hasTvDescription)}
        {amenitiesList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {amenitiesList.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-emerald-200 text-gray-800 shadow-sm"
              >
                <span className="text-base">{getIcon(item)}</span>
                <span>{item}</span>
              </span>
            ))}
          </div>
        )}
        {amenitiesFlags.length > 0 && (
          <div className="space-y-3">
            {amenitiesFlags.map(([key, value]) =>
              renderAmenityItem(key, value, undefined)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Process group data into features array
function processGroupData(data: any): Array<{ label: string; icon: string; value?: string | boolean }> {
  const features: Array<{ label: string; icon: string; value?: string | boolean }> = [];
  
  if (Array.isArray(data)) {
    // Array of strings like ["All you can eat", "Comfort food"]
    data.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        features.push({
          label: item.trim(),
          icon: getIcon(item),
          value: true,
        });
      }
    });
  } else if (typeof data === 'object' && data !== null) {
    // Object with key-value pairs
    Object.entries(data).forEach(([key, value]) => {
      // Skip metadata
      if (['id', 'createdAt', 'updatedAt', 'type', 'group'].includes(key)) return;
      
      if (typeof value === 'boolean') {
        features.push({
          label: formatKey(key),
          icon: getIcon(key),
          value,
        });
      } else if (typeof value === 'string') {
        features.push({
          label: formatKey(key),
          icon: getIcon(key),
          value,
        });
      } else if (Array.isArray(value)) {
        // Array inside object like atmosphere: ["Casual", "Quiet"]
        value.forEach((item) => {
          if (typeof item === 'string') {
            features.push({
              label: item,
              icon: getIcon(item),
              value: true,
            });
          }
        });
      } else if (typeof value === 'object' && value !== null) {
        // Nested object like businessParking: {garage: false, lot: true}
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          if (typeof nestedValue === 'boolean' || typeof nestedValue === 'string') {
            features.push({
              label: formatKey(nestedKey),
              icon: getIcon(nestedKey),
              value: nestedValue as boolean | string,
            });
          }
        });
      }
    });
  }
  
  // Sort: available features first
  features.sort((a, b) => {
    const aAvail = a.value === true || (typeof a.value === 'string' && !['false', 'no'].includes(a.value.toLowerCase()));
    const bAvail = b.value === true || (typeof b.value === 'string' && !['false', 'no'].includes(b.value.toLowerCase()));
    if (aAvail && !bAvail) return -1;
    if (!aAvail && bAvail) return 1;
    return 0;
  });
  
  return features;
}
