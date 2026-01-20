# Quick Start Guide - Health Inspection Data Collection

## 🚀 Get Started in 5 Minutes

### Step 1: Test a Website

Test if a health department website is accessible:

```bash
node scripts/health-inspection/test-website.js https://www.houstontx.gov/health/FoodService/index.html
```

This will:
- Fetch the website
- Save HTML for inspection
- Analyze basic structure
- Suggest next steps

### Step 2: Analyze the HTML

1. Open the saved HTML file in your browser
2. Right-click → Inspect Element
3. Find:
   - Search form (look for `<form>` tags)
   - Input fields (look for `<input>` tags)
   - Results container (where inspection data appears)

### Step 3: Update Configuration

Edit `scripts/health-inspection/scrape-generic.js`:

```javascript
houston: {
  // ... existing config ...
  selectors: {
    searchInput: 'input[name="restaurant"]',  // Update with actual selector
    searchButton: 'button[type="submit"]',    // Update with actual selector
    resultsContainer: '.results',              // Update with actual selector
    resultItem: '.inspection-record',          // Update with actual selector
  },
}
```

### Step 4: Test Scraper

Test with one restaurant:

```bash
node scripts/health-inspection/scrape-generic.js houston "China Star Buffet"
```

### Step 5: Run Full Scrape

Once tested, scrape all buffets:

```bash
node scripts/health-inspection/scrape-generic.js houston
```

Or use batch scraper for multiple cities:

```bash
node scripts/health-inspection/batch-scrape.js houston dallas austin
```

## 📋 Common Issues & Solutions

### Issue: "Request timeout"

**Solution:** Website may require JavaScript. Use Puppeteer:
```bash
npm install puppeteer
# Then update config: method: 'puppeteer'
```

### Issue: "No results found"

**Solutions:**
1. Check if selectors are correct
2. Verify website structure hasn't changed
3. Test search manually in browser first

### Issue: "Cannot find module 'cheerio'"

**Solution:**
```bash
npm install cheerio --save-dev
```

### Issue: "403 Forbidden"

**Solution:** Website may block automated requests. Try:
- Different User-Agent
- Add delays between requests
- Use Puppeteer (looks more like real browser)

## 🎯 Priority Checklist

- [ ] Test Houston website
- [ ] Analyze HTML structure
- [ ] Update Houston configuration
- [ ] Test with sample restaurant
- [ ] Run full Houston scrape (28 buffets)
- [ ] Match results to database
- [ ] Repeat for other cities

## 📊 Expected Results

After scraping, you should have:
- `data/health-inspections/houston-inspections.json` - Scraped data
- Inspection records with: scores, grades, violations, dates
- Matched to your buffet database

## 🔄 Next Steps After Scraping

1. **Match data:**
   ```bash
   node scripts/health-inspection/match-all-health-data.js
   ```

2. **Sync to database:**
   ```bash
   node scripts/health-inspection/sync-health-data-to-db.js
   ```

3. **Verify on website:**
   - Visit a buffet detail page
   - Check if health inspection section appears

## 💡 Tips

- **Start small:** Test with 1-2 restaurants first
- **Save progress:** Scripts save incrementally
- **Be respectful:** Add delays, don't overwhelm servers
- **Check regularly:** Websites change, scrapers need updates

## 🆘 Need Help?

1. Check `WEB_SCRAPING_GUIDE.md` for detailed instructions
2. Review `IMPLEMENTATION_PLAN.md` for step-by-step plan
3. Check `SCRAPING_STATUS.md` for current status
















