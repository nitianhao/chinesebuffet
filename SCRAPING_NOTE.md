# Important Note About Scraping

## Current Status

Both Yelp and TripAdvisor have implemented strict anti-scraping measures that block automated HTTP requests (403 Forbidden errors). Simple `requests` library calls will not work.

## Solutions

### Option 1: Use Selenium (Recommended but Slower)

I've created a Selenium-based matching script: `scripts/match-restaurants-selenium.py`

**Requirements:**
- Install Selenium: `pip3 install selenium`
- Install ChromeDriver: `brew install chromedriver` (macOS)

**Usage:**
```bash
python3 scripts/match-restaurants-selenium.py
```

**Pros:**
- Works with anti-scraping measures
- Mimics real browser behavior
- More reliable

**Cons:**
- Much slower (3-5 seconds per restaurant vs <1 second)
- Requires ChromeDriver
- More resource intensive

### Option 2: Manual URL Collection

If you prefer, you can manually collect Yelp and TripAdvisor URLs:

1. Create/edit `data/restaurant-mapping.json`
2. For each buffet, add Yelp and TripAdvisor URLs manually
3. Then proceed with scraping individual pages

### Option 3: Use Official APIs (If Available)

- **Yelp Fusion API**: Free tier available (5000 calls/day)
- **TripAdvisor Content API**: May require approval/partnership

## Recommendation

Given that you have 367 restaurants, using Selenium will take several hours but will be more reliable. The matching script saves progress after each restaurant, so you can stop and resume.

Alternatively, you could:
1. Use the Yelp Fusion API for matching (free tier)
2. Manually verify/correct matches
3. Use scrapers for detailed page data

## Next Steps

1. Try the Selenium version: `python3 scripts/match-restaurants-selenium.py`
2. Or use Yelp Fusion API for initial matching
3. Once mapping is complete, proceed with scraping individual pages

The scraping scripts (`scrape-yelp.py` and `scrape-tripadvisor.py`) are designed to work with individual business pages, which may be easier to access than search pages.
















