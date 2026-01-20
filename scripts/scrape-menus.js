// Script to scrape menu data from URLs and store in InstantDB
// Run with: node scripts/scrape-menus.js [--urls-file path/to/urls.json]
// Or provide URLs via stdin or command line arguments

const { init, id } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { parseMenuStructure, cleanMenuText } = require('./parse-menu-structure');
const puppeteer = require('puppeteer');

// Load schema
const schema = require('../src/instant.schema.ts');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
  adminToken: process.env.INSTANT_ADMIN_TOKEN,
  schema: schema.default || schema,
});

// Configuration
const CONFIG = {
  delayBetweenRequests: 2000, // 2 seconds
  requestTimeout: 30000, // 30 seconds
  maxRetries: 3,
  batchSize: 10, // Process in batches
};

/**
 * Detect content type from URL or response headers
 */
function detectContentType(url, responseHeaders = {}) {
  const contentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || '';
  const urlLower = url.toLowerCase();
  
  if (contentType.includes('application/pdf') || urlLower.endsWith('.pdf')) {
    return 'PDF';
  }
  
  if (contentType.includes('image/') || 
      /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(urlLower)) {
    return 'IMAGE';
  }
  
  return 'HTML';
}

/**
 * Fetch content from URL with redirect handling
 */
async function fetchContent(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    
    const makeRequest = (currentUrl) => {
      try {
        const urlObj = new URL(currentUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
          method: 'GET',
          timeout: CONFIG.requestTimeout,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        };

        const req = protocol.request(currentUrl, options, (res) => {
          // Handle redirects
          if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
            redirectCount++;
            if (redirectCount > maxRedirects) {
              reject(new Error(`Too many redirects (${redirectCount})`));
              return;
            }
            
            const redirectUrl = new URL(res.headers.location, currentUrl).href;
            console.log(`      → Redirect ${redirectCount}: ${redirectUrl}`);
            req.destroy();
            makeRequest(redirectUrl);
            return;
          }
          
          const chunks = [];
          let headers = res.headers;
          const statusCode = res.statusCode;
          
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          res.on('end', () => {
            const contentType = detectContentType(currentUrl, headers);
            const buffer = Buffer.concat(chunks);
            resolve({
              contentType,
              buffer,
              headers,
              statusCode,
              finalUrl: currentUrl
            });
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });

        req.end();
      } catch (error) {
        reject(error);
      }
    };
    
    makeRequest(url);
  });
}

/**
 * Fetch content using Puppeteer (for JavaScript-rendered pages)
 */
async function fetchContentWithPuppeteer(url) {
  let browser = null;
  try {
    console.log(`  Using Puppeteer to fetch JavaScript-rendered content...`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate and wait for content to load
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: CONFIG.requestTimeout 
    });
    
    // Wait a bit more for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Get the HTML content
    const html = await page.content();
    const buffer = Buffer.from(html, 'utf8');
    
    await browser.close();
    
    return {
      contentType: 'HTML',
      buffer,
      headers: { 'content-type': 'text/html' },
      statusCode: 200,
      finalUrl: url,
      puppeteerUsed: true
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

/**
 * Check if text is garbled (contains too many nonsensical patterns)
 * More lenient for OCR text which may have some errors but still be valid
 */
function isGarbledText(text, isOCRText = false) {
  if (!text || text.length < 20) return false;
  
  const textLower = text.toLowerCase();
  
  // Check for common error messages
  const errorPatterns = [
    /oops.*sorry.*something.*went.*wrong/i,
    /404.*not.*found/i,
    /page.*not.*found/i,
    /error.*occurred/i
  ];
  
  for (const pattern of errorPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }
  
  // For OCR text, be more lenient - OCR can have errors but still contain valid menu content
  if (isOCRText) {
    // Only reject if it's clearly not menu-related (very high garbled ratio)
    const words = text.split(/\s+/).filter(w => w.length > 0);
    if (words.length < 10) return false; // Too short to judge
    
    // Check if there's any reasonable menu content (prices, food words, etc.)
    const hasPrices = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(yuan|dollar|usd)/gi.test(text);
    const hasFoodWords = /(chicken|beef|pork|shrimp|rice|noodle|soup|dish|appetizer|entree)/gi.test(text);
    
    // If it has prices or food words, it's likely valid menu content even with OCR errors
    if (hasPrices || hasFoodWords) {
      return false; // Not garbled, just OCR with some errors
    }
    
    // Check for extremely high garbled ratio (more than 50% single chars)
    const singleCharWords = words.filter(w => w.length === 1 && /[a-z]/i.test(w));
    if (singleCharWords.length > words.length * 0.5) {
      return true; // Too garbled
    }
  } else {
    // For regular HTML text, use stricter validation
    const garbledPattern = /[bcdfghjklmnpqrstvwxyz]{5,}/gi;
    const garbledMatches = text.match(garbledPattern);
    if (garbledMatches && garbledMatches.length > 5) {
      return true;
    }
    
    const words = text.split(/\s+/);
    const singleCharWords = words.filter(w => w.length === 1 && /[a-z]/i.test(w));
    if (singleCharWords.length > words.length * 0.3) {
      return true;
    }
  }
  
  // Check for excessive random punctuation or special characters (applies to both)
  const randomChars = text.match(/[^a-z0-9\s\.\,\$]{4,}/gi);
  if (randomChars && randomChars.length > 15) {
    return true;
  }
  
  return false;
}

/**
 * Check if content is relevant to a menu
 * More lenient for OCR text which may have imperfect keyword matching
 */
function isMenuRelevant(text, structuredData, isOCRText = false) {
  if (!text || text.length < 50) return false;
  
  const textLower = text.toLowerCase();
  
  // Menu-related keywords (expanded list)
  const menuKeywords = [
    'menu', 'appetizer', 'entree', 'main course', 'dessert',
    'price', '$', 'dollar', 'dish', 'item', 'order',
    'soup', 'rice', 'noodle', 'chicken', 'beef', 'pork',
    'shrimp', 'vegetable', 'lunch', 'dinner', 'special',
    'buffet', 'combo', 'platter', 'serving', 'fried',
    'sweet', 'sour', 'sauce', 'steamed', 'roasted',
    'wonton', 'dumpling', 'roll', 'spring roll', 'egg roll'
  ];
  
  // Count menu keyword matches
  let keywordMatches = 0;
  menuKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) {
      keywordMatches++;
    }
  });
  
  // Check for price patterns (strong indicator of menu)
  const pricePattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(yuan|dollar|usd)/gi;
  const hasPrices = pricePattern.test(text);
  
  // For OCR text, be more lenient - if it has prices or substantial length, it's likely a menu
  if (isOCRText) {
    // OCR text with prices is almost certainly a menu
    if (hasPrices && text.length > 500) {
      return true;
    }
    // OCR text with some keywords and good length
    if (keywordMatches >= 2 && text.length > 1000) {
      return true;
    }
    // Very long OCR text is likely menu content even with fewer keywords
    if (text.length > 3000) {
      return true;
    }
  } else {
    // For regular HTML text, need at least 3 menu-related keywords
    if (keywordMatches < 3 && !hasPrices) {
      return false;
    }
  }
  
  // Check structured data
  if (structuredData) {
    const items = structuredData.items || [];
    const categories = structuredData.categories || [];
    
    // If we have structured items, check if they look like menu items
    if (items.length > 0) {
      // Check if items have reasonable names (more lenient for OCR)
      const validItems = items.filter(item => {
        const name = (item.name || '').trim();
        // Skip if name is too short, too long
        if (name.length < 2 || name.length > 150) return false;
        // Skip if it's clearly an error message
        if (name.toLowerCase().includes('oops') || 
            name.toLowerCase().includes('error') || 
            name.toLowerCase().includes('404')) return false;
        // For OCR, allow some special characters (common in OCR errors)
        if (!isOCRText && /^[^a-z0-9\s]{3,}$/i.test(name)) return false;
        return true;
      });
      
      // For OCR text, accept if we have at least 1 valid item (OCR parsing is imperfect)
      const minItems = isOCRText ? 1 : 2;
      if (validItems.length < minItems) {
        // But if we have prices and substantial text, still consider it valid
        if (isOCRText && hasPrices && text.length > 1000) {
          return true;
        }
        return false;
      }
    } else {
      // No structured items, rely on text analysis
      if (!hasPrices && !isOCRText) {
        // No prices found, might not be a menu (unless it's OCR)
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Validate menu data before saving
 */
function validateMenuData(result, statusCode) {
  const validationErrors = [];
  
  // Check for 404 errors
  if (statusCode === 404) {
    validationErrors.push('404 error - page not found');
  }
  
  // Check if scraping was successful
  if (!result.success) {
    validationErrors.push(`Scraping failed: ${result.errorMessage || 'Unknown error'}`);
    return { valid: false, errors: validationErrors };
  }
  
  // Check if text came from OCR (indicated by processed images)
  const isOCRText = result.processedImages && result.processedImages.some(img => img.success);
  
  // Check for garbled text (more lenient for OCR)
  if (result.rawText && isGarbledText(result.rawText, isOCRText)) {
    validationErrors.push('Text appears to be garbled (likely OCR errors or JavaScript rendering issues)');
  }
  
  // Check for menu relevance (more lenient for OCR)
  if (!isMenuRelevant(result.rawText, result.structuredData, isOCRText)) {
    validationErrors.push('Content does not appear to be menu-related');
  }
  
  // Check structured data quality (more lenient for OCR)
  if (result.structuredData) {
    const items = result.structuredData.items || [];
    const categories = result.structuredData.categories || [];
    
    // Need at least some structured data
    if (items.length === 0 && categories.length === 0) {
      // For OCR text with substantial content, structured parsing might have failed but text is still valid
      if (!isOCRText || result.rawText.length < 1000) {
        validationErrors.push('No menu items or categories found in structured data');
      }
    }
    
    // Check if items are valid (more lenient for OCR)
    if (items.length > 0) {
      const validItems = items.filter(item => {
        const name = (item.name || '').trim();
        if (name.length < 2 || name.length > 150) return false;
        if (name.toLowerCase().includes('oops') ||
            name.toLowerCase().includes('error') ||
            name.toLowerCase().includes('404')) return false;
        // For OCR, allow some special characters
        if (!isOCRText && /^[^a-z0-9\s]{3,}$/i.test(name)) return false;
        return true;
      });
      
      // For OCR text, accept 1 item if we have substantial text and prices
      const minItems = isOCRText ? 1 : 2;
      if (validItems.length < minItems) {
        // Exception: OCR text with prices and substantial length
        if (isOCRText && validItems.length === 1 && 
            /\$[\d,]+\.?\d*/.test(result.rawText) && 
            result.rawText.length > 2000) {
          // Accept it
        } else {
          validationErrors.push(`Only ${validItems.length} valid menu item(s) found (need at least ${minItems})`);
        }
      }
    }
  } else {
    // For OCR text with substantial content, structured parsing might have failed
    if (!isOCRText || result.rawText.length < 1000) {
      validationErrors.push('No structured data available');
    }
  }
  
  return {
    valid: validationErrors.length === 0,
    errors: validationErrors
  };
}

/**
 * Extract image URLs from HTML that might contain menu images
 * Filters out logos, icons, and other non-menu images
 */
function findMenuImages($, baseUrl) {
  const images = [];
  const seenUrls = new Set();
  
  // Patterns to exclude (logos, icons, etc.)
  const excludePatterns = [
    /logo/i,
    /icon/i,
    /avatar/i,
    /profile/i,
    /favicon/i,
    /button/i,
    /arrow/i,
    /chevron/i,
    /\.svg$/i,
    /\.ico$/i,
    /transparent/i,
    /placeholder/i
  ];
  
  // Priority selectors for menu images
  const imageSelectors = [
    'img[src*="menu"]',
    'img[alt*="menu" i]',
    '.menu img',
    '#menu img',
    '[class*="menu"] img',
    '[id*="menu"] img'
  ];
  
  // First, get menu-specific images
  for (const selector of imageSelectors) {
    $(selector).each((i, elem) => {
      const $img = $(elem);
      let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('data-original');
      
      if (src && !seenUrls.has(src)) {
        // Skip excluded patterns
        if (excludePatterns.some(pattern => pattern.test(src) || pattern.test($img.attr('alt') || ''))) {
          return;
        }
        
        try {
          const url = new URL(src, baseUrl);
          const width = parseInt($img.attr('width')) || null;
          const height = parseInt($img.attr('height')) || null;
          
          // Prefer larger images (likely menu pages)
          const isLarge = width > 400 || height > 400;
          
          images.push({
            url: url.href,
            alt: $img.attr('alt') || '',
            width,
            height,
            isLarge,
            priority: true // Menu-specific images get priority
          });
          seenUrls.add(src);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
  }
  
  // If we found menu-specific images, return them
  if (images.length > 0) {
    // Sort by priority and size
    return images.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return (b.isLarge ? 1 : 0) - (a.isLarge ? 1 : 0);
    });
  }
  
  // Fallback: get other images but filter out obvious non-menu images
  $('img').each((i, elem) => {
    const $img = $(elem);
    let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
    
    if (src && !seenUrls.has(src)) {
      // Skip excluded patterns
      if (excludePatterns.some(pattern => pattern.test(src) || pattern.test($img.attr('alt') || ''))) {
        return;
      }
      
      try {
        const url = new URL(src, baseUrl);
        const width = parseInt($img.attr('width')) || null;
        const height = parseInt($img.attr('height')) || null;
        const isLarge = width > 400 || height > 400;
        
        // Prefer larger images
        if (isLarge || images.length < 5) {
          images.push({
            url: url.href,
            alt: $img.attr('alt') || '',
            width,
            height,
            isLarge,
            priority: false
          });
          seenUrls.add(src);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });
  
  // Sort by size (larger first)
  return images.sort((a, b) => (b.isLarge ? 1 : 0) - (a.isLarge ? 1 : 0)).slice(0, 10);
}

/**
 * Extract text from HTML
 * Returns object with text and image URLs if found
 */
async function extractTextFromHTML(buffer, url) {
  try {
    const html = buffer.toString('utf8');
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Try to find menu-specific content
    // Look for common menu containers
    let menuText = '';
    const menuSelectors = [
      'menu', '.menu', '#menu',
      '.menu-content', '#menu-content',
      '.menu-items', '#menu-items',
      'main', 'article', '.content'
    ];
    
    for (const selector of menuSelectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        menuText = element.text();
        if (menuText.length > 100) {
          break;
        }
      }
    }
    
    // Fallback to body text if no menu-specific content found
    if (menuText.length < 100) {
      menuText = $('body').text();
    }
    
    // Check if page has menu images (common for restaurants)
    const menuImages = findMenuImages($, url);
    
    return {
      text: cleanMenuText(menuText),
      images: menuImages,
      hasImages: menuImages.length > 0
    };
  } catch (error) {
    throw new Error(`HTML parsing error: ${error.message}`);
  }
}

/**
 * Extract text from PDF
 */
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return cleanMenuText(data.text);
  } catch (error) {
    throw new Error(`PDF parsing error: ${error.message}`);
  }
}

/**
 * Extract text from image using OCR
 */
async function extractTextFromImage(buffer) {
  try {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return cleanMenuText(text);
  } catch (error) {
    throw new Error(`OCR error: ${error.message}`);
  }
}

/**
 * Check if HTML contains menu-related content
 */
function hasMenuContentInHTML(text) {
  if (!text || text.length < 100) return false;
  
  const textLower = text.toLowerCase();
  
  // Menu-related keywords
  const menuKeywords = [
    'menu', 'appetizer', 'entree', 'main course', 'dessert',
    'price', '$', 'dollar', 'dish', 'item', 'order',
    'soup', 'rice', 'noodle', 'chicken', 'beef', 'pork',
    'shrimp', 'vegetable', 'lunch', 'dinner', 'special',
    'buffet', 'combo', 'platter', 'serving', 'fried',
    'sweet', 'sour', 'sauce', 'steamed', 'roasted',
    'wonton', 'dumpling', 'roll', 'spring roll', 'egg roll'
  ];
  
  // Count menu keyword matches
  let keywordMatches = 0;
  menuKeywords.forEach(keyword => {
    if (textLower.includes(keyword)) {
      keywordMatches++;
    }
  });
  
  // Need at least 3 menu-related keywords
  if (keywordMatches < 3) {
    return false;
  }
  
  // Check for price patterns (strong indicator)
  const pricePattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(yuan|dollar|usd)/gi;
  if (!pricePattern.test(text)) {
    // No prices found, might not be a menu
    return false;
  }
  
  return true;
}

/**
 * Check if page likely requires JavaScript
 */
function likelyRequiresJavaScript(html) {
  if (!html || html.length < 100) return false;
  
  // Check for common JavaScript framework indicators
  const jsIndicators = [
    /<script[^>]*>[\s\S]*?<\/script>/i,
    /react|vue|angular|__next|gatsby/i,
    /data-react|data-vue|ng-app/i,
    /window\.__INITIAL_STATE__/i,
    /<noscript>/i
  ];
  
  const hasScripts = /<script/i.test(html);
  const hasFramework = jsIndicators.some(pattern => pattern.test(html));
  
  // Check if body content is very minimal (likely JS-rendered)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1];
    const textContent = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    if (textContent.trim().length < 200 && hasScripts) {
      return true;
    }
  }
  
  return hasFramework && hasScripts;
}

/**
 * Scrape menu from URL
 */
async function scrapeMenu(url, placeId) {
  let contentType = 'HTML';
  let rawText = '';
  let errorMessage = null;
  let processedImages = [];
  let statusCode = null;
  let usedPuppeteer = false;

  try {
    console.log(`  Fetching: ${url}`);
    let fetchResult;
    
    try {
      // First try regular HTTP fetch
      fetchResult = await fetchContent(url);
      contentType = fetchResult.contentType;
      statusCode = fetchResult.statusCode;
      
      console.log(`  Content type: ${contentType}`);
      console.log(`  HTTP Status: ${statusCode}`);
      
      // Check for 404 early
      if (statusCode === 404) {
        throw new Error('404 error - page not found');
      }
      
      // Check if page likely requires JavaScript - if so, use Puppeteer
      const html = fetchResult.buffer.toString('utf8');
      if (likelyRequiresJavaScript(html)) {
        console.log(`  Page appears to require JavaScript, trying Puppeteer...`);
        try {
          fetchResult = await fetchContentWithPuppeteer(url);
          usedPuppeteer = true;
          contentType = fetchResult.contentType;
          statusCode = fetchResult.statusCode;
          console.log(`  ✓ Puppeteer fetch successful`);
        } catch (puppeteerError) {
          console.log(`  ⚠️  Puppeteer failed: ${puppeteerError.message}, using original HTML`);
          // Continue with original HTML
        }
      }
    } catch (fetchError) {
      // If fetch fails (and not 404), try Puppeteer as fallback
      if (!fetchError.message.includes('404')) {
        console.log(`  HTTP fetch failed, trying Puppeteer...`);
        try {
          fetchResult = await fetchContentWithPuppeteer(url);
          usedPuppeteer = true;
          contentType = fetchResult.contentType;
          statusCode = fetchResult.statusCode;
          console.log(`  ✓ Puppeteer fetch successful`);
        } catch (puppeteerError) {
          throw fetchError; // Throw original error
        }
      } else {
        throw fetchError;
      }
    }
    
    const buffer = fetchResult.buffer;

    // Extract text based on content type
    switch (contentType) {
      case 'HTML':
        {
          const htmlResult = await extractTextFromHTML(buffer, url);
          rawText = htmlResult.text;
          
          console.log(`  Extracted HTML text: ${rawText.length} characters`);
          
          // Check if HTML contains menu-related content before proceeding
          if (!hasMenuContentInHTML(rawText)) {
            throw new Error('No menu-related content found in HTML - skipping record');
          }
          
          console.log(`  ✓ Menu content detected in HTML`);
        }
        break;
      case 'PDF':
        rawText = await extractTextFromPDF(buffer);
        break;
      case 'IMAGE':
        rawText = await extractTextFromImage(buffer);
        break;
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }

    if (!rawText || rawText.trim().length < 10) {
      throw new Error('No text extracted from menu');
    }

    console.log(`  Extracted ${rawText.length} characters total`);

    // Parse into structured format
    const structuredData = parseMenuStructure(rawText, url);
    
    // Add image processing metadata if images were processed
    if (processedImages.length > 0) {
      structuredData.metadata.imagesProcessed = processedImages.length;
      structuredData.metadata.imagesSuccessful = processedImages.filter(img => img.success).length;
    }
    
    return {
      success: true,
      contentType,
      rawText,
      structuredData,
      processedImages: processedImages.length > 0 ? processedImages : undefined,
      errorMessage: null,
      statusCode,
      usedPuppeteer
    };
  } catch (error) {
    errorMessage = error.message;
    console.error(`  Error: ${errorMessage}`);
    return {
      success: false,
      contentType,
      rawText: rawText || '',
      structuredData: null,
      processedImages: processedImages.length > 0 ? processedImages : undefined,
      errorMessage,
      statusCode: statusCode || null,
      usedPuppeteer: false
    };
  }
}

/**
 * Save menu to InstantDB
 */
async function saveMenuToDB(placeId, url, result) {
  try {
    // Validate menu data before saving
    const validation = validateMenuData(result, result.statusCode || null);
    
    if (!validation.valid) {
      console.log(`  ⚠️  Validation failed - not saving to database:`);
      validation.errors.forEach(error => {
        console.log(`     - ${error}`);
      });
      return { 
        skipped: true, 
        reason: 'validation_failed',
        errors: validation.errors 
      };
    }
    
    // Check if menu already exists for this placeId
    const existing = await db.query({
      menus: {
        $: {
          where: { placeId: placeId }
        }
      }
    });

    if (existing.menus && existing.menus.length > 0) {
      console.log(`  Menu already exists for placeId ${placeId}, skipping...`);
      return { skipped: true, reason: 'already_exists' };
    }

    const menuId = id();
    const menuData = {
      placeId,
      sourceUrl: url,
      contentType: result.contentType,
      rawText: result.rawText || null,
      structuredData: JSON.stringify(result.structuredData || {}),
      categories: result.structuredData?.categories ? JSON.stringify(result.structuredData.categories) : null,
      items: result.structuredData?.items ? JSON.stringify(result.structuredData.items) : null,
      scrapedAt: new Date().toISOString(),
      status: result.success ? 'SUCCESS' : 'FAILED',
      errorMessage: result.errorMessage || null
    };

    await db.transact([
      db.tx.menus[menuId].create(menuData)
    ]);

    console.log(`  ✓ Saved menu to database (ID: ${menuId})`);
    return { saved: true, menuId };
  } catch (error) {
    // If schema not synced, log but don't fail the entire process
    if (error.message.includes('schema') || error.message.includes('Attributes are missing')) {
      console.log(`  ⚠ Schema not synced - menu data extracted but not saved. Run schema sync first.`);
      console.log(`  Menu data: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.rawText?.length || 0} chars, ${result.structuredData?.items?.length || 0} items`);
      return { skipped: true, reason: 'schema_not_synced' };
    }
    console.error(`  Error saving to database: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Process menu URLs
 */
async function processMenuUrls(urls) {
  const total = urls.length;
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  console.log(`\nProcessing ${total} menu URLs...\n`);

  for (const { url, placeId } of urls) {
    processed++;
    console.log(`[${processed}/${total}] Processing menu for placeId: ${placeId}`);

    try {
      // Scrape menu
      const result = await scrapeMenu(url, placeId);

      // Save to database
      const saveResult = await saveMenuToDB(placeId, url, result);

      if (saveResult.skipped) {
        skippedCount++;
        if (saveResult.reason === 'validation_failed') {
          console.log(`  ⚠️  Skipped due to validation: ${saveResult.errors?.join(', ') || 'Unknown'}`);
        }
      } else if (result.success && saveResult.saved) {
        successCount++;
      } else {
        failedCount++;
      }

      // Delay between requests
      if (processed < total) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
      }
    } catch (error) {
      console.error(`  Fatal error: ${error.message}`);
      failedCount++;
    }

    // Progress update
    if (processed % CONFIG.batchSize === 0) {
      console.log(`\nProgress: ${processed}/${total} (${((processed/total)*100).toFixed(1)}%)`);
      console.log(`  Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}\n`);
    }
  }

  console.log(`\n✅ Processing complete!`);
  console.log(`  Total: ${total}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`  Skipped: ${skippedCount}`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  let urls = [];

  // Parse command line arguments
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/scrape-menus.js [options]

Options:
  --urls-file <path>    Path to JSON file with menu URLs
  --url <url>           Single URL to scrape (requires --place-id)
  --place-id <id>       Place ID for single URL
  --help, -h            Show this help message

Example:
  node scripts/scrape-menus.js --urls-file data/menu-urls.json
  node scripts/scrape-menus.js --url "https://example.com/menu" --place-id "ChIJ..."
    `);
    process.exit(0);
  }

  // Single URL mode
  const urlIndex = args.indexOf('--url');
  const placeIdIndex = args.indexOf('--place-id');
  if (urlIndex !== -1 && placeIdIndex !== -1) {
    const url = args[urlIndex + 1];
    const placeId = args[placeIdIndex + 1];
    if (url && placeId) {
      urls = [{ url, placeId }];
    }
  }

  // File mode
  const urlsFileIndex = args.indexOf('--urls-file');
  if (urlsFileIndex !== -1 && urls.length === 0) {
    const filePath = args[urlsFileIndex + 1];
    if (filePath && fs.existsSync(filePath)) {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // Support different file formats
      if (Array.isArray(fileData)) {
        urls = fileData.map(item => ({
          url: item.url || item.menu1 || item.menu2,
          placeId: item.placeId || item.PlaceID
        })).filter(item => item.url && item.placeId);
      }
    }
  }

  // Default: read from buffets-urls-websites.json
  if (urls.length === 0) {
    const defaultPath = path.join(__dirname, '../data/buffets-urls-websites.json');
    if (fs.existsSync(defaultPath)) {
      console.log('Reading menu URLs from buffets-urls-websites.json...');
      const fileData = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
      urls = fileData
        .filter(item => {
          const hasMenu1 = item.menu1 && item.menu1_check === 'OK';
          const hasMenu2 = item.menu2 && item.menu2_check === 'OK';
          return hasMenu1 || hasMenu2;
        })
        .map(item => ({
          url: item.menu1_check === 'OK' ? item.menu1 : item.menu2,
          placeId: item.PlaceID
        }))
        .filter(item => item.url && item.placeId);
    }
  }

  if (urls.length === 0) {
    console.error('No menu URLs found. Please provide URLs via --urls-file or --url/--place-id');
    process.exit(1);
  }

  console.log(`Found ${urls.length} menu URLs to process`);

  // Process URLs
  await processMenuUrls(urls);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  scrapeMenu,
  saveMenuToDB,
  processMenuUrls
};

