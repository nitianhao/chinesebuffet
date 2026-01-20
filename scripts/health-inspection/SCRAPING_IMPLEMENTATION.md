# Web Scraping Implementation Guide

## Quick Start

### 1. Install Dependencies

```bash
# Option A: Use install script
./scripts/health-inspection/install-dependencies.sh

# Option B: Manual install
npm install puppeteer cheerio --save-dev
```

### 2. Test with One Restaurant

```bash
# Test the scraper with a sample restaurant
node scripts/health-inspection/run-houston-scraper.js "China Star Buffet"
```

This will:
- Launch browser
- Navigate to Houston health department
- Search for the restaurant
- Save screenshot and HTML for inspection
- Extract any results found

### 3. Review Results

After running, check:
- `houston-health-page.png` - Screenshot of the page
- `houston-health-page.html` - Full HTML for inspection
- `data/health-inspections/houston-test-*.json` - Extracted results

### 4. Update Selectors (If Needed)

If the scraper doesn't find the search form or results automatically:

1. Open `houston-health-page.html` in a browser
2. Right-click on search input → Inspect Element
3. Note the selector (id, name, class)
4. Update `scrape-houston-working.js` with correct selectors

### 5. Run Full Scrape

Once tested and working:

```bash
# Scrape all 28 Houston buffets
node scripts/health-inspection/run-houston-scraper.js
```

**Note:** This takes 30-60 minutes. Progress is saved incrementally.

## How It Works

### Step 1: Browser Automation

The scraper uses Puppeteer to:
- Launch a headless Chrome browser
- Navigate to the health department website
- Wait for JavaScript to load
- Interact with the page (type, click)

### Step 2: Element Detection

The scraper tries multiple selectors to find:
- Search input field
- Search button
- Results container
- Individual result items

### Step 3: Data Extraction

Once results are found, it extracts:
- Raw text content
- HTML structure
- Saves for further processing

### Step 4: Data Transformation

Results are transformed to standardized format:
- Restaurant name
- Address
- Inspection score/grade
- Violations
- Dates

## Troubleshooting

### "Puppeteer not installed"

**Solution:**
```bash
npm install puppeteer --save-dev
```

### "No search input found"

**Solution:**
1. Check screenshot: `houston-health-page.png`
2. Check HTML: `houston-health-page.html`
3. Update selectors in `scrape-houston-working.js`

### "Timeout errors"

**Solutions:**
- Increase timeout in code (currently 60 seconds)
- Check internet connection
- Website may be slow or down

### "No results found"

**Possible reasons:**
- Restaurant name doesn't match exactly
- Website structure changed
- Search requires different format
- Restaurant not in database

**Solutions:**
1. Try searching manually in browser first
2. Check if restaurant exists in health department database
3. Try variations of restaurant name
4. Update search logic

## Customization

### Update Selectors

Edit `scrape-houston-working.js`:

```javascript
const searchSelectors = [
  'input[name="search"]',      // Add your selectors here
  'input[name="restaurant"]',
  // ... more selectors
];
```

### Update Data Extraction

Edit the `page.evaluate()` section:

```javascript
const results = await page.evaluate(() => {
  // Custom extraction logic here
  // Access DOM elements
  // Extract data
  // Return structured data
});
```

### Add Delays

If website is slow or blocks requests:

```javascript
await page.waitForTimeout(5000); // Wait 5 seconds
```

## Progress Tracking

The scraper saves progress automatically:
- `.houston-progress.json` - Tracks completed/failed restaurants
- `houston-inspections-partial.json` - Incremental results
- `houston-inspections.json` - Final results

You can stop and resume - it will skip already completed restaurants.

## Next Steps After Scraping

1. **Review Results:**
   ```bash
   # Check what was scraped
   cat data/health-inspections/houston-inspections.json | jq 'keys | length'
   ```

2. **Match to Database:**
   ```bash
   node scripts/health-inspection/match-all-health-data.js
   ```

3. **Sync to Database:**
   ```bash
   node scripts/health-inspection/sync-health-data-to-db.js
   ```

## Tips

- **Start small:** Test with 1-2 restaurants first
- **Be patient:** Scraping takes time (3-5 seconds per restaurant)
- **Save progress:** Script saves incrementally
- **Check screenshots:** Helps debug issues
- **Update selectors:** Websites change, scrapers need updates

## Support

If you encounter issues:
1. Check screenshots and HTML files
2. Review error messages
3. Try manual search in browser
4. Update selectors based on actual HTML structure
















