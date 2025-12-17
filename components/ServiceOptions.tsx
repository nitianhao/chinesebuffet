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
      if (lowerItem.includes('dine-in') || lowerItem.includes('dine in')) return '🍽️';
      if (lowerItem.includes('drive-through') || lowerItem.includes('drive through')) return '🚗';
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
    
    // Payments icons
    if (category === 'Payments') {
      if (lowerItem.includes('credit') || lowerItem.includes('debit')) return '💳';
      if (lowerItem.includes('cash')) return '💵';
    }
    
    return '✓';
  };

  const renderCategory = (categoryName: string, items: Array<Record<string, boolean>>) => {
    if (!items || items.length === 0) return null;

    const enabledItems: string[] = [];
    items.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          enabledItems.push(key);
        }
      });
    });

    if (enabledItems.length === 0) return null;

    return (
      <div key={categoryName} className="mb-5 sm:mb-6 last:mb-0">
        <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-3">{categoryName}</h3>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {enabledItems.map((item, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm sm:text-base text-gray-700 hover:bg-gray-100 hover:border-gray-300 transition-all active:scale-95 font-medium"
            >
              <span className="text-base">{getIcon(categoryName, item)}</span>
              <span>{item}</span>
            </span>
          ))}
        </div>
      </div>
    );
  };

  const categoryOrder = [
    'Service options',
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
