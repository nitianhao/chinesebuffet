// Script to analyze menu URLs - check HTML, detect menu images, check for JavaScript
// Analyzes first 3 records from buffets-urls-websites.json

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const cheerio = require('cheerio');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');

/**
 * Fetch HTML content from URL with redirect handling
 */
async function fetchHTML(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let redirectCount = 0;
    
    const makeRequest = (currentUrl) => {
      try {
        const urlObj = new URL(currentUrl);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
          method: 'GET',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          },
          maxRedirects: maxRedirects
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
          
          res.on('data', (chunk) => {
            chunks.push(chunk);
          });
          
          res.on('end', () => {
            const html = Buffer.concat(chunks).toString('utf8');
            resolve({
              html,
              statusCode: res.statusCode,
              headers: res.headers,
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
 * Check if HTML contains menu-related content
 */
function checkMenuContent(html) {
  const $ = cheerio.load(html);
  
  // Remove script and style elements for text analysis
  $('script, style').remove();
  
  // Menu-related keywords
  const menuKeywords = [
    'menu', 'appetizer', 'entree', 'main course', 'dessert',
    'price', '$', 'dollar', 'yuan', 'dish', 'item',
    'soup', 'rice', 'noodle', 'chicken', 'beef', 'pork',
    'shrimp', 'vegetable', 'lunch', 'dinner', 'special'
  ];
  
  // Get all text content
  const bodyText = $('body').text().toLowerCase();
  const title = $('title').text().toLowerCase();
  const h1Text = $('h1').text().toLowerCase();
  
  // Count menu keyword matches
  let keywordMatches = 0;
  menuKeywords.forEach(keyword => {
    const regex = new RegExp(keyword, 'gi');
    if (regex.test(bodyText)) keywordMatches++;
  });
  
  // Check for menu-specific selectors
  const menuSelectors = [
    'menu', '.menu', '#menu',
    '.menu-content', '#menu-content',
    '.menu-items', '#menu-items',
    '.menu-section', '#menu-section',
    '[class*="menu"]', '[id*="menu"]'
  ];
  
  let hasMenuSelector = false;
  let menuSelectorText = '';
  for (const selector of menuSelectors) {
    const element = $(selector).first();
    if (element.length > 0) {
      hasMenuSelector = true;
      menuSelectorText = element.text().trim();
      break;
    }
  }
  
  // Check for price patterns
  const pricePattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(yuan|dollar|usd)/gi;
  const hasPrices = pricePattern.test(bodyText);
  
  // Check for list-like structures (common in menus)
  const listItems = $('li, dt, dd').length;
  const hasLists = listItems > 5;
  
  // Calculate confidence score
  let confidence = 0;
  if (hasMenuSelector) confidence += 40;
  if (keywordMatches >= 5) confidence += 30;
  if (hasPrices) confidence += 20;
  if (hasLists) confidence += 10;
  
  return {
    hasMenuContent: confidence >= 30,
    confidence,
    details: {
      hasMenuSelector,
      menuSelectorText: menuSelectorText.substring(0, 200),
      keywordMatches,
      hasPrices,
      hasLists,
      listItemCount: listItems,
      bodyTextLength: bodyText.length,
      title,
      h1Text
    }
  };
}

/**
 * Find menu images in HTML
 */
function findMenuImages($, baseUrl) {
  const images = [];
  
  // Look for images with menu-related attributes or in menu sections
  const imageSelectors = [
    'img[src*="menu" i]',
    'img[alt*="menu" i]',
    'img[title*="menu" i]',
    '.menu img',
    '#menu img',
    '[class*="menu"] img',
    '[id*="menu"] img',
    'main img',
    'article img',
    '.content img'
  ];
  
  const foundUrls = new Set();
  
  for (const selector of imageSelectors) {
    $(selector).each((i, elem) => {
      const $img = $(elem);
      let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src') || $img.attr('data-original');
      
      if (src && !foundUrls.has(src)) {
        try {
          const url = new URL(src, baseUrl);
          const alt = $img.attr('alt') || '';
          const title = $img.attr('title') || '';
          
          // Check if image seems menu-related
          const isMenuRelated = 
            /menu/i.test(alt) || 
            /menu/i.test(title) || 
            /menu/i.test(src) ||
            selector.includes('menu');
          
          images.push({
            url: url.href,
            alt: alt.substring(0, 100),
            title: title.substring(0, 100),
            isMenuRelated,
            selector
          });
          
          foundUrls.add(src);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
  }
  
  // Also check all images if we haven't found menu-specific ones
  if (images.length === 0) {
    $('img').each((i, elem) => {
      const $img = $(elem);
      let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
      
      if (src && !foundUrls.has(src)) {
        try {
          const url = new URL(src, baseUrl);
          const alt = $img.attr('alt') || '';
          
          // Check image dimensions (menu images are often large)
          const width = parseInt($img.attr('width')) || 0;
          const height = parseInt($img.attr('height')) || 0;
          const isLargeImage = width > 400 || height > 400;
          
          images.push({
            url: url.href,
            alt: alt.substring(0, 100),
            isMenuRelated: false,
            isLargeImage,
            width,
            height
          });
          
          foundUrls.add(src);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
  }
  
  return images.slice(0, 10); // Limit to first 10 images
}

/**
 * Check for JavaScript usage
 */
function checkJavaScript(html) {
  let $;
  try {
    $ = cheerio.load(html || '<html><body></body></html>');
  } catch (e) {
    // If HTML parsing fails, just check the raw HTML
    $ = cheerio.load('<html><body></body></html>');
  }
  
  // Count script tags
  const scriptTags = $('script').length;
  const inlineScripts = $('script').filter((i, el) => !$(el).attr('src')).length;
  const externalScripts = $('script[src]').length;
  
  // Check for common JS frameworks/libraries in raw HTML
  const frameworks = {
    react: /react|react-dom/i.test(html),
    vue: /vue\.js|vuejs/i.test(html),
    angular: /angular/i.test(html),
    jquery: /jquery/i.test(html),
    nextjs: /__next|next\.js/i.test(html),
    gatsby: /gatsby/i.test(html)
  };
  
  // Check for dynamic content indicators
  const hasDynamicContent = 
    /document\.(getElementById|querySelector|addEventListener)/i.test(html) ||
    /window\.(location|history)/i.test(html) ||
    /\$\s*\(|document\.ready/i.test(html);
  
  // Check for data attributes (common in JS frameworks) - check raw HTML
  const hasDataAttributes = /data-\w+/i.test(html);
  
  return {
    hasJavaScript: scriptTags > 0,
    scriptCount: scriptTags,
    inlineScripts,
    externalScripts,
    frameworks,
    hasDynamicContent,
    hasDataAttributes,
    likelyRequiresJS: scriptTags > 0 && (hasDynamicContent || Object.values(frameworks).some(v => v))
  };
}

/**
 * Clean and fix URL
 */
function cleanUrl(url) {
  if (!url) return null;
  // Remove spaces and fix common issues
  let cleaned = url.trim().replace(/\s+/g, '');
  // If URL doesn't start with http:// or https://, try to fix it
  if (!cleaned.match(/^https?:\/\//i)) {
    // Try to construct from website if available
    return null;
  }
  return cleaned;
}

/**
 * Analyze a single menu URL
 */
async function analyzeMenuUrl(record) {
  let url = record.menu;
  
  // Clean the URL
  url = cleanUrl(url);
  if (!url) {
    // Try to construct from website
    if (record.website) {
      const baseUrl = record.website.replace(/\/$/, '');
      url = `${baseUrl}/menu`;
    } else {
      return {
        url: record.menu,
        placeId: record.PlaceID,
        name: record.Name,
        success: false,
        error: 'Invalid URL format',
        analysis: {}
      };
    }
  }
  
  const result = {
    url,
    originalUrl: record.menu,
    placeId: record.PlaceID,
    name: record.Name,
    success: false,
    error: null,
    analysis: {}
  };
  
  try {
    console.log(`\n📄 Analyzing: ${record.Name}`);
    console.log(`   Original URL: ${record.menu}`);
    console.log(`   Cleaned URL: ${url}`);
    
    // Fetch HTML
    const { html, statusCode, headers, finalUrl } = await fetchHTML(url);
    
    result.analysis.statusCode = statusCode;
    result.analysis.contentType = headers['content-type'] || headers['Content-Type'] || 'unknown';
    result.analysis.htmlLength = html.length;
    result.analysis.finalUrl = finalUrl;
    
    if (finalUrl !== url) {
      console.log(`   Final URL: ${finalUrl}`);
    }
    console.log(`   Status: ${statusCode}`);
    console.log(`   Content-Type: ${result.analysis.contentType}`);
    console.log(`   HTML Length: ${html.length} characters`);
    
    // Check if HTML is too short or empty
    if (html.length < 100) {
      console.log(`   ⚠️  Very short response - may be a redirect or error page`);
      result.analysis.htmlTooShort = true;
      result.analysis.htmlPreview = html.substring(0, 200);
    }
    
    // Parse HTML (handle empty or malformed HTML)
    let $;
    try {
      $ = cheerio.load(html || '<html><body></body></html>');
    } catch (parseError) {
      console.log(`   ⚠️  HTML parsing error: ${parseError.message}`);
      result.analysis.parseError = parseError.message;
      $ = cheerio.load('<html><body></body></html>');
    }
    
    // Check for menu content
    console.log(`\n   🔍 Checking for menu content...`);
    const menuCheck = checkMenuContent(html);
    result.analysis.menuContent = menuCheck;
    
    if (menuCheck.hasMenuContent) {
      console.log(`   ✅ Menu content detected (confidence: ${menuCheck.confidence}%)`);
      console.log(`      - Menu selector found: ${menuCheck.details.hasMenuSelector}`);
      console.log(`      - Keyword matches: ${menuCheck.details.keywordMatches}`);
      console.log(`      - Has prices: ${menuCheck.details.hasPrices}`);
      console.log(`      - List items: ${menuCheck.details.listItemCount}`);
    } else {
      console.log(`   ⚠️  No clear menu content found (confidence: ${menuCheck.confidence}%)`);
    }
    
    // Check for menu images
    console.log(`\n   🖼️  Checking for menu images...`);
    const menuImages = findMenuImages($, url);
    result.analysis.menuImages = {
      found: menuImages.length > 0,
      count: menuImages.length,
      images: menuImages.map(img => ({
        url: img.url,
        alt: img.alt,
        isMenuRelated: img.isMenuRelated
      }))
    };
    
    if (menuImages.length > 0) {
      const menuRelatedImages = menuImages.filter(img => img.isMenuRelated);
      console.log(`   ✅ Found ${menuImages.length} image(s)`);
      if (menuRelatedImages.length > 0) {
        console.log(`      - ${menuRelatedImages.length} appear to be menu-related`);
        result.analysis.menuImages.likelyMenuInImage = true;
      } else {
        console.log(`      - None explicitly marked as menu images, but ${menuImages.length} image(s) found`);
        // Check if images are large (potential menu images)
        const largeImages = menuImages.filter(img => img.isLargeImage);
        if (largeImages.length > 0) {
          console.log(`      - ${largeImages.length} large image(s) detected (possible menu images)`);
          result.analysis.menuImages.likelyMenuInImage = true;
        }
      }
    } else {
      console.log(`   ❌ No images found`);
    }
    
    // Check for JavaScript
    console.log(`\n   ⚙️  Checking for JavaScript...`);
    const jsCheck = checkJavaScript(html);
    result.analysis.javascript = jsCheck;
    
    if (jsCheck.hasJavaScript) {
      console.log(`   ✅ JavaScript detected`);
      console.log(`      - Script tags: ${jsCheck.scriptCount} (${jsCheck.inlineScripts} inline, ${jsCheck.externalScripts} external)`);
      const detectedFrameworks = Object.entries(jsCheck.frameworks)
        .filter(([_, detected]) => detected)
        .map(([name]) => name);
      if (detectedFrameworks.length > 0) {
        console.log(`      - Frameworks: ${detectedFrameworks.join(', ')}`);
      }
      if (jsCheck.likelyRequiresJS) {
        console.log(`      - ⚠️  Page likely requires JavaScript to render content`);
      }
    } else {
      console.log(`   ❌ No JavaScript detected`);
    }
    
    // Summary
    result.analysis.summary = {
      hasMenuInHTML: menuCheck.hasMenuContent,
      hasMenuInImage: result.analysis.menuImages.likelyMenuInImage || false,
      requiresJavaScript: jsCheck.likelyRequiresJS,
      canScrape: menuCheck.hasMenuContent || result.analysis.menuImages.likelyMenuInImage
    };
    
    console.log(`\n   📊 Summary:`);
    console.log(`      - Menu in HTML: ${result.analysis.summary.hasMenuInHTML ? '✅' : '❌'}`);
    console.log(`      - Menu in Image: ${result.analysis.summary.hasMenuInImage ? '✅' : '❌'}`);
    console.log(`      - Requires JS: ${result.analysis.summary.requiresJavaScript ? '⚠️' : '✅'}`);
    console.log(`      - Can Scrape: ${result.analysis.summary.canScrape ? '✅' : '❌'}`);
    
    result.success = true;
    
  } catch (error) {
    result.error = error.message;
    console.log(`\n   ❌ Error: ${error.message}`);
  }
  
  return result;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting menu URL analysis...\n');
  
  // Read data file
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  
  // Get first 3 records with menu URLs
  const recordsToAnalyze = data
    .filter(r => r.menu && r.menu.trim())
    .slice(0, 3);
  
  if (recordsToAnalyze.length === 0) {
    console.error('No records with menu URLs found');
    process.exit(1);
  }
  
  console.log(`Found ${recordsToAnalyze.length} records to analyze\n`);
  console.log('='.repeat(80));
  
  const results = [];
  
  // Analyze each record
  for (let i = 0; i < recordsToAnalyze.length; i++) {
    const record = recordsToAnalyze[i];
    const result = await analyzeMenuUrl(record);
    results.push(result);
    
    // Add delay between requests
    if (i < recordsToAnalyze.length - 1) {
      console.log('\n' + '='.repeat(80));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Display final results
  console.log('\n\n' + '='.repeat(80));
  console.log('📋 FINAL RESULTS');
  console.log('='.repeat(80));
  
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. ${result.name}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   PlaceID: ${result.placeId}`);
    
    if (result.success) {
      const summary = result.analysis.summary;
      console.log(`   Status: ✅ Successfully analyzed`);
      console.log(`   Menu in HTML: ${summary.hasMenuInHTML ? '✅ Yes' : '❌ No'}`);
      console.log(`   Menu in Image: ${summary.hasMenuInImage ? '✅ Likely' : '❌ No'}`);
      console.log(`   Requires JS: ${summary.requiresJavaScript ? '⚠️  Yes' : '✅ No'}`);
      console.log(`   Can Scrape: ${summary.canScrape ? '✅ Yes' : '❌ No'}`);
      
      if (result.analysis.menuImages.found) {
        console.log(`   Images Found: ${result.analysis.menuImages.count}`);
      }
    } else {
      console.log(`   Status: ❌ Error - ${result.error}`);
    }
  });
  
  // Save results to file
  const outputPath = path.join(__dirname, '..', 'menu-analysis-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n\n💾 Results saved to: ${outputPath}`);
  
  // Update original data file with analysis metadata
  console.log(`\n📝 Updating original data file with analysis metadata...`);
  // Re-read data to get latest version (data was already loaded at the start)
  
  results.forEach(result => {
    // Find all records with matching PlaceID
    const matchingRecords = data.filter(r => r.PlaceID === result.placeId);
    
    matchingRecords.forEach(record => {
      if (result.success && result.analysis) {
        const summary = result.analysis.summary;
        record.menu_analysis_status = 'analyzed';
        record.menu_has_content = summary.hasMenuInHTML || false;
        record.menu_likely_in_image = summary.hasMenuInImage || false;
        record.menu_requires_js = summary.requiresJavaScript || false;
        record.menu_can_scrape = summary.canScrape || false;
        record.menu_final_url = result.analysis.finalUrl || result.url;
        record.menu_status_code = result.analysis.statusCode || null;
        record.menu_confidence = result.analysis.menuContent?.confidence || 0;
        if (result.analysis.menuImages?.likelyMenuInImage) {
          record.menu_likely_in_image = true;
          record.menu_image_count = result.analysis.menuImages.count || 0;
        }
      } else {
        record.menu_analysis_status = 'error';
        record.menu_analysis_error = result.error || 'Unknown error';
      }
    });
  });
  
  // Save updated data
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ Updated ${dataPath} with analysis metadata`);
  
  // Return results for display
  return results;
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { analyzeMenuUrl };

