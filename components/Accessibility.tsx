'use client';

interface AccessibilityProps {
  data: Record<string, any>;
}

// Icons for different accessibility features
const accessibilityIcons: Record<string, string> = {
  // Wheelchair
  wheelchairAccessible: '♿',
  wheelchair: '♿',
  wheelchairAccessibleEntrance: '🚪',
  wheelchairAccessibleParking: '🅿️',
  wheelchairAccessibleRestroom: '🚻',
  wheelchairAccessibleSeating: '💺',
  accessibleEntrance: '🚪',
  accessibleParking: '🅿️',
  accessibleRestroom: '🚻',
  accessibleSeating: '💺',
  
  // Hearing
  assistiveHearingLoop: '👂',
  hearingLoop: '👂',
  hearingAssistance: '👂',
  
  // Visual
  brailleMenu: '📖',
  braille: '📖',
  largeTextMenu: '🔍',
  
  // Mobility
  elevator: '🛗',
  ramp: '📐',
  accessibleRamp: '📐',
  
  // Service animals
  serviceAnimalsAllowed: '🐕‍🦺',
  serviceAnimals: '🐕‍🦺',
  
  // Staff assistance
  staffAssistance: '👨‍💼',
  assistedAccess: '🤝',
  
  // Default
  default: '✓',
};

// User-friendly labels for accessibility keys
const accessibilityLabels: Record<string, string> = {
  wheelchairAccessible: 'Wheelchair Accessible',
  wheelchair: 'Wheelchair Accessible',
  wheelchairAccessibleEntrance: 'Wheelchair Accessible Entrance',
  wheelchairAccessibleParking: 'Wheelchair Accessible Parking',
  wheelchairAccessibleRestroom: 'Wheelchair Accessible Restroom',
  wheelchairAccessibleSeating: 'Wheelchair Accessible Seating',
  accessibleEntrance: 'Accessible Entrance',
  accessibleParking: 'Accessible Parking',
  accessibleRestroom: 'Accessible Restroom',
  accessibleSeating: 'Accessible Seating',
  assistiveHearingLoop: 'Assistive Hearing Loop',
  hearingLoop: 'Hearing Loop',
  hearingAssistance: 'Hearing Assistance',
  brailleMenu: 'Braille Menu',
  braille: 'Braille Available',
  largeTextMenu: 'Large Text Menu',
  elevator: 'Elevator Access',
  ramp: 'Ramp Access',
  accessibleRamp: 'Accessible Ramp',
  serviceAnimalsAllowed: 'Service Animals Allowed',
  serviceAnimals: 'Service Animals Welcome',
  staffAssistance: 'Staff Assistance Available',
  assistedAccess: 'Assisted Access Available',
};

// Convert camelCase to Title Case
function formatKey(key: string): string {
  // First check if we have a predefined label
  if (accessibilityLabels[key]) {
    return accessibilityLabels[key];
  }
  
  // Otherwise format the key
  return key
    // Add space before capital letters
    .replace(/([A-Z])/g, ' $1')
    // Capitalize first letter
    .replace(/^./, (str) => str.toUpperCase())
    // Handle common prefixes
    .replace(/^Wheelchair /, 'Wheelchair ')
    .replace(/^Accessible /, 'Accessible ')
    .trim();
}

function getIcon(key: string): string {
  const lowerKey = key.toLowerCase();
  
  // Check for exact match first
  if (accessibilityIcons[key]) {
    return accessibilityIcons[key];
  }
  
  // Check for partial matches
  if (lowerKey.includes('wheelchair') || lowerKey.includes('accessible')) {
    if (lowerKey.includes('entrance')) return '🚪';
    if (lowerKey.includes('parking')) return '🅿️';
    if (lowerKey.includes('restroom') || lowerKey.includes('bathroom')) return '🚻';
    if (lowerKey.includes('seating') || lowerKey.includes('seat')) return '💺';
    return '♿';
  }
  if (lowerKey.includes('hearing') || lowerKey.includes('audio')) return '👂';
  if (lowerKey.includes('braille') || lowerKey.includes('blind') || lowerKey.includes('visual')) return '📖';
  if (lowerKey.includes('elevator') || lowerKey.includes('lift')) return '🛗';
  if (lowerKey.includes('ramp')) return '📐';
  if (lowerKey.includes('service') && lowerKey.includes('animal')) return '🐕‍🦺';
  if (lowerKey.includes('staff') || lowerKey.includes('assist')) return '🤝';
  
  return accessibilityIcons.default;
}

export default function Accessibility({ data }: AccessibilityProps) {
  if (!data) {
    return null;
  }

  // Process the accessibility data - handle multiple formats
  const availableFeatures: Array<{ label: string; icon: string }> = [];
  const unavailableFeatures: Array<{ label: string; icon: string }> = [];
  
  // Handle array of strings format: ["Wheelchair accessible entrance", "Wheelchair accessible parking lot", ...]
  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string' && item.trim()) {
        // Each string is an available feature
        availableFeatures.push({
          label: item.trim(),
          icon: getIcon(item),
        });
      } else if (typeof item === 'object' && item !== null) {
        // Array of objects format: [{wheelchairAccessible: true}, {accessibleParking: false}]
        Object.entries(item).forEach(([key, value]) => {
          const label = formatKey(key);
          const icon = getIcon(key);
          if (value === true || value === 'yes' || value === 'true') {
            availableFeatures.push({ label, icon });
          } else if (value === false || value === 'no' || value === 'false') {
            unavailableFeatures.push({ label, icon });
          } else if (typeof value === 'string' && value.trim()) {
            availableFeatures.push({ label: `${label}: ${value}`, icon });
          }
        });
      }
    });
  } else if (typeof data === 'object') {
    // Object format: {wheelchairAccessible: true, accessibleParking: false}
    Object.entries(data).forEach(([key, value]) => {
      // Skip metadata fields
      if (key === 'id' || key === 'createdAt' || key === 'updatedAt' || key === 'type' || key === 'group') {
        return;
      }
      
      const label = formatKey(key);
      const icon = getIcon(key);
      
      if (value === true || value === 'yes' || value === 'true') {
        availableFeatures.push({ label, icon });
      } else if (value === false || value === 'no' || value === 'false') {
        unavailableFeatures.push({ label, icon });
      } else if (typeof value === 'string' && value.trim()) {
        // Non-boolean string value - treat as available with the value shown
        const normalizedValue = value.toLowerCase();
        if (normalizedValue !== 'no' && normalizedValue !== 'false') {
          availableFeatures.push({ label: value.trim(), icon });
        } else {
          unavailableFeatures.push({ label, icon });
        }
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          const nestedLabel = formatKey(nestedKey);
          const nestedIcon = getIcon(nestedKey);
          if (nestedValue === true || nestedValue === 'yes') {
            availableFeatures.push({ label: nestedLabel, icon: nestedIcon });
          } else if (nestedValue === false || nestedValue === 'no') {
            unavailableFeatures.push({ label: nestedLabel, icon: nestedIcon });
          }
        });
      }
    });
  }

  if (availableFeatures.length === 0 && unavailableFeatures.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">♿</span>
        Accessibility
      </h2>
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-6 shadow-sm">
        {availableFeatures.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-3">
              Available Features
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableFeatures.map((feature, index) => (
                <span
                  key={`available-${index}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-blue-200 rounded-xl text-gray-800 font-medium shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
                >
                  <span className="text-lg">{feature.icon}</span>
                  <span className="text-sm">{feature.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {unavailableFeatures.length > 0 && (
          <div className={availableFeatures.length > 0 ? 'mt-4 pt-4 border-t border-blue-100' : ''}>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Not Available
            </h3>
            <div className="flex flex-wrap gap-2">
              {unavailableFeatures.map((feature, index) => (
                <span
                  key={`unavailable-${index}`}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-200 rounded-xl text-gray-400 font-medium line-through opacity-70"
                >
                  <span className="text-base">{feature.icon}</span>
                  <span className="text-sm">{feature.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-blue-100">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Contact the restaurant directly to confirm accessibility features before visiting.
          </p>
        </div>
      </div>
    </div>
  );
}
