import { Buffet } from './data';

export function generateExpandedDescription(buffet: Buffet): string {
  const parts: string[] = [];
  
  // Opening - Location and basic info
  let opening = `${buffet.name} is a popular Chinese buffet restaurant`;
  
  if (buffet.neighborhood) {
    opening += ` located in the ${buffet.neighborhood} neighborhood`;
  }
  
  opening += ` in ${buffet.address.city}, ${buffet.address.state}`;
  
  if (buffet.locatedIn) {
    opening += `, situated in ${buffet.locatedIn}`;
  }
  
  opening += '.';
  parts.push(opening);
  
  // Rating and reviews
  if (buffet.rating > 0 && buffet.reviewsCount > 0) {
    const ratingText = buffet.rating >= 4.5 
      ? 'excellent' 
      : buffet.rating >= 4.0 
      ? 'very good' 
      : buffet.rating >= 3.5 
      ? 'good' 
      : 'solid';
    
    parts.push(
      `This ${buffet.address.city} Chinese buffet has earned a ${ratingText} ${buffet.rating.toFixed(1)}-star rating based on ${buffet.reviewsCount.toLocaleString()} customer ${buffet.reviewsCount === 1 ? 'review' : 'reviews'}, making it one of the ${buffet.reviewsCount > 100 ? 'top-rated' : 'well-regarded'} all-you-can-eat restaurants in the area.`
    );
  }
  
  // Service options
  const serviceOptions: string[] = [];
  if (buffet.additionalInfo?.['Service options']) {
    buffet.additionalInfo['Service options'].forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('dine-in') || lowerKey.includes('dine in')) {
            serviceOptions.push('dine-in');
          } else if (lowerKey.includes('takeout') || lowerKey.includes('take-out')) {
            serviceOptions.push('takeout');
          } else if (lowerKey.includes('delivery')) {
            serviceOptions.push('delivery');
          } else if (lowerKey.includes('drive-through') || lowerKey.includes('drive through')) {
            serviceOptions.push('drive-through');
          }
        }
      });
    });
  }
  
  if (serviceOptions.length > 0) {
    const serviceText = serviceOptions.length === 1
      ? serviceOptions[0]
      : serviceOptions.length === 2
      ? `${serviceOptions[0]} and ${serviceOptions[1]}`
      : `${serviceOptions.slice(0, -1).join(', ')}, and ${serviceOptions[serviceOptions.length - 1]}`;
    
    parts.push(
      `${buffet.name} offers convenient ${serviceText} service options, making it easy to enjoy authentic Chinese cuisine whether you're dining in or ordering to go.`
    );
  }
  
  // Online ordering
  if (buffet.orderBy && buffet.orderBy.length > 0) {
    const orderingPlatforms = buffet.orderBy.map(o => o.name || 'online ordering').filter(Boolean);
    if (orderingPlatforms.length > 0) {
      parts.push(
        `Customers can also order online through ${orderingPlatforms.length === 1 ? orderingPlatforms[0] : `platforms like ${orderingPlatforms.slice(0, 2).join(' and ')}`} for quick and convenient meal delivery or pickup.`
      );
    }
  }
  
  // Price range
  if (buffet.price) {
    parts.push(
      `With a ${buffet.price} price range, ${buffet.name} offers excellent value for an all-you-can-eat Chinese buffet experience in ${buffet.address.city}.`
    );
  }
  
  // Amenities
  const amenities: string[] = [];
  if (buffet.additionalInfo?.Amenities) {
    buffet.additionalInfo.Amenities.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('parking')) {
            amenities.push('parking');
          } else if (lowerKey.includes('wifi') || lowerKey.includes('wi-fi')) {
            amenities.push('free WiFi');
          } else if (lowerKey.includes('outdoor') || lowerKey.includes('patio')) {
            amenities.push('outdoor seating');
          } else if (lowerKey.includes('restroom') || lowerKey.includes('bathroom')) {
            amenities.push('restrooms');
          }
        }
      });
    });
  }
  
  if (amenities.length > 0) {
    const amenityText = amenities.length === 1
      ? amenities[0]
      : amenities.length === 2
      ? `${amenities[0]} and ${amenities[1]}`
      : `${amenities.slice(0, -1).join(', ')}, and ${amenities[amenities.length - 1]}`;
    
    parts.push(
      `The restaurant features ${amenityText}, ensuring a comfortable dining experience for all guests.`
    );
  }
  
  // Offerings (alcohol, vegetarian options, etc.)
  const offerings: string[] = [];
  if (buffet.additionalInfo?.Offerings) {
    buffet.additionalInfo.Offerings.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('alcohol') || lowerKey.includes('beer') || lowerKey.includes('wine')) {
            offerings.push('alcoholic beverages');
          } else if (lowerKey.includes('vegetarian') || lowerKey.includes('vegan')) {
            offerings.push('vegetarian options');
          } else if (lowerKey.includes('dessert')) {
            offerings.push('dessert selection');
          }
        }
      });
    });
  }
  
  if (offerings.length > 0) {
    const offeringText = offerings.length === 1
      ? offerings[0]
      : offerings.length === 2
      ? `${offerings[0]} and ${offerings[1]}`
      : `${offerings.slice(0, -1).join(', ')}, and ${offerings[offerings.length - 1]}`;
    
    parts.push(
      `The menu includes ${offeringText}, catering to a variety of dietary preferences and dining occasions.`
    );
  }
  
  // Categories
  if (buffet.categories && buffet.categories.length > 0) {
    const relevantCategories = buffet.categories
      .filter(cat => !cat.toLowerCase().includes('restaurant') && !cat.toLowerCase().includes('buffet'))
      .slice(0, 3);
    
    if (relevantCategories.length > 0) {
      parts.push(
        `As a ${relevantCategories.join(', ')} establishment, ${buffet.name} specializes in authentic Chinese cuisine with a focus on traditional flavors and fresh ingredients.`
      );
    }
  }
  
  // Popular times
  if (buffet.popularTimesLiveText) {
    parts.push(
      `According to customer data, the restaurant is typically ${buffet.popularTimesLiveText.toLowerCase()}, so plan your visit accordingly for the best dining experience.`
    );
  }
  
  // Payment options
  const paymentMethods: string[] = [];
  if (buffet.additionalInfo?.Payments) {
    buffet.additionalInfo.Payments.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('credit') || lowerKey.includes('debit')) {
            paymentMethods.push('credit and debit cards');
          } else if (lowerKey.includes('cash')) {
            paymentMethods.push('cash');
          }
        }
      });
    });
  }
  
  if (paymentMethods.length > 0) {
    const paymentText = paymentMethods.length === 1
      ? paymentMethods[0]
      : paymentMethods.join(' and ');
    
    parts.push(
      `${buffet.name} accepts ${paymentText} for your convenience.`
    );
  }
  
  // Accessibility
  const accessibility: string[] = [];
  if (buffet.additionalInfo?.Accessibility) {
    buffet.additionalInfo.Accessibility.forEach(item => {
      Object.entries(item).forEach(([key, value]) => {
        if (value === true) {
          const lowerKey = key.toLowerCase();
          if (lowerKey.includes('wheelchair')) {
            accessibility.push('wheelchair accessible');
          }
        }
      });
    });
  }
  
  if (accessibility.length > 0) {
    parts.push(
      `The restaurant is ${accessibility.join(' and ')}, ensuring it's welcoming to all guests.`
    );
  }
  
  // Closing - Location and call to action
  parts.push(
    `Whether you're a local resident of ${buffet.address.city} or visiting ${buffet.address.state}, ${buffet.name} offers an authentic Chinese buffet experience with a wide selection of dishes, ${buffet.price ? `affordable pricing,` : ''} and excellent service. Visit this ${buffet.address.city} Chinese restaurant for lunch or dinner and discover why it's a favorite among Chinese food enthusiasts in the area.`
  );
  
  return parts.join(' ');
}
