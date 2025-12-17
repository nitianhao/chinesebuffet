import { Buffet, Review } from './data';

export function generateCustomerInsights(buffet: Buffet): string | null {
  if (!buffet.reviews || buffet.reviews.length === 0) {
    return null;
  }

  const reviews = buffet.reviews;
  const parts: string[] = [];
  const usedInsights = new Set<string>();

  // Extract food-related insights
  const foodInsights: string[] = [];
  const serviceInsights: string[] = [];
  const valueInsights: string[] = [];
  const atmosphereInsights: string[] = [];
  const specificDishes: string[] = [];
  const diningOccasions: string[] = [];

  reviews.forEach(review => {
    if (!review.text) return;
    
    const text = review.text.toLowerCase();
    const originalText = review.text;

    // Extract food quality mentions
    if (text.match(/\b(fresh|delicious|tasty|amazing|excellent|great|wonderful|perfect|outstanding|fantastic|love|best|favorite)\b.*\b(food|dish|dishes|meal|meals|cuisine|chicken|beef|pork|rice|noodles|soup|sushi|seafood|vegetables|sauce)\b/i)) {
      const sentences = originalText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if ((lowerSentence.includes('food') || lowerSentence.includes('dish') || lowerSentence.includes('meal')) && 
            (lowerSentence.includes('great') || lowerSentence.includes('good') || lowerSentence.includes('delicious') || 
             lowerSentence.includes('fresh') || lowerSentence.includes('amazing') || lowerSentence.includes('excellent'))) {
          const insight = sentence.trim();
          if (insight.length > 30 && insight.length < 200 && !usedInsights.has(insight)) {
            foodInsights.push(insight);
            usedInsights.add(insight);
          }
        }
      });
    }

    // Extract specific dish mentions
    const dishPatterns = ['chicken', 'beef', 'pork', 'sushi', 'soup', 'rice', 'noodles', 'crab', 'shrimp', 'egg roll', 'dumpling', 'kung pao', 'sweet and sour', 'general tso', 'orange chicken', 'mongolian', 'hibachi'];
    dishPatterns.forEach(dish => {
      if (text.includes(dish) && !specificDishes.includes(dish)) {
        specificDishes.push(dish);
      }
    });

    // Extract service mentions
    if (text.match(/\b(service|staff|server|waiter|waitress|employee|worker)\b.*\b(friendly|helpful|attentive|quick|fast|nice|polite|professional|excellent|great|good)\b/i)) {
      const sentences = originalText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if ((lowerSentence.includes('service') || lowerSentence.includes('staff') || lowerSentence.includes('server')) && 
            (lowerSentence.includes('friendly') || lowerSentence.includes('helpful') || lowerSentence.includes('attentive') || 
             lowerSentence.includes('quick') || lowerSentence.includes('nice'))) {
          const insight = sentence.trim();
          if (insight.length > 30 && insight.length < 200 && !usedInsights.has(insight)) {
            serviceInsights.push(insight);
            usedInsights.add(insight);
          }
        }
      });
    }

    // Extract value/price mentions
    if (text.match(/\b(price|affordable|cheap|value|worth|deal|portion|size|big|large|heaping|plenty)\b/i)) {
      const sentences = originalText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if (lowerSentence.includes('price') || lowerSentence.includes('affordable') || lowerSentence.includes('value') || 
            lowerSentence.includes('portion') || lowerSentence.includes('deal')) {
          const insight = sentence.trim();
          if (insight.length > 30 && insight.length < 200 && !usedInsights.has(insight)) {
            valueInsights.push(insight);
            usedInsights.add(insight);
          }
        }
      });
    }

    // Extract atmosphere mentions
    if (text.match(/\b(clean|atmosphere|ambiance|decor|environment|place|restaurant|location|setting|quiet|busy|crowded|comfortable)\b/i)) {
      const sentences = originalText.split(/[.!?]+/).filter(s => s.trim().length > 20);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if ((lowerSentence.includes('clean') || lowerSentence.includes('atmosphere') || lowerSentence.includes('place')) && 
            (lowerSentence.includes('nice') || lowerSentence.includes('good') || lowerSentence.includes('comfortable') || 
             lowerSentence.includes('clean') || lowerSentence.includes('quiet'))) {
          const insight = sentence.trim();
          if (insight.length > 30 && insight.length < 200 && !usedInsights.has(insight)) {
            atmosphereInsights.push(insight);
            usedInsights.add(insight);
          }
        }
      });
    }

    // Extract dining occasion mentions from review context
    if (review.reviewContext) {
      Object.entries(review.reviewContext).forEach(([key, value]) => {
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          if (lowerValue.includes('dinner') || lowerValue.includes('lunch') || lowerValue.includes('breakfast') || 
              lowerValue.includes('family') || lowerValue.includes('group') || lowerValue.includes('date')) {
            if (!diningOccasions.includes(value)) {
              diningOccasions.push(value);
            }
          }
        }
      });
    }
  });

  // Build the content
  if (foodInsights.length > 0) {
    const uniqueFoodInsights = Array.from(new Set(foodInsights)).slice(0, 2);
    if (uniqueFoodInsights.length > 0) {
      const foodText = uniqueFoodInsights.map(insight => {
        // Clean up the insight
        let cleaned = insight.trim();
        // Remove excessive capitalization
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        // Fix common grammar issues
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = cleaned.replace(/\bi\b/g, 'I');
        return cleaned;
      }).join(' ');
      
      parts.push(
        `Customers consistently praise the food quality at ${buffet.name}. ${foodText}`
      );
    }
  }

  // Specific dishes
  if (specificDishes.length > 0) {
    const uniqueDishes = Array.from(new Set(specificDishes)).slice(0, 5);
    if (uniqueDishes.length > 0) {
      const dishText = uniqueDishes.length === 1 
        ? uniqueDishes[0]
        : uniqueDishes.length === 2
        ? `${uniqueDishes[0]} and ${uniqueDishes[1]}`
        : `${uniqueDishes.slice(0, -1).join(', ')}, and ${uniqueDishes[uniqueDishes.length - 1]}`;
      
      parts.push(
        `Popular items that customers frequently mention include ${dishText}, showcasing the variety available at this ${buffet.address.city} Chinese buffet.`
      );
    }
  }

  // Service insights
  if (serviceInsights.length > 0) {
    const uniqueServiceInsights = Array.from(new Set(serviceInsights)).slice(0, 1);
    if (uniqueServiceInsights.length > 0) {
      let serviceText = uniqueServiceInsights[0].trim();
      serviceText = serviceText.charAt(0).toUpperCase() + serviceText.slice(1).toLowerCase();
      serviceText = serviceText.replace(/\s+/g, ' ');
      serviceText = serviceText.replace(/\bi\b/g, 'I');
      
      parts.push(
        `When it comes to service, diners appreciate the attention to detail. ${serviceText}`
      );
    }
  }

  // Value insights
  if (valueInsights.length > 0) {
    const uniqueValueInsights = Array.from(new Set(valueInsights)).slice(0, 1);
    if (uniqueValueInsights.length > 0) {
      let valueText = uniqueValueInsights[0].trim();
      valueText = valueText.charAt(0).toUpperCase() + valueText.slice(1).toLowerCase();
      valueText = valueText.replace(/\s+/g, ' ');
      valueText = valueText.replace(/\bi\b/g, 'I');
      
      parts.push(
        `Many customers find ${buffet.name} offers excellent value. ${valueText}`
      );
    }
  }

  // Atmosphere insights
  if (atmosphereInsights.length > 0) {
    const uniqueAtmosphereInsights = Array.from(new Set(atmosphereInsights)).slice(0, 1);
    if (uniqueAtmosphereInsights.length > 0) {
      let atmosphereText = uniqueAtmosphereInsights[0].trim();
      atmosphereText = atmosphereText.charAt(0).toUpperCase() + atmosphereText.slice(1).toLowerCase();
      atmosphereText = atmosphereText.replace(/\s+/g, ' ');
      atmosphereText = atmosphereText.replace(/\bi\b/g, 'I');
      
      parts.push(
        `The dining environment at ${buffet.name} receives positive feedback from guests. ${atmosphereText}`
      );
    }
  }

  // Dining occasions
  if (diningOccasions.length > 0) {
    const uniqueOccasions = Array.from(new Set(diningOccasions)).slice(0, 3);
    if (uniqueOccasions.length > 0) {
      const occasionText = uniqueOccasions.length === 1
        ? uniqueOccasions[0].toLowerCase()
        : uniqueOccasions.length === 2
        ? `${uniqueOccasions[0].toLowerCase()} and ${uniqueOccasions[1].toLowerCase()}`
        : `${uniqueOccasions.slice(0, -1).map(o => o.toLowerCase()).join(', ')}, and ${uniqueOccasions[uniqueOccasions.length - 1].toLowerCase()}`;
      
      parts.push(
        `Customers enjoy ${buffet.name} for various occasions, including ${occasionText}, making it a versatile dining destination in ${buffet.address.city}.`
      );
    }
  }

  // Extract unique positive phrases
  const positivePhrases: string[] = [];
  reviews.forEach(review => {
    if (!review.text) return;
    const sentences = review.text.split(/[.!?]+/).filter(s => s.trim().length > 15 && s.trim().length < 150);
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if ((lowerSentence.includes('recommend') || lowerSentence.includes('will come back') || 
           lowerSentence.includes('definitely') || lowerSentence.includes('always') || 
           lowerSentence.includes('regular') || lowerSentence.includes('favorite')) &&
          !lowerSentence.includes('not') && !lowerSentence.includes("don't") && !lowerSentence.includes("won't")) {
        let cleaned = sentence.trim();
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        cleaned = cleaned.replace(/\s+/g, ' ');
        if (!usedInsights.has(cleaned) && !positivePhrases.includes(cleaned)) {
          positivePhrases.push(cleaned);
        }
      }
    });
  });

  if (positivePhrases.length > 0) {
    const uniquePhrases = Array.from(new Set(positivePhrases)).slice(0, 1);
    if (uniquePhrases.length > 0) {
      parts.push(
        `${uniquePhrases[0]}`
      );
    }
  }

  // Remove duplicates and clean up
  const finalParts = parts.filter((part, index, self) => {
    // Remove exact duplicates
    if (self.indexOf(part) !== index) return false;
    
    // Remove parts that are too similar
    const words = part.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    if (words.length !== uniqueWords.size) {
      // Has duplicate words, try to clean it
      return true; // Keep it for now, we'll clean it
    }
    return true;
  });

  // Clean up duplicate words in each part
  const cleanedParts = finalParts.map(part => {
    const words = part.split(/\s+/);
    const seen = new Set<string>();
    const cleaned: string[] = [];
    
    words.forEach((word, index) => {
      const lowerWord = word.toLowerCase().replace(/[^\w]/g, '');
      // Allow some words to repeat (like "the", "and", etc.)
      const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were'];
      if (commonWords.includes(lowerWord) || !seen.has(lowerWord)) {
        cleaned.push(word);
        if (!commonWords.includes(lowerWord)) {
          seen.add(lowerWord);
        }
      }
    });
    
    return cleaned.join(' ');
  });

  if (cleanedParts.length === 0) {
    return null;
  }

  // Join parts with proper spacing
  let result = cleanedParts.join(' ');
  
  // Final cleanup: fix common grammar issues
  result = result.replace(/\s+/g, ' '); // Multiple spaces
  result = result.replace(/\s+([.!?])/g, '$1'); // Space before punctuation
  result = result.replace(/([.!?])\s*([A-Z])/g, '$1 $2'); // Space after punctuation
  result = result.replace(/\bi\b/g, 'I'); // Fix lowercase 'i'
  result = result.replace(/\s*,\s*,/g, ','); // Double commas
  result = result.trim();

  return result;
}
