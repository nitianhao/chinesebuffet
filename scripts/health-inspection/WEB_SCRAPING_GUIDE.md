# Web Scraping Guide for Health Inspection Data

## Overview

This guide explains how to implement web scrapers for health department websites that don't provide APIs.

## Approach

### Step 1: Analyze the Target Website

Before writing a scraper, you need to understand the website structure:

1. **Visit the health department website**
2. **Perform a test search** (e.g., search for "China Buffet")
3. **Inspect the HTML** (right-click → Inspect Element)
4. **Identify:**
   - Search form fields (input names, IDs)
   - Search submission method (GET/POST)
   - Results container (table, div, etc.)
   - Data structure (how inspection records are displayed)

### Step 2: Choose Scraping Method

#### Option A: Simple HTTP Requests (Recommended First)

**Use when:**
- Website doesn't use JavaScript for search
- Results are in static HTML
- No anti-scraping measures

**Tools:**
- Node.js `https`/`http` modules
- Cheerio for HTML parsing

**Example:**
```javascript
const https = require('https');
const cheerio = require('cheerio');

// Make request
const response = await httpRequest(searchUrl);
const $ = cheerio.load(response.data);

// Extract data
$('.inspection-record').each((i, elem) => {
  const score = $(elem).find('.score').text();
  const date = $(elem).find('.date').text();
  // ...
});
```

#### Option B: Browser Automation (Puppeteer/Playwright)

**Use when:**
- Website uses JavaScript to load content
- Search requires form submission with JavaScript
- Anti-scraping measures block simple requests

**Tools:**
- Puppeteer (Chrome/Chromium)
- Playwright (multi-browser)

**Example:**
```javascript
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto('https://health-dept.gov/search');
await page.type('#search-input', 'China Buffet');
await page.click('#search-button');
await page.waitForSelector('.results');
const results = await page.evaluate(() => {
  // Extract data from page
});
```

### Step 3: Handle Rate Limiting

**Best Practices:**
- Add delays between requests (2-5 seconds)
- Use respectful User-Agent headers
- Don't overwhelm the server
- Cache results to avoid re-scraping

```javascript
// Wait between requests
await new Promise(resolve => setTimeout(resolve, 2000));

// Save progress
fs.writeFileSync('progress.json', JSON.stringify(results, null, 2));
```

## Implementation Status

### ✅ Ready to Implement

1. **Houston, TX** (28 buffets)
   - URL: https://www.houstontx.gov/health/FoodService/index.html
   - Status: Template created, needs website analysis
   - File: `scrape-houston-simple.js`

2. **Dallas, TX** (8 buffets)
   - URL: https://www.dallascounty.org/departments/dchhs/food-safety.php
   - Status: Not started

3. **Austin, TX** (7 buffets)
   - URL: https://www.austintexas.gov/department/environmental-health-services
   - Status: Not started

### 📋 Implementation Checklist

For each city, follow these steps:

- [ ] **Analyze Website**
  - [ ] Visit health department website
  - [ ] Test search functionality
  - [ ] Inspect HTML structure
  - [ ] Identify data fields

- [ ] **Create Scraper**
  - [ ] Write HTTP request function
  - [ ] Implement search function
  - [ ] Parse HTML results
  - [ ] Transform to standardized format

- [ ] **Test Scraper**
  - [ ] Test with sample restaurant
  - [ ] Verify data extraction
  - [ ] Handle edge cases

- [ ] **Run Full Scrape**
  - [ ] Load all buffets for city
  - [ ] Search each restaurant
  - [ ] Save results to JSON
  - [ ] Run matching algorithm

## Data Transformation

All scraped data should be transformed to our standardized format:

```javascript
{
  currentScore: number | string,
  currentGrade: "A" | "B" | "C" | null,
  inspectionDate: "YYYY-MM-DD",
  violations: [
    {
      code: string,
      description: string,
      category: "Critical" | "General",
      severity: "High" | "Medium" | "Low"
    }
  ],
  criticalViolationsCount: number,
  generalViolationsCount: number,
  inspectionHistory: [...],
  dataSource: "City Health Department",
  healthDepartmentUrl: "...",
  _raw: { /* original data */ }
}
```

## Common Challenges

### 1. JavaScript-Rendered Content

**Solution:** Use Puppeteer/Playwright instead of simple HTTP requests

### 2. Anti-Scraping Measures

**Solutions:**
- Use realistic User-Agent headers
- Add delays between requests
- Use browser automation (looks more like real user)
- Rotate IP addresses (if needed)

### 3. Inconsistent Data Formats

**Solution:** Create robust parsers that handle variations

### 4. Rate Limiting

**Solution:** 
- Implement exponential backoff
- Cache results
- Run scrapers during off-peak hours

## Next Steps

1. **Analyze Houston website** and update `scrape-houston-simple.js`
2. **Test with one restaurant** to verify extraction
3. **Run full scrape** for all Houston buffets
4. **Repeat for other cities** (Dallas, Austin, etc.)

## Resources

- [Cheerio Documentation](https://cheerio.js.org/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Web Scraping Best Practices](https://www.scrapehero.com/web-scraping-best-practices/)
















