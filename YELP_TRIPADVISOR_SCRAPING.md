# Yelp and TripAdvisor Scraping Guide

This guide explains how to use the scraping scripts to enrich your Chinese buffet database with data from Yelp and TripAdvisor.

## Prerequisites

1. **Python 3.7+** installed
2. **Node.js** installed (for merge script)
3. Install Python dependencies:
   ```bash
   pip install -r scripts/requirements.txt
   ```
   
   Note: If you plan to use Selenium (recommended for TripAdvisor), you'll also need ChromeDriver:
   - macOS: `brew install chromedriver`
   - Or download from: https://chromedriver.chromium.org/

## Overview

The scraping process consists of 4 main steps:

1. **Match restaurants** - Find Yelp and TripAdvisor listings for your buffets
2. **Scrape Yelp data** - Extract data from Yelp
3. **Scrape TripAdvisor data** - Extract data from TripAdvisor
4. **Merge data** - Combine scraped data with your existing database

## Step-by-Step Instructions

### Step 1: Match Restaurants

This script searches Yelp and TripAdvisor to find matching listings for each buffet in your database.

```bash
python scripts/match-restaurants.py
```

**What it does:**
- Searches Yelp and TripAdvisor for each buffet using name, city, and state
- Uses fuzzy matching to find similar restaurant names
- Creates a mapping file: `data/restaurant-mapping.json`
- Can be run multiple times (skips already matched restaurants)

**Expected time:** 1-2 hours for 367 restaurants (with rate limiting)

**Output:** `data/restaurant-mapping.json`

### Step 2: Scrape Yelp Data

This script scrapes detailed data from Yelp for all matched restaurants.

```bash
# Basic usage (processes 10 restaurants at a time)
python scripts/scrape-yelp.py

# Custom batch size and delay
python scripts/scrape-yelp.py --batch 20 --delay 5

# Use Selenium for JavaScript-rendered content (slower but more reliable)
python scripts/scrape-yelp.py --selenium
```

**Options:**
- `--batch N` - Process N restaurants before taking a break (default: 10)
- `--delay N` - Delay in seconds between requests (default: 3)
- `--selenium` - Use Selenium WebDriver (slower but handles dynamic content)

**What it does:**
- Scrapes business details, ratings, reviews, photos, etc.
- Saves one JSON file per restaurant: `data/yelp-data/{buffet-id}.json`
- Skips restaurants that have already been scraped
- Implements rate limiting to avoid being blocked

**Expected time:** 10-20 minutes per batch (depends on delay settings)

**Output:** Individual JSON files in `data/yelp-data/`

### Step 3: Scrape TripAdvisor Data

This script scrapes detailed data from TripAdvisor for all matched restaurants.

```bash
# Basic usage (uses Selenium by default)
python scripts/scrape-tripadvisor.py

# Custom batch size and delay
python scripts/scrape-tripadvisor.py --batch 10 --delay 5

# Don't use Selenium (not recommended - may miss content)
python scripts/scrape-tripadvisor.py --no-selenium
```

**Options:**
- `--batch N` - Process N restaurants before taking a break (default: 10)
- `--delay N` - Delay in seconds between requests (default: 3)
- `--no-selenium` - Don't use Selenium (not recommended)

**What it does:**
- Scrapes restaurant details, ratings, reviews, photos, rankings, etc.
- Saves one JSON file per restaurant: `data/tripadvisor-data/{buffet-id}.json`
- Skips restaurants that have already been scraped
- Uses Selenium by default (TripAdvisor heavily uses JavaScript)

**Expected time:** 15-30 minutes per batch (Selenium is slower)

**Output:** Individual JSON files in `data/tripadvisor-data/`

### Step 4: Merge Data

This Node.js script combines the scraped Yelp and TripAdvisor data with your existing buffet database.

```bash
node scripts/merge-yelp-tripadvisor-data.js
```

**What it does:**
- Reads all scraped Yelp and TripAdvisor JSON files
- Merges data into the existing buffet structure
- Adds new fields:
  - `yelpData` - Full Yelp data object
  - `yelpRating` - Yelp rating (for easy access)
  - `yelpReviewsCount` - Yelp review count (for easy access)
  - `tripadvisorData` - Full TripAdvisor data object
  - `tripadvisorRating` - TripAdvisor rating (for easy access)
  - `tripadvisorReviewsCount` - TripAdvisor review count (for easy access)
- Saves enriched data to: `data/buffets-by-id-enriched.json`

**Output:** `data/buffets-by-id-enriched.json`

**Note:** The script does NOT overwrite the original `buffets-by-id.json` file by default. To update the original file, you can manually copy the enriched file or modify the script.

## Data Structure

### Yelp Data Structure

```json
{
  "yelpData": {
    "yelpId": "business-name-city",
    "yelpName": "Business Name",
    "url": "https://www.yelp.com/biz/...",
    "rating": 4.5,
    "reviewCount": 123,
    "priceRange": "$$",
    "address": "123 Main St, City, State",
    "phone": "(555) 123-4567",
    "website": "https://example.com",
    "categories": ["Chinese", "Buffets"],
    "hours": {"Monday": "11:00 AM - 9:00 PM", ...},
    "photos": ["https://...", ...],
    "attributes": {"Good for Kids": true, ...},
    "reviews": [
      {
        "text": "Review text...",
        "rating": 5,
        "author": "John D.",
        "date": "2024-01-15"
      }
    ],
    "scrapedAt": "2024-01-15 12:00:00"
  }
}
```

### TripAdvisor Data Structure

```json
{
  "tripadvisorData": {
    "tripadvisorId": "g12345",
    "tripadvisorName": "Business Name",
    "url": "https://www.tripadvisor.com/...",
    "rating": 4.5,
    "reviewCount": 456,
    "priceRange": "$$ - $$$",
    "address": "123 Main St, City, State",
    "phone": "(555) 123-4567",
    "website": "https://example.com",
    "cuisines": ["Chinese", "Asian"],
    "hours": {"Monday": "11:00 AM - 9:00 PM", ...},
    "photos": ["https://...", ...],
    "features": ["Outdoor Seating", "Reservations", ...],
    "popularDishes": ["General Tso's Chicken", ...],
    "reviews": [
      {
        "text": "Review text...",
        "rating": 5,
        "author": "Jane S.",
        "date": "January 2024",
        "title": "Great food!"
      }
    ],
    "ranking": 5,
    "scrapedAt": "2024-01-15 12:00:00"
  }
}
```

## Troubleshooting

### Rate Limiting / IP Blocking

If you get blocked or see CAPTCHAs:
- Increase the `--delay` parameter (e.g., `--delay 10`)
- Process smaller batches (e.g., `--batch 5`)
- Take longer breaks between batches
- Consider using a VPN or proxy (not included in scripts)

### Selenium Issues

If Selenium fails:
- Make sure ChromeDriver is installed and in your PATH
- Try updating ChromeDriver: `brew upgrade chromedriver`
- Check that Chrome browser is installed
- Try using `--no-selenium` (may miss some content)

### Matching Issues

If restaurants aren't matching:
- Check `data/restaurant-mapping.json` to see which ones failed
- Manually verify the restaurant exists on Yelp/TripAdvisor
- The fuzzy matching threshold is 70% - you can adjust this in `match-restaurants.py`

### Missing Data

Some restaurants may not exist on Yelp or TripAdvisor, or may have different names. The scripts will skip these and continue.

## Legal and Ethical Considerations

- **Terms of Service**: Review Yelp's and TripAdvisor's Terms of Service before scraping
- **Rate Limiting**: The scripts include rate limiting to avoid overloading servers
- **Respect robots.txt**: Check each site's robots.txt file
- **Personal Use**: This is intended for personal/research use only

## Next Steps

After merging the data:

1. Review the enriched data file to ensure quality
2. Update your database schema (already done in `src/instant.schema.ts`)
3. Update your data loading functions (already done in `lib/data-instantdb.ts`)
4. Optionally create UI components to display Yelp/TripAdvisor data
5. Import enriched data into InstantDB using your existing import scripts

## Cost

All scripts are **completely free** - no API keys or paid services required. Only costs are:
- Your time
- Internet bandwidth
- Optional: ChromeDriver (free, open source)
















