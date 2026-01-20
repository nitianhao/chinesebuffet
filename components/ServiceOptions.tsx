'use client';

interface ServiceOptionsProps {
  additionalInfo: {
    'Service options'?: Array<Record<string, boolean>>;
    Highlights?: Array<Record<string, boolean>>;
    Offerings?: Array<Record<string, boolean>>;
    'Dining options'?: Array<Record<string, boolean>>;
    Amenities?: Array<Record<string, boolean>>;
    Atmosphere?: Array<Record<string, boolean>>;
    Crowd?: Array<Record<string, boolean>>;
    Planning?: Array<Record<string, boolean>>;
    Payments?: Array<Record<string, boolean>>;
    Accessibility?: Array<Record<string, boolean>>;
    [key: string]: any;
  };
}

export default function ServiceOptions({ additionalInfo }: ServiceOptionsProps) {
  if (!additionalInfo || Object.keys(additionalInfo).length === 0) {
    return null;
  }

  const getIcon = (category: string, item: string) => {
    const lowerItem = item.toLowerCase();
    
    // Service options icons
    if (category === 'Service options') {
      if (lowerItem.includes('delivery')) return '🚚';
      if (lowerItem.includes('takeout') || lowerItem.includes('take-out')) return '🥡';
      if (lowerItem.includes('dine-in') || lowerItem.includes('dine in') || lowerItem.includes('dinein')) return '🍽️';
      if (lowerItem.includes('drive-through') || lowerItem.includes('drive through') || lowerItem.includes('drivethrough')) return '🚗';
      if (lowerItem.includes('reservable') || lowerItem.includes('reservation')) return '📅';
    }
    
    // Food service options icons
    if (category === 'Food service options') {
      if (lowerItem.includes('breakfast')) return '🌅';
      if (lowerItem.includes('brunch')) return '🥐';
      if (lowerItem.includes('lunch')) return '🍱';
      if (lowerItem.includes('dinner')) return '🍜';
      if (lowerItem.includes('beer')) return '🍺';
      if (lowerItem.includes('wine')) return '🍷';
      if (lowerItem.includes('cocktail')) return '🍹';
      if (lowerItem.includes('coffee')) return '☕';
      if (lowerItem.includes('dessert')) return '🍰';
      if (lowerItem.includes('vegetarian')) return '🥬';
      if (lowerItem.includes('children') || lowerItem.includes('kid')) return '👶';
    }
    
    // Highlights icons
    if (category === 'Highlights') {
      if (lowerItem.includes('fast')) return '⚡';
      if (lowerItem.includes('tea')) return '🍵';
      if (lowerItem.includes('breakfast')) return '🌅';
      if (lowerItem.includes('lunch')) return '🍱';
      if (lowerItem.includes('dinner')) return '🍜';
    }
    
    // Offerings icons
    if (category === 'Offerings') {
      if (lowerItem.includes('alcohol') || lowerItem.includes('beer') || lowerItem.includes('wine')) return '🍺';
      if (lowerItem.includes('coffee')) return '☕';
      if (lowerItem.includes('dessert')) return '🍰';
      if (lowerItem.includes('vegetarian') || lowerItem.includes('vegan')) return '🥬';
    }
    
    // Amenities icons
    if (category === 'Amenities') {
      if (lowerItem.includes('restroom') || lowerItem.includes('bathroom')) return '🚻';
      if (lowerItem.includes('wifi') || lowerItem.includes('wi-fi')) return '📶';
      if (lowerItem.includes('parking')) return '🅿️';
      if (lowerItem.includes('outdoor') || lowerItem.includes('patio')) return '🌳';
    }
    
    // Additional service options icons
    if (category === 'Additional service options') {
      if (lowerItem.includes('dog') || lowerItem.includes('pet')) return '🐕';
      if (lowerItem.includes('curbside') || lowerItem.includes('pickup')) return '🚗';
    }
    
    // Payments icons
    if (category === 'Payments') {
      if (lowerItem.includes('credit') || lowerItem.includes('debit')) return '💳';
      if (lowerItem.includes('cash')) return '💵';
    }
    
    return '✓';
  };

  const renderCategory = (categoryName: string, items: Array<Record<string, boolean>>) => {
    if (!items || items.length === 0) return null;

    const allItems: Array<{ key: string; value: boolean }> = [];
    items.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        allItems.push({ key, value });
      });
    });

    if (allItems.length === 0) return null;

    return (
      <div key={categoryName} className="mb-5 sm:mb-6 last:mb-0">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">{categoryName}</h3>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {allItems.map((item, index) => {
            const isEnabled = item.value === true;
            // Format the key for display (e.g., "servesBreakfast" -> "Serves Breakfast", "allowsDogs" -> "Allows Dogs")
            const formatKey = (key: string) => {
              // Handle specific patterns first
              if (key.toLowerCase() === 'allowsdogs') return 'Allows Dogs';
              if (key.toLowerCase() === 'curbsidepickup') return 'Curbside Pickup';
              
              // Remove common prefixes like "serves", "has", "is", "allows", etc.
              let formatted = key
                .replace(/^serves/i, '')
                .replace(/^has/i, '')
                .replace(/^is/i, '')
                .replace(/^allows/i, '')
                .replace(/^menu/i, 'Menu ')
                .replace(/For/i, ' for');
              
              // Convert camelCase to Title Case
              formatted = formatted
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
              
              // Add back prefix if it was removed
              if (key.toLowerCase().startsWith('serves')) {
                formatted = 'Serves ' + formatted;
              } else if (key.toLowerCase().startsWith('has')) {
                formatted = 'Has ' + formatted;
              } else if (key.toLowerCase().startsWith('is')) {
                formatted = 'Is ' + formatted;
              } else if (key.toLowerCase().startsWith('allows')) {
                formatted = 'Allows ' + formatted;
              }
              
              return formatted || key;
            };
            
            return (
              <span
                key={index}
                className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border text-sm sm:text-base font-medium transition-all ${
                  isEnabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 active:scale-95'
                    : 'bg-gray-100 border-gray-200 text-gray-400 opacity-60 line-through'
                }`}
              >
                <span className="text-base">{getIcon(categoryName, item.key)}</span>
                <span>{formatKey(item.key)}</span>
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  const categoryOrder = [
    'Service options',
    'Food service options',
    'Additional service options',
    'Highlights',
    'Offerings',
    'Dining options',
    'Amenities',
    'Atmosphere',
    'Crowd',
    'Planning',
    'Payments',
    'Accessibility'
  ];

  const categories = categoryOrder
    .filter(cat => additionalInfo[cat] && Array.isArray(additionalInfo[cat]))
    .map(cat => ({ name: cat, items: additionalInfo[cat] }));

  // Also include any other categories not in the standard list
  Object.keys(additionalInfo).forEach(key => {
    if (!categoryOrder.includes(key) && Array.isArray(additionalInfo[key])) {
      categories.push({ name: key, items: additionalInfo[key] });
    }
  });

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {categories.map(cat => renderCategory(cat.name, cat.items))}
    </div>
  );
}
