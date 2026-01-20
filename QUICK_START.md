# Quick Start - Yelp & TripAdvisor Scraping

## Step 1: Install Python Dependencies

First, install the required Python packages:

```bash
pip3 install -r scripts/requirements.txt
```

Or install individually:
```bash
pip3 install requests beautifulsoup4 fuzzywuzzy python-Levenshtein lxml
```

**Note:** If you plan to use Selenium (recommended for TripAdvisor), also install:
```bash
pip3 install selenium
# And install ChromeDriver:
# macOS: brew install chromedriver
# Or download from: https://chromedriver.chromium.org/
```

## Step 2: Start Matching Restaurants

Run the matching script to find Yelp and TripAdvisor listings for your buffets:

```bash
python3 scripts/match-restaurants.py
```

This will:
- Search Yelp and TripAdvisor for each buffet
- Create a mapping file: `data/restaurant-mapping.json`
- Take 1-2 hours for 367 restaurants (with rate limiting)

You can stop and resume - it saves progress after each match.

## Step 3: Scrape Yelp Data

Once matching is complete, scrape Yelp data:

```bash
python3 scripts/scrape-yelp.py --batch 10 --delay 3
```

Options:
- `--batch N` - Process N restaurants before break (default: 10)
- `--delay N` - Seconds between requests (default: 3)
- `--selenium` - Use Selenium (slower but more reliable)

Data saved to: `data/yelp-data/{buffet-id}.json`

## Step 4: Scrape TripAdvisor Data

Scrape TripAdvisor data (uses Selenium by default):

```bash
python3 scripts/scrape-tripadvisor.py --batch 10 --delay 3
```

Options:
- `--batch N` - Process N restaurants before break (default: 10)
- `--delay N` - Seconds between requests (default: 3)
- `--no-selenium` - Don't use Selenium (not recommended)

Data saved to: `data/tripadvisor-data/{buffet-id}.json`

## Step 5: Merge Data

Combine scraped data with your existing database:

```bash
node scripts/merge-yelp-tripadvisor-data.js
```

Output: `data/buffets-by-id-enriched.json`

## Alternative: Use npm Scripts

You can also use the npm scripts defined in package.json:

```bash
npm run match-restaurants
npm run scrape-yelp
npm run scrape-tripadvisor
npm run merge-yelp-tripadvisor
```

## Troubleshooting

- **Module not found**: Make sure you've installed dependencies (Step 1)
- **Rate limiting**: Increase `--delay` parameter if you get blocked
- **Selenium errors**: Make sure ChromeDriver is installed and in PATH
- **Matching issues**: Check `data/restaurant-mapping.json` to see results

For more details, see `YELP_TRIPADVISOR_SCRAPING.md`
















