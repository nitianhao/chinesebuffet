# Setup Instructions - Health Inspection Web Scraping

## Prerequisites

### 1. Install Dependencies

```bash
# For HTML parsing
npm install cheerio --save-dev

# For browser automation (required for most health department sites)
npm install puppeteer --save-dev
```

**Note:** If you get permission errors, try:
```bash
npm install puppeteer --save-dev --legacy-peer-deps
```

Or install globally:
```bash
npm install -g puppeteer
```

### 2. Verify Installation

```bash
node -e "console.log(require('cheerio') ? 'Cheerio OK' : 'Cheerio missing')"
node -e "console.log(require('puppeteer') ? 'Puppeteer OK' : 'Puppeteer missing')"
```

## Website Analysis Results

### Houston Health Department

**Status:** ⚠️ Requires Puppeteer (JavaScript-heavy site)

**Test Result:**
- HTTP requests timeout
- Website likely uses JavaScript to load content
- Need browser automation

**Next Steps:**
1. Install Puppeteer (see above)
2. Update `scrape-generic.js` to use `method: 'puppeteer'` for Houston
3. Analyze website structure with browser DevTools
4. Update selectors in configuration

## Step-by-Step Implementation

### For Houston (Example)

1. **Install Puppeteer:**
   ```bash
   npm install puppeteer --save-dev
   ```

2. **Test website with Puppeteer:**
   ```bash
   node scripts/health-inspection/scrape-generic.js houston "China Star Buffet"
   ```

3. **If it works, run full scrape:**
   ```bash
   node scripts/health-inspection/scrape-generic.js houston
   ```

4. **Match results:**
   ```bash
   node scripts/health-inspection/match-all-health-data.js
   ```

5. **Sync to database:**
   ```bash
   node scripts/health-inspection/sync-health-data-to-db.js
   ```

## Configuration Updates Needed

Once you analyze each website, update `scrape-generic.js`:

```javascript
houston: {
  name: 'Houston',
  state: 'TX',
  searchUrl: 'https://www.houstontx.gov/health/FoodService/index.html',
  method: 'puppeteer',  // Change from 'http' to 'puppeteer'
  selectors: {
    // Update these after analyzing the website:
    searchInput: 'input[name="restaurant"]',      // Find actual selector
    searchButton: 'button[type="submit"]',        // Find actual selector
    resultsContainer: '.results',                  // Find actual container
    resultItem: '.inspection-record',              // Find actual item selector
  },
  dataMapping: {
    // Update these to match actual HTML structure:
    name: '.restaurant-name',
    address: '.restaurant-address',
    score: '.inspection-score',
    date: '.inspection-date',
    violations: '.violations',
  },
},
```

## How to Find Selectors

1. **Open website in browser**
2. **Open DevTools** (F12 or Right-click → Inspect)
3. **Perform a test search**
4. **Right-click on search input** → Inspect
5. **Copy selector:**
   - Right-click element → Copy → Copy selector
   - Or note the `id` or `name` attribute
6. **Repeat for results container and data fields**

## Troubleshooting

### Puppeteer Installation Issues

**macOS:**
```bash
# If you get permission errors:
sudo npm install puppeteer --save-dev

# Or use npx (no install needed):
npx puppeteer scripts/health-inspection/scrape-generic.js houston
```

**Linux:**
```bash
# Install Chromium dependencies:
sudo apt-get install -y \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2
```

### Website Blocks Requests

**Solutions:**
1. Add delays between requests (already implemented)
2. Use realistic User-Agent (already implemented)
3. Rotate IP addresses (if needed)
4. Contact health department for API access

### No Results Found

**Check:**
1. Are selectors correct?
2. Has website structure changed?
3. Does search actually work manually?
4. Are there any error messages in console?

## Alternative: Manual Data Collection

If scraping is too complex, you can:

1. **Manually collect data:**
   - Visit health department websites
   - Search for each restaurant
   - Copy inspection data
   - Save to JSON file

2. **Use third-party service:**
   - Foodspark: https://www.foodspark.io/
   - HDScores: Health inspection aggregator
   - May require subscription but saves time

## Quick Reference

```bash
# Test website
node scripts/health-inspection/test-website.js <url>

# Scrape single city
node scripts/health-inspection/scrape-generic.js <city>

# Batch scrape multiple cities
node scripts/health-inspection/batch-scrape.js houston dallas austin

# Match all data
node scripts/health-inspection/match-all-health-data.js

# Sync to database
node scripts/health-inspection/sync-health-data-to-db.js
```

## Support Files

- `QUICK_START.md` - Quick start guide
- `WEB_SCRAPING_GUIDE.md` - Detailed scraping guide
- `IMPLEMENTATION_PLAN.md` - Step-by-step plan
- `README.md` - Complete overview
















