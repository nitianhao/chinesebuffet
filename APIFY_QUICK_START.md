# Quick Start: Find Direct Menu URLs on Restaurant Websites

## Summary

**If you already have website URLs:** Use `find-menu-urls-from-websites.js` - **$0.00 (FREE!)**

**If you need to get website URLs first:** Use `find-menu-urls-on-websites.js` - **~$5.84 - $6.13**
1. Get website URLs from Yelp (~$5.70)
2. Scrape websites to find menu links (~$0.14-$0.43)

## Prerequisites

1. ✅ Node.js installed
2. ✅ Dependencies installed (`npm install`)
3. ✅ Website URLs already in your database/JSON (if using free option)

## Option 1: If You Already Have Website URLs (FREE!)

**No Apify needed!** Just scrape websites locally:

1. **Test with a small batch**:
   ```bash
   node scripts/find-menu-urls-from-websites.js --limit 10 --dry-run
   ```

2. **Run a small test** (10 restaurants):
   ```bash
   node scripts/find-menu-urls-from-websites.js --limit 10
   ```

3. **Process all restaurants**:
   ```bash
   node scripts/find-menu-urls-from-websites.js
   ```

**Cost: $0.00** - Completely free!

## Option 2: If You Need to Get Website URLs First

1. **Set your Apify token** in `.env.local`:
   ```
   APIFY_TOKEN=your_apify_token_here
   ```

2. **Test with a small batch first** (recommended):
   ```bash
   node scripts/find-menu-urls-on-websites.js --limit 10 --dry-run
   ```

3. **Run a small test** (10 restaurants):
   ```bash
   node scripts/find-menu-urls-on-websites.js --limit 10
   ```

4. **Process all restaurants**:
   ```bash
   node scripts/find-menu-urls-on-websites.js
   ```

## Options

- `--dry-run`: Test without making changes or calling Apify
- `--limit=N`: Process only first N restaurants
- `--step=1`: Only get website URLs (Step 1)
- `--step=2`: Only find menu links (Step 2, requires Step 1 data)
- `--batch-size=N`: Process N restaurants per batch (default: 50)

## How It Works

### Step 1: Get Website URLs
1. **Extracts Yelp URLs** from your restaurant data
2. **Calls Apify** `tri_angle/yelp-scraper` to get website URLs
3. **Saves intermediate results** to `data/restaurant-websites.json`

### Step 2: Find Menu Links
1. **For each website:**
   - Tries common menu URL patterns (e.g., `/menu`, `/menus`)
   - If not found, scrapes the homepage to find menu links
   - Returns the most relevant menu URL
2. **Updates JSON file** with menu URLs in `yelp.details.menu_url`

## Cost Breakdown

- **Step 1 (Yelp scraper):** $1.00 per 1,000 results = ~$5.70
- **Step 2 (Website scraping):** CU-based = ~$0.14 - $0.43
- **Total:** ~$5.84 - $6.13
- **With Apify free plan ($5/month):** ~$0.84 - $1.13

## Resuming Interrupted Runs

The script saves intermediate results, so you can resume:

1. **If Step 1 completed:** Run only Step 2
   ```bash
   node scripts/find-menu-urls-on-websites.js --step=2
   ```

2. **If both steps completed:** The script will use saved data and skip re-scraping

## Alternative Options

See `APIFY_MENU_URL_DIRECT_WEBSITES.md` for:
- Restaurant Menu Scraper (discovers + extracts) - $91.25
- Smart Restaurant Menu Scraper - $5.76 (currently unavailable)

## Safety Features

- ✅ Automatic backup created before updates
- ✅ Batch processing to avoid rate limits
- ✅ Retry logic for failed batches
- ✅ Dry-run mode for testing

## Monitoring

Check your Apify console for:
- Run status: https://console.apify.com/actors/runs/
- Cost tracking: https://console.apify.com/account/usage
- Dataset results: Available in each run's dataset

## Troubleshooting

**Error: APIFY_TOKEN not found**
- Add `APIFY_TOKEN=your_token` to `.env.local`

**Rate limiting errors**
- Reduce `--batch-size` (e.g., `--batch-size 25`)
- Increase delay between batches in script

**Out of credits**
- Check Apify usage: https://console.apify.com/account/usage
- Upgrade plan or wait for monthly reset

## Next Steps

After enriching menu URLs:
1. Verify menu URLs work (optional script to check HTTP status)
2. Use existing menu scraping system (`MENU_SCRAPING.md`) to extract menu content
3. Store menu data in InstantDB using existing schema

