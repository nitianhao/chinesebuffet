// Menu structure parser - extracts structured data from raw menu text
// This module provides utilities to parse menu text into structured format

/**
 * Parse raw menu text into structured format
 * @param {string} rawText - Raw extracted text from menu
 * @param {string} sourceUrl - Original menu URL
 * @returns {Object} Structured menu data
 */
function parseMenuStructure(rawText, sourceUrl = '') {
  if (!rawText || typeof rawText !== 'string') {
    return {
      categories: [],
      items: [],
      metadata: {
        sourceUrl,
        extractedAt: new Date().toISOString(),
        parsingStatus: 'FAILED',
        error: 'Invalid or empty text input'
      }
    };
  }

  // Pre-process text for better OCR handling
  let processedText = rawText
    // Fix common OCR spacing issues
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // Add space between lowercase and uppercase
    .replace(/(\d)([A-Za-z])/g, '$1 $2')  // Add space between number and letter
    .replace(/([A-Za-z])(\d)/g, '$1 $2')  // Add space between letter and number
    // Fix common OCR character errors
    .replace(/[|]/g, 'I')  // Pipe to I
    // Normalize multiple spaces (but preserve line breaks for now)
    .replace(/[ \t]{3,}/g, '  ');  // Multiple spaces to double space (for item separation)

  // Split by newlines first
  let lines = processedText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // If we have very long lines (common in OCR), try to split them by multiple spaces
  const expandedLines = [];
  for (const line of lines) {
    // If line is very long and has multiple spaces, it might contain multiple items
    if (line.length > 100 && line.match(/\s{2,}/)) {
      // Split by 2+ spaces (likely item separators in OCR)
      const parts = line.split(/\s{2,}/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length > 3) {
          expandedLines.push(trimmed);
        }
      }
    } else {
      expandedLines.push(line);
    }
  }
  lines = expandedLines;
  const categories = [];
  const items = [];
  let currentCategory = null;

  // Common category keywords (expanded for Chinese restaurants)
  const categoryKeywords = [
    'appetizer', 'appetizers', 'starter', 'starters',
    'soup', 'soups', 'salad', 'salads',
    'entree', 'entrees', 'main', 'mains', 'main course',
    'dessert', 'desserts',
    'beverage', 'beverages', 'drink', 'drinks',
    'lunch', 'dinner', 'breakfast', 'brunch',
    'special', 'specials', 'combo', 'combos',
    'chicken', 'beef', 'pork', 'seafood', 'vegetable', 'vegetables',
    'rice', 'noodle', 'noodles', 'fried rice',
    // Chinese restaurant specific
    'wok', 'bar', 'chow mein', 'lo mein', 'kung pao', 'szechuan',
    'mongolian', 'general', 'orange', 'sweet', 'sour', 'curry'
  ];

  // Skip patterns (non-menu content)
  const skipPatterns = [
    /business\s*hours?/i,
    /open\s*\d+\s*days?/i,
    /phone|tel|call/i,
    /address|location|street|drive|avenue|road/i,
    /website|www\.|http/i,
    /online\s*order/i,
    /powered\s*by/i,
    /all\s*rights?\s*reserved/i,
    /contact\s*us/i,
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,  // Phone numbers
    /\d+\s*(am|pm|AM|PM)/i,  // Time patterns
  ];

  // Price patterns (improved for OCR)
  const pricePatterns = [
    /\$(\d+\.?\d{0,2})/g,  // $10.99, $10, $10.9
    /\$\s*(\d+\.?\d{0,2})/g,  // $ 10.99 (with space)
    /(\d+\.?\d{0,2})\s*\$/,  // 10.99 $ (price after number)
    /(\d+\.?\d{0,2})\s*dollars?/gi,  // 10.99 dollars
    /(\d+\.?\d{0,2})\s*USD/gi,  // 10.99 USD
    /(\d+\.?\d{0,2})\s*each/gi,  // 10.99 each
    /price[:\s]*\$?(\d+\.?\d{0,2})/gi  // price: $10.99
  ];

  /**
   * Extract price from text
   */
  function extractPrice(text) {
    for (const pattern of pricePatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        // Get the first price found
        const priceMatch = matches[0].match(/\d+\.?\d*/);
        if (priceMatch) {
          return {
            price: matches[0],
            priceNumber: parseFloat(priceMatch[0])
          };
        }
      }
    }
    return null;
  }

  /**
   * Check if line should be skipped (non-menu content)
   */
  function shouldSkipLine(line) {
    for (const pattern of skipPatterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if line looks like a category header
   */
  function isCategoryHeader(line) {
    if (shouldSkipLine(line)) return false;
    
    const lowerLine = line.toLowerCase();
    
    // Check for explicit category indicators (must be at start)
    if (/^(lunch|dinner|breakfast|brunch)\s+(special|menu|combo|includes?)/i.test(line)) {
      return true;
    }
    
    // Check for section headers (must be short and not look like a dish)
    if (line.length < 50) {
      // Must start with a category keyword or be all caps
      for (const keyword of categoryKeywords) {
        // Match at start of line or as whole word
        const regex = new RegExp(`^${keyword}\\b|\\b${keyword}\\b`, 'i');
        if (regex.test(lowerLine)) {
          // Additional checks to avoid false positives
          // Don't treat dish names as categories
          if (line.length < 35 && !line.match(/\b(chicken|beef|pork|shrimp)\s+(with|in|and)\b/i)) {
            // Check if it's followed by common category words
            if (lowerLine.match(/\b(special|menu|combo|includes?|served|with)\b/i)) {
              return true;
            }
            // Or if it's a standalone category word
            if (line.length < 25 && lowerLine.match(/^(appetizer|soup|salad|entree|dessert|beverage|drink|wok|bar)$/i)) {
              return true;
            }
          }
        }
      }
      
      // Check if it's all caps and short (common for headers)
      if (line === line.toUpperCase() && line.length > 3 && line.length < 35 && !extractPrice(line)) {
        // But exclude if it looks like a dish name
        if (!line.match(/\b(CHICKEN|BEEF|PORK|SHRIMP)\s+(WITH|IN|AND)\b/)) {
          return true;
        }
      }
      
      // Check for patterns like "Includes:" or "Comes with:"
      if (/^(includes?|comes?\s+with|served\s+with|with)[:\s]/i.test(lowerLine)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if line looks like a menu item
   */
  function isMenuItem(line) {
    // Skip non-menu content
    if (shouldSkipLine(line)) {
      return false;
    }
    
    // Menu items typically:
    // - Have a price
    // - Are not too short (at least 3 characters)
    // - Are not too long (usually under 200 characters for OCR)
    if (line.length < 3 || line.length > 250) {
      return false;
    }
    
    // If it's a category header, it's not an item
    if (isCategoryHeader(line)) {
      return false;
    }
    
    // Skip lines that are just numbers, single characters, or mostly garbage
    if (/^[\d\s\-\.]+$/.test(line) || line.length < 4) {
      return false;
    }
    
    // Skip lines that are mostly non-alphabetic (likely OCR garbage)
    const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
    if (alphaCount < line.length * 0.2) {  // Less than 20% letters
      return false;
    }
    
    // Skip lines that look like addresses or phone numbers
    if (line.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/) || // Phone
        line.match(/\d+\s+(dr|street|st|ave|avenue|road|rd|drive|blvd)/i)) { // Address
      return false;
    }
    
    // If it has a price, it's likely a menu item
    const price = extractPrice(line);
    if (price) {
      return true;
    }

    // Check if it looks like a dish name (common patterns)
    const lowerLine = line.toLowerCase();
    
    // Common dish name patterns (more flexible for OCR)
    const dishPatterns = [
      /\b(chicken|beef|pork|shrimp|fish|duck|tofu|vegetable|rice|noodle)\b/i,
      /\b(fried|sweet|sour|kung|pao|szechuan|mongolian|general|orange|curry)\b/i,
      /\b(mein|chow|lo|spring|roll|egg|roll|puff)\b/i,
      /\b(broccoli|cashew|almond|pepper|garlic|ginger|mandarin|moo|goo|gai|pan)\b/i,
      /\b(yuk|deluxe|family|happy|special|combo)\b/i
    ];
    
    let matchesDishPattern = false;
    for (const pattern of dishPatterns) {
      if (pattern.test(line)) {
        matchesDishPattern = true;
        break;
      }
    }
    
    // If it matches dish patterns and is reasonable length, treat as item
    if (matchesDishPattern && line.length > 4 && line.length < 120) {
      return true;
    }

    // For OCR text, be more lenient - if it has words and isn't obviously wrong, include it
    // But exclude lines that are mostly numbers, punctuation, or single words
    const wordCount = line.split(/\s+/).filter(w => w.length > 1).length;
    if (wordCount >= 2 && wordCount <= 8 && line.length > 5 && line.length < 100) {
      // Exclude if it's mostly numbers or special chars
      const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
      if (alphaCount >= line.length * 0.3) {  // At least 30% letters
        return true;
      }
    }
    
    return false;
  }

  // Process lines with look-ahead for better price detection
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip lines that are clearly not menu content
    if (shouldSkipLine(line)) {
      continue;
    }
    
    if (isCategoryHeader(line)) {
      // Start a new category
      if (currentCategory && currentCategory.items.length > 0) {
        categories.push(currentCategory);
      }
      currentCategory = {
        name: line,
        items: []
      };
    } else if (isMenuItem(line)) {
      // Try to extract price from current line or next few lines
      let price = extractPrice(line);
      let itemName = line;
      let description = null;
      
      // If price found, remove it from item name
      if (price) {
        itemName = line.replace(price.price, '').trim();
        // Clean up common separators
        itemName = itemName.replace(/[:\-–—]\s*$/, '').trim();
      } else {
        // Check next line for price (common in OCR where price is on separate line)
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const nextPrice = extractPrice(nextLine);
          if (nextPrice && nextLine.length < 20) {
            // Next line is likely just a price
            price = nextPrice;
            i++; // Skip the price line
          } else if (nextPrice && !isCategoryHeader(nextLine) && !shouldSkipLine(nextLine)) {
            // Price might be at end of next line
            price = nextPrice;
            description = nextLine.replace(price.price, '').trim();
            if (description.length < 5) description = null;
            i++; // Skip the description/price line
          }
        }
      }
      
      // Clean up item name (remove common OCR artifacts)
      itemName = itemName
        .replace(/^\d+[.)]\s*/, '')  // Remove leading numbers
        .replace(/\s+/g, ' ')  // Normalize spaces
        .trim();
      
      // Skip if item name is too short or looks invalid
      if (itemName.length < 2) {
        continue;
      }
      
      const menuItem = {
        name: itemName,
        description: description,
        price: price ? price.price : null,
        priceNumber: price ? price.priceNumber : null
      };

      // Check if next line might be a description (if we haven't already used it)
      if (!description && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        if (nextLine.length > 10 && nextLine.length < 200 && 
            !isCategoryHeader(nextLine) && 
            !extractPrice(nextLine) && 
            !shouldSkipLine(nextLine)) {
          menuItem.description = nextLine;
          i++; // Skip the description line
        }
      }

      if (currentCategory) {
        currentCategory.items.push(menuItem);
      } else {
        // Item without category - create a default category
        currentCategory = {
          name: 'Menu Items',
          items: [menuItem]
        };
      }
      
      items.push(menuItem);
    }
  }

  // Add the last category
  if (currentCategory && currentCategory.items.length > 0) {
    categories.push(currentCategory);
  }

  // If no categories found but we have items, create a default category
  if (categories.length === 0 && items.length > 0) {
    categories.push({
      name: 'Menu Items',
      items: items
    });
  }

  return {
    categories,
    items,
    metadata: {
      sourceUrl,
      extractedAt: new Date().toISOString(),
      parsingStatus: categories.length > 0 || items.length > 0 ? 'SUCCESS' : 'PARTIAL',
      totalCategories: categories.length,
      totalItems: items.length
    }
  };
}

/**
 * Clean and normalize text before parsing
 */
function cleanMenuText(text) {
  if (!text) return '';
  
  return text
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove special characters that might interfere
    .replace(/[^\w\s$.,!?()-]/g, ' ')
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove multiple consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = {
  parseMenuStructure,
  cleanMenuText
};

