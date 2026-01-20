// Test script to scrape a menu URL and display results without saving to DB
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
let tesseract = null;
try {
  tesseract = require('tesseract.js');
} catch (e) {
  console.warn('Warning: tesseract.js not installed. OCR functionality will be disabled.');
  console.warn('Install with: npm install tesseract.js\n');
}
const { parseMenuStructure, cleanMenuText } = require('./parse-menu-structure');

const CONFIG = {
  requestTimeout: 30000,
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
 * Fetch content from URL
 */
async function fetchContent(url) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        method: 'GET',
        timeout: CONFIG.requestTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      };

      const req = protocol.request(url, options, (res) => {
        const chunks = [];
        let headers = res.headers;
        
        res.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        res.on('end', () => {
          const detectedType = detectContentType(url, headers);
          const buffer = Buffer.concat(chunks);
          resolve({
            contentType: detectedType,
            buffer,
            headers
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
  });
}

/**
 * Find menu images in HTML
 */
function findMenuImages($, baseUrl) {
  const images = [];
  const imageSelectors = [
    'img[src*="menu"]',
    'img[alt*="menu" i]',
    '.menu img',
    '#menu img',
    'main img',
    'article img',
    '.content img',
    'img' // Fallback to all images
  ];
  
  for (const selector of imageSelectors) {
    $(selector).each((i, elem) => {
      const $img = $(elem);
      let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
      
      if (src) {
        try {
          const url = new URL(src, baseUrl);
          images.push({
            url: url.href,
            alt: $img.attr('alt') || '',
            width: $img.attr('width') || null,
            height: $img.attr('height') || null
          });
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
    
    if (images.length > 0) break;
  }
  
  // Remove duplicates
  const uniqueImages = [];
  const seenUrls = new Set();
  for (const img of images) {
    if (!seenUrls.has(img.url)) {
      seenUrls.add(img.url);
      uniqueImages.push(img);
    }
  }
  
  return uniqueImages;
}

/**
 * Extract text from image using OCR
 */
async function extractTextFromImage(buffer) {
  if (!tesseract) {
    throw new Error('tesseract.js is not installed. Please run: npm install tesseract.js');
  }
  try {
    const worker = await tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return cleanMenuText(text);
  } catch (error) {
    throw new Error(`OCR error: ${error.message}`);
  }
}

/**
 * Extract text from HTML using Cheerio
 */
async function extractTextFromHTML(buffer, url) {
  try {
    const html = buffer.toString('utf8');
    const $ = cheerio.load(html);
    
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Try to find menu-specific content
    let menuText = '';
    const menuSelectors = [
      'menu', '.menu', '#menu',
      '.menu-content', '#menu-content',
      '.menu-items', '#menu-items',
      '.menusifu', '#menusifu',
      '[class*="menu"]', '[id*="menu"]',
      'main', 'article', '.content',
      'body'
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
    
    // Also try to get all text from common content containers
    if (menuText.length < 100) {
      const allText = $('div, p, span, li, td').map((i, el) => $(el).text()).get().join(' ');
      if (allText.length > menuText.length) {
        menuText = allText;
      }
    }
    
    // Check for menu images
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
 * Extract text from HTML using Puppeteer (for JavaScript-rendered content)
 */
async function extractTextFromHTMLWithPuppeteer(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      ignoreDefaultArgs: ['--disable-extensions']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Wait a bit more for dynamic content
    await page.waitForTimeout(3000);
    
    // Extract text from the page
    const menuText = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      
      // Try to find menu-specific content
      const menuSelectors = [
        'menu', '.menu', '#menu',
        '.menu-content', '#menu-content',
        '.menu-items', '#menu-items',
        '.menusifu', '#menusifu',
        '[class*="menu"]', '[id*="menu"]',
        'main', 'article', '.content',
        'body'
      ];
      
      for (const selector of menuSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.innerText || element.textContent || '';
          if (text.trim().length > 100) {
            return text;
          }
        }
      }
      
      // Fallback to body
      return document.body.innerText || document.body.textContent || '';
    });
    
    await browser.close();
    return cleanMenuText(menuText);
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    throw new Error(`Puppeteer extraction error: ${error.message}`);
  }
}

/**
 * Scrape menu from URL
 */
async function scrapeMenu(url) {
  let contentType = 'HTML';
  let rawText = '';
  let errorMessage = null;

  try {
    console.log(`Fetching: ${url}`);
    const result = await fetchContent(url);
    const detectedType = result.contentType;
    const buffer = result.buffer;
    contentType = detectedType;

    console.log(`Content type: ${contentType}`);

    // Extract text based on content type
    switch (contentType) {
      case 'HTML':
        {
          // Extract HTML content and check for images
          const htmlResult = await extractTextFromHTML(buffer, url);
          
          console.log(`  HTML text extracted: ${htmlResult.text.length} characters`);
          
          // If HTML page has menu images, process them with OCR
          if (htmlResult.hasImages && htmlResult.images.length > 0) {
            console.log(`  Found ${htmlResult.images.length} potential menu image(s), processing with OCR...`);
            
            let allImageText = [];
            const imagesToProcess = htmlResult.images.slice(0, 3); // Limit to 3 for testing
            
            for (let i = 0; i < imagesToProcess.length; i++) {
              const img = imagesToProcess[i];
              try {
                console.log(`    Processing image ${i + 1}/${imagesToProcess.length}: ${img.url}`);
                const { buffer: imageBuffer } = await fetchContent(img.url);
                const imageText = await extractTextFromImage(imageBuffer);
                
                if (imageText && imageText.trim().length > 10) {
                  allImageText.push(imageText);
                  console.log(`    ✓ Extracted ${imageText.length} characters from image`);
                } else {
                  console.log(`    ✗ No text extracted from image`);
                }
                
                // Small delay between image requests
                if (i < imagesToProcess.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              } catch (imgError) {
                console.log(`    ✗ Error processing image: ${imgError.message}`);
              }
            }
            
            // Combine HTML text and image text
            if (allImageText.length > 0) {
              rawText = [htmlResult.text, ...allImageText].filter(t => t.trim().length > 0).join('\n\n');
              console.log(`  Combined text from HTML and ${allImageText.length} image(s): ${rawText.length} characters`);
            } else {
              // Fallback to HTML text if image processing failed
              rawText = htmlResult.text;
              console.log(`  Image processing failed, using HTML text only`);
            }
          } else {
            // No images found, use HTML text only
            rawText = htmlResult.text;
            
            // If we got very little text, it's likely JavaScript-rendered, use Puppeteer
            if (rawText.length < 200) {
              console.log('  Detected JavaScript-rendered content, attempting Puppeteer...');
              try {
                rawText = await extractTextFromHTMLWithPuppeteer(url);
              } catch (puppeteerError) {
                console.log(`  Puppeteer failed: ${puppeteerError.message}`);
                console.log('  Using extracted HTML text');
              }
            }
          }
        }
        break;
      case 'IMAGE':
        rawText = await extractTextFromImage(buffer);
        break;
      default:
        throw new Error(`Unsupported content type for this test: ${contentType}`);
    }

    if (!rawText || rawText.trim().length < 10) {
      throw new Error('No text extracted from menu');
    }

    console.log(`Extracted ${rawText.length} characters\n`);

    // Parse into structured format
    const structuredData = parseMenuStructure(rawText, url);
    
    return {
      success: true,
      contentType,
      rawText,
      structuredData,
      errorMessage: null
    };
  } catch (error) {
    errorMessage = error.message;
    console.error(`Error: ${errorMessage}`);
    return {
      success: false,
      contentType,
      rawText: rawText || '',
      structuredData: null,
      errorMessage
    };
  }
}

/**
 * Main function
 */
async function main() {
  const url = process.argv[2] || 'https://www.chensfamilydishsalem.com/menu/';
  
  console.log('='.repeat(80));
  console.log('Menu Scraping Test');
  console.log('='.repeat(80));
  console.log(`URL: ${url}\n`);

  const result = await scrapeMenu(url);

  if (result.success) {
    console.log('='.repeat(80));
    console.log('RAW TEXT (first 1000 characters):');
    console.log('='.repeat(80));
    console.log(result.rawText.substring(0, 1000));
    if (result.rawText.length > 1000) {
      console.log('...');
    }
    console.log('\n');

    console.log('='.repeat(80));
    console.log('STRUCTURED DATA:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(result.structuredData, null, 2));
    console.log('\n');

    console.log('='.repeat(80));
    console.log('SUMMARY:');
    console.log('='.repeat(80));
    console.log(`Content Type: ${result.contentType}`);
    console.log(`Raw Text Length: ${result.rawText.length} characters`);
    console.log(`Categories Found: ${result.structuredData.categories?.length || 0}`);
    console.log(`Total Items: ${result.structuredData.items?.length || 0}`);
    console.log(`Parsing Status: ${result.structuredData.metadata?.parsingStatus || 'UNKNOWN'}`);
    
    if (result.structuredData.categories && result.structuredData.categories.length > 0) {
      console.log('\nCategories:');
      result.structuredData.categories.forEach((cat, idx) => {
        console.log(`  ${idx + 1}. ${cat.name} (${cat.items?.length || 0} items)`);
      });
    }
  } else {
    console.log('='.repeat(80));
    console.log('ERROR:');
    console.log('='.repeat(80));
    console.log(result.errorMessage);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { scrapeMenu };

