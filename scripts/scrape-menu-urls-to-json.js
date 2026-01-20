// Script to scrape menu data from menu_urls.json and store structured data in the JSON file
// Run with: node scripts/scrape-menu-urls-to-json.js [--limit 20]

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');
const pdf = require('pdf-parse');
const puppeteer = require('puppeteer');
const { createWorker } = require('tesseract.js');
const { parseMenuStructure, cleanMenuText } = require('./parse-menu-structure');

// Configuration
const CONFIG = {
  delayBetweenRequests: 2000, // 2 seconds
  requestTimeout: 30000, // 30 seconds
  maxRetries: 3,
  limit: 20, // Process first 20 records
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
 * Check if page is picture-only menu (no text content)
 */
function isPictureOnlyMenu($, html) {
  // Remove script and style elements
  $('script, style').remove();
  
  // Get all text content
  const textContent = $('body').text().trim();
  
  // Check if there's substantial text (more than 200 characters)
  if (textContent.length > 200) {
    return false; // Has text content
  }
  
  // Check for menu images
  const menuImageSelectors = [
    'img[src*="menu"]',
    'img[alt*="menu" i]',
    '.menu img',
    '#menu img',
    '[class*="menu"] img',
    '[id*="menu"] img'
  ];
  
  let hasMenuImages = false;
  for (const selector of menuImageSelectors) {
    if ($(selector).length > 0) {
      hasMenuImages = true;
      break;
    }
  }
  
  // If there's minimal text but menu images, it's likely a picture-only menu
  if (hasMenuImages && textContent.length < 200) {
    return true;
  }
  
  // Check if page is mostly images
  const allImages = $('img').length;
  const allText = textContent.length;
  
  // If there are many images but very little text, likely picture-only
  if (allImages > 2 && allText < 100) {
    return true;
  }
  
  return false;
}

/**
 * Extract text from image using OCR
 */
async function extractTextFromImage(buffer) {
  try {
    console.log(`  Processing image with OCR...`);
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return cleanMenuText(text);
  } catch (error) {
    throw new Error(`OCR error: ${error.message}`);
  }
}

/**
 * Extract text from HTML
 */
async function extractTextFromHTML(buffer, url) {
  try {
    const html = buffer.toString('utf8');
    const $ = cheerio.load(html);
    
    // Check if it's a picture-only menu
    if (isPictureOnlyMenu($, html)) {
      console.log(`  Picture-only menu detected - extracting text from images with OCR...`);
      
      // Find menu images
      const menuImages = findMenuImages($, url);
      
      if (menuImages.length === 0) {
        console.log(`  ⚠️  No menu images found`);
        return {
          text: '',
          isPictureOnly: true,
          processedImages: []
        };
      }
      
      console.log(`  Found ${menuImages.length} menu image(s) - processing with OCR...`);
      
      // Process images with OCR
      const processedImages = [];
      let allText = '';
      
      for (let i = 0; i < Math.min(menuImages.length, 5); i++) { // Limit to 5 images max
        const imageInfo = menuImages[i];
        try {
          console.log(`  Processing image ${i + 1}/${Math.min(menuImages.length, 5)}: ${imageInfo.url}`);
          
          // Fetch the image
          const imageResult = await fetchContent(imageInfo.url);
          
          if (imageResult.contentType === 'IMAGE') {
            // Extract text using OCR
            const imageText = await extractTextFromImage(imageResult.buffer);
            
            if (imageText && imageText.trim().length > 50) {
              allText += imageText + '\n\n';
              processedImages.push({
                url: imageInfo.url,
                success: true,
                textLength: imageText.length
              });
              console.log(`  ✓ Extracted ${imageText.length} characters from image`);
            } else {
              processedImages.push({
                url: imageInfo.url,
                success: false,
                error: 'No text extracted'
              });
              console.log(`  ⚠️  No text extracted from image`);
            }
          } else {
            processedImages.push({
              url: imageInfo.url,
              success: false,
              error: 'Not an image'
            });
            console.log(`  ⚠️  URL is not an image`);
          }
          
          // Small delay between image processing
          if (i < Math.min(menuImages.length, 5) - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          console.log(`  ⚠️  Error processing image: ${error.message}`);
          processedImages.push({
            url: imageInfo.url,
            success: false,
            error: error.message
          });
        }
      }
      
      if (allText.trim().length > 0) {
        console.log(`  ✓ Total OCR text extracted: ${allText.length} characters from ${processedImages.filter(img => img.success).length} image(s)`);
        return {
          text: allText.trim(),
          isPictureOnly: true,
          processedImages
        };
      } else {
        console.log(`  ⚠️  No text extracted from any images`);
        return {
          text: '',
          isPictureOnly: true,
          processedImages
        };
      }
    }
    
    // Remove script and style elements
    $('script, style').remove();
    
    // Try to find menu-specific content
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
    
    return {
      text: cleanMenuText(menuText),
      isPictureOnly: false,
      processedImages: []
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
 * Scrape menu from URL
 */
async function scrapeMenu(url, placeId) {
  let contentType = 'HTML';
  let rawText = '';
  let errorMessage = null;
  let statusCode = null;
  let usedPuppeteer = false;
  let isPictureOnly = false;

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
      if (contentType === 'HTML') {
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
      }
    } catch (fetchError) {
      // If fetch fails (and not 404), try Puppeteer as fallback
      if (!fetchError.message.includes('404') && contentType === 'HTML') {
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
    let processedImages = [];
    switch (contentType) {
      case 'HTML':
        {
          const htmlResult = await extractTextFromHTML(buffer, url);
          rawText = htmlResult.text;
          isPictureOnly = htmlResult.isPictureOnly;
          processedImages = htmlResult.processedImages || [];
          
          if (isPictureOnly) {
            // If OCR was used but no text extracted, still return success with note
            if (!rawText || rawText.trim().length < 10) {
              console.log(`  ⚠️  Picture-only menu - OCR extraction failed or no text found`);
              return {
                success: true,
                contentType,
                rawText: '',
                structuredData: null,
                isPictureOnly: true,
                processedImages: processedImages,
                errorMessage: null,
                statusCode,
                usedPuppeteer
              };
            }
            
            // OCR extracted text successfully
            console.log(`  ✓ Picture-only menu - OCR extracted ${rawText.length} characters`);
          } else {
            console.log(`  Extracted HTML text: ${rawText.length} characters`);
          }
        }
        break;
      case 'PDF':
        rawText = await extractTextFromPDF(buffer);
        console.log(`  Extracted PDF text: ${rawText.length} characters`);
        break;
      case 'IMAGE':
        // Process image with OCR
        console.log(`  Image-only menu detected - extracting text with OCR...`);
        try {
          rawText = await extractTextFromImage(buffer);
          isPictureOnly = true;
          processedImages = [{
            url: url,
            success: true,
            textLength: rawText.length
          }];
          console.log(`  ✓ OCR extracted ${rawText.length} characters from image`);
        } catch (ocrError) {
          console.log(`  ⚠️  OCR failed: ${ocrError.message}`);
          return {
            success: true,
            contentType,
            rawText: '',
            structuredData: null,
            isPictureOnly: true,
            processedImages: [{
              url: url,
              success: false,
              error: ocrError.message
            }],
            errorMessage: `OCR failed: ${ocrError.message}`,
            statusCode,
            usedPuppeteer: false
          };
        }
        break;
      default:
        throw new Error(`Unsupported content type: ${contentType}`);
    }

    if (!rawText || rawText.trim().length < 10) {
      // For picture-only menus, we might have processed images but got no text
      if (isPictureOnly) {
        return {
          success: true,
          contentType,
          rawText: '',
          structuredData: null,
          isPictureOnly: true,
          processedImages: processedImages,
          errorMessage: 'OCR extraction failed or no text found',
          statusCode,
          usedPuppeteer
        };
      }
      throw new Error('No text extracted from menu');
    }

    console.log(`  Extracted ${rawText.length} characters total`);

    // Parse into structured format
    const structuredData = parseMenuStructure(rawText, url);
    
    console.log(`  Parsed ${structuredData.items.length} items in ${structuredData.categories.length} categories`);
    
    return {
      success: true,
      contentType,
      rawText,
      structuredData,
      isPictureOnly: isPictureOnly,
      processedImages: isPictureOnly ? processedImages : undefined,
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
      isPictureOnly: false,
      errorMessage,
      statusCode: statusCode || null,
      usedPuppeteer: false
    };
  }
}

/**
 * Extract URL from menu field (handles both string and object formats)
 */
function extractMenuUrl(menuField) {
  if (typeof menuField === 'string') {
    return menuField;
  }
  if (typeof menuField === 'object' && menuField !== null) {
    return menuField.url || null;
  }
  return null;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1) {
    const limit = parseInt(args[limitIndex + 1]);
    if (!isNaN(limit)) {
      CONFIG.limit = limit;
    }
  }
  
  // Read the menu_urls.json file
  const inputFile = path.join(__dirname, '../Example JSON/menu_urls.json');
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }
  
  console.log(`Reading menu URLs from: ${inputFile}`);
  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  
  if (!Array.isArray(data)) {
    console.error('Error: JSON file must contain an array');
    process.exit(1);
  }
  
  // Process first N records
  const recordsToProcess = data.slice(0, CONFIG.limit);
  console.log(`\nProcessing ${recordsToProcess.length} records...\n`);
  
  const results = [];
  let processed = 0;
  let successCount = 0;
  let failedCount = 0;
  let pictureOnlyCount = 0;
  
  for (const record of recordsToProcess) {
    processed++;
    const title = record.title || 'Unknown';
    const placeId = record.placeID || record.placeId || 'Unknown';
    const menuUrl = extractMenuUrl(record.menu);
    
    // Skip if already has successful scraped menu data with text
    const hasExistingData = record.scrapedMenu && 
                           record.scrapedMenu.success && 
                           record.scrapedMenu.rawText && 
                           record.scrapedMenu.rawText.length > 10;
    
    // Skip if already has good data
    if (hasExistingData) {
      console.log(`[${processed}/${recordsToProcess.length}] ${title} (${placeId}) - Already has menu data, skipping`);
      results.push(record);
      continue;
    }
    
    // Check if it's a picture-only menu that needs OCR
    const isPictureOnlyNeedingOCR = record.scrapedMenu && 
                                    record.scrapedMenu.isPictureOnly && 
                                    (!record.scrapedMenu.rawText || record.scrapedMenu.rawText.length < 10);
    
    console.log(`[${processed}/${recordsToProcess.length}] ${title} (${placeId})`);
    
    if (isPictureOnlyNeedingOCR) {
      console.log(`  📸 Picture-only menu detected - will extract with OCR`);
    }
    
    if (!menuUrl) {
      console.log(`  ⚠️  No menu URL found - skipping`);
      results.push({
        ...record,
        scrapedMenu: {
          success: false,
          errorMessage: 'No menu URL found',
          scrapedAt: new Date().toISOString()
        }
      });
      failedCount++;
      continue;
    }
    
    try {
      // Scrape menu
      const result = await scrapeMenu(menuUrl, placeId);
      
      // Prepare result object
      const scrapedMenu = {
        success: result.success,
        contentType: result.contentType,
        isPictureOnly: result.isPictureOnly || false,
        scrapedAt: new Date().toISOString(),
        usedPuppeteer: result.usedPuppeteer || false,
        statusCode: result.statusCode || null
      };
      
      if (result.isPictureOnly) {
        if (result.rawText && result.rawText.trim().length > 10) {
          // OCR successfully extracted text
          scrapedMenu.rawText = result.rawText;
          scrapedMenu.structuredData = result.structuredData;
          scrapedMenu.note = 'Picture-only menu - text extracted using OCR';
          scrapedMenu.processedImages = result.processedImages || [];
          successCount++;
        } else {
          // OCR failed or no text found
          scrapedMenu.note = 'Picture-only menu - OCR extraction failed or no text found';
          scrapedMenu.processedImages = result.processedImages || [];
          pictureOnlyCount++;
        }
      } else if (result.success) {
        scrapedMenu.rawText = result.rawText;
        scrapedMenu.structuredData = result.structuredData;
        successCount++;
      } else {
        scrapedMenu.errorMessage = result.errorMessage;
        failedCount++;
      }
      
      results.push({
        ...record,
        scrapedMenu
      });
      
      // Delay between requests
      if (processed < recordsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests));
      }
    } catch (error) {
      console.error(`  Fatal error: ${error.message}`);
      results.push({
        ...record,
        scrapedMenu: {
          success: false,
          errorMessage: error.message,
          scrapedAt: new Date().toISOString()
        }
      });
      failedCount++;
    }
    
    console.log(''); // Empty line for readability
  }
  
  // Create output with processed records + remaining records
  const output = [
    ...results,
    ...data.slice(CONFIG.limit)
  ];
  
  // Write back to file
  const outputFile = inputFile; // Overwrite original file
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf8');
  
  console.log(`\n✅ Processing complete!`);
  console.log(`  Total processed: ${processed}`);
  console.log(`  Success: ${successCount}`);
  console.log(`  Picture-only (skipped): ${pictureOnlyCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`\nResults saved to: ${outputFile}`);
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
  extractMenuUrl
};


