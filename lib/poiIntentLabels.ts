/**
 * Generate intent labels for POI items based on category, name, and context
 */

interface POIItem {
  name?: string;
  category?: string;
  distanceFt?: number;
  distanceText?: string;
}

/**
 * Generate intent label for a POI item
 */
export function generateIntentLabel(
  item: POIItem,
  sectionSlug: string,
  groupLabel: string
): string | null {
  const name = (item.name || '').toLowerCase();
  const category = (item.category || '').toLowerCase();
  const distanceFt = item.distanceFt || 0;
  
  // Parking labels
  if (sectionSlug.includes('transportation') || category.includes('parking') || name.includes('parking')) {
    // Check for free parking first (most important)
    if (name.includes('free') || category.includes('free') || name.includes('no charge')) {
      if (name.includes('street') || name.includes('on-street') || category.includes('street')) {
        return 'Free / Street';
      }
      if (name.includes('lot') || name.includes('parking lot') || category.includes('lot')) {
        return 'Free / Lot';
      }
      return 'Free';
    }
    
    // Check parking type
    if (name.includes('street') || name.includes('on-street') || category.includes('street') || category.includes('on_street')) {
      return 'Street';
    }
    if (name.includes('lot') || name.includes('parking lot') || category.includes('lot') || category.includes('parking_lot')) {
      return 'Lot';
    }
    if (name.includes('garage') || name.includes('parking garage') || category.includes('garage') || category.includes('parking_garage')) {
      return 'Garage';
    }
    if (name.includes('valet') || category.includes('valet')) {
      return 'Valet';
    }
    if (name.includes('meter') || name.includes('metered') || category.includes('meter')) {
      return 'Metered';
    }
    // Default parking label
    return 'Parking';
  }
  
  // Shopping labels
  if (sectionSlug.includes('retail') || sectionSlug.includes('shopping') || 
      category.includes('shop') || category.includes('store') || category.includes('mall') ||
      groupLabel.toLowerCase().includes('shopping') || groupLabel.toLowerCase().includes('retail')) {
    if (name.includes('mall') || name.includes('shopping center') || name.includes('plaza') || 
        name.includes('outlet') || category.includes('mall')) {
      return 'Large store';
    }
    if (name.includes('supermarket') || name.includes('grocery') || category.includes('supermarket') ||
        category.includes('grocery')) {
      return 'Large store';
    }
    if (name.includes('convenience') || name.includes('quick') || category.includes('convenience') ||
        category.includes('convenience_store')) {
      return 'Quick stop';
    }
    if (name.includes('gas') || name.includes('fuel') || category.includes('fuel') || category.includes('gas')) {
      return 'Quick stop';
    }
    if (name.includes('pharmacy') || category.includes('pharmacy')) {
      return 'Quick stop';
    }
    // Default shopping label - check size indicators
    if (name.includes('small') || name.includes('boutique')) {
      return 'Quick stop';
    }
    return 'Store';
  }
  
  // Transportation labels (excluding parking which is handled above)
  if ((sectionSlug.includes('transportation') || 
      category.includes('bus') || category.includes('train') || category.includes('station') ||
      category.includes('transit') || category.includes('public transport') ||
      category.includes('taxi') || category.includes('car_rental')) &&
      !category.includes('parking') && !name.includes('parking')) {
    if (distanceFt > 0 && distanceFt <= 2640) { // Within 0.5 miles
      return 'Walkable';
    }
    if (distanceFt > 2640 && distanceFt <= 13200) { // 0.5 to 2.5 miles
      return 'Short drive';
    }
    if (category.includes('walk') || name.includes('walk')) {
      return 'Walkable';
    }
    if (category.includes('car_rental') || name.includes('rental')) {
      return 'Short drive';
    }
    // Default transportation label
    return 'Nearby';
  }
  
  // Gas station labels (separate from general transportation)
  if ((category.includes('fuel') || category.includes('gas') || name.includes('gas station') || name.includes('fuel')) &&
      !sectionSlug.includes('shopping')) {
    if (distanceFt > 0 && distanceFt <= 2640) {
      return 'Walkable';
    }
    return 'Short drive';
  }
  
  // Restaurant/Food labels
  if (sectionSlug.includes('food') || sectionSlug.includes('dining') ||
      category.includes('restaurant') || category.includes('cafe') || category.includes('food')) {
    if (name.includes('fast') || name.includes('quick') || category.includes('fast')) {
      return 'Quick service';
    }
    if (name.includes('casual') || category.includes('casual')) {
      return 'Casual';
    }
  }
  
  // Attraction labels
  if (sectionSlug.includes('recreation') || sectionSlug.includes('entertainment') ||
      category.includes('attraction') || category.includes('park') || category.includes('museum')) {
    if (distanceFt > 0 && distanceFt <= 2640) {
      return 'Walkable';
    }
    if (distanceFt > 2640 && distanceFt <= 13200) {
      return 'Short drive';
    }
  }
  
  // Healthcare labels
  if (sectionSlug.includes('healthcare') || sectionSlug.includes('medical') ||
      category.includes('hospital') || category.includes('clinic') || category.includes('pharmacy')) {
    if (name.includes('urgent') || name.includes('emergency') || category.includes('urgent')) {
      return 'Urgent care';
    }
    if (name.includes('pharmacy') || category.includes('pharmacy')) {
      return 'Pharmacy';
    }
  }
  
  // Default: no label
  return null;
}
