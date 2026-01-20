# Google Places API Scraping Guide

## Prerequisites

1. **Google Cloud Project Setup**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the **Places API (New)** in the API Library
   - Create an API key in "Credentials"
   - (Recommended) Restrict the API key to only the Places API

2. **Add API Key to Environment**
   - Add your API key to `.env.local`:
     ```
     GOOGLE_MAPS_API_KEY=your_api_key_here
     ```

## Usage

### Basic Usage

Scrape all cities (this will take a long time!):
```bash
npm run scrape-google-places
```

### Scrape a Specific City

```bash
npm run scrape-google-places -- --city "New York" --state "New York"
```

### Scrape a Specific State

```bash
npm run scrape-google-places -- --state "California"
```

### Limit Number of Cities

```bash
npm run scrape-google-places -- --limit 5
```

### Custom Output File

```bash
npm run scrape-google-places -- --output "my_results.json"
```

### Additional Data Parameters

Control how much data to scrape per place:

```bash
# Get more results per city (default: 20)
npm run scrape-google-places -- --max-results 50

# Get more reviews per place (default: 5)
npm run scrape-google-places -- --max-reviews 10

# Get more photos per place (default: 10)
npm run scrape-google-places -- --max-photos 20
```

### Combined Options

```bash
npm run scrape-google-places -- --state "Texas" --limit 10 --max-results 30 --max-reviews 10 --output "texas_buffets.json"
```

## How It Works

1. **Loads Cities**: Reads from `Research/us_cities_over_100k_2024_census_estimates.csv`
2. **Searches**: Uses Google Places Text Search API with query "Chinese buffet [City] [State]"
3. **Gets Details**: Fetches detailed information for each place found
4. **Filters**: Filters results to only include Chinese buffets
5. **Saves**: Outputs JSON file in the same format as your existing data

## Additional Data Fields

The script now collects extensive data for each place:

### Basic Information
- Name, address, location (lat/lng), viewport
- Phone numbers (formatted and international)
- Website URL, Google Maps URL
- Plus code, primary type

### Ratings & Reviews
- Overall rating and review count
- Individual reviews (up to 10 by default) with:
  - Author name
  - Rating
  - Review text
  - Publish time

### Photos
- Photo metadata (up to 10 by default)
- Photo URLs (requires API key to access)
- Photo dimensions and author attribution

### Hours & Status
- Regular opening hours (weekly schedule)
- Current opening hours (real-time)
- Business status (open, closed temporarily/permanently)

### Services & Amenities
- **Service Options**: Takeout, Dine-in, Delivery, Reservable
- **Food Service**: Breakfast, Lunch, Dinner, Brunch, Beer, Wine, Vegetarian, Dessert, Cocktails, Coffee
- **Payment Options**: Credit card, Debit card, Cash, NFC payment
- **Parking Options**: Free/paid parking lots, street parking, valet, garage parking
- **Accessibility**: Wheelchair accessible parking, entrance, restroom, seating

### Additional
- Editorial summary (Google's description)
- Icon information
- Categories and types

## Rate Limiting

- The script automatically handles rate limiting (100 requests per 100 seconds)
- Adds delays between requests to stay within limits
- Implements exponential backoff for retries on errors
- Saves progress every 10 cities processed

## API Costs

**Important**: Google Places API pricing (as of 2024):
- Text Search: $32 per 1,000 requests
- Place Details: $17 per 1,000 requests

For each city, the script makes:
- 1 Text Search request
- N Place Details requests (where N = number of results found)

**Example**: If you scrape 100 cities and find 5 places per city on average:
- 100 Text Search requests = $3.20
- 500 Place Details requests = $8.50
- **Total: ~$11.70**

## Tips

1. **Start Small**: Test with `--limit 1` or a specific city first
2. **Monitor Costs**: Check your Google Cloud billing dashboard
3. **Progress Saves**: The script saves progress every 10 cities (look for `*_progress.json` files)
4. **Resume**: If interrupted, you can manually merge progress files

## Troubleshooting

### "API key not found"
- Make sure `.env.local` exists and contains `GOOGLE_MAPS_API_KEY=your_key`

### "API key not valid"
- Verify the API key in Google Cloud Console
- Make sure Places API (New) is enabled
- Check if API key restrictions are too strict

### Rate limit errors
- The script should handle this automatically with retries
- If persistent, increase `RATE_LIMIT_DELAY` in the script

### No results found
- Some cities may not have Chinese buffets
- Try broader search terms (the script searches for "Chinese buffet")

## Next Steps

After scraping:
1. Review the output JSON file
2. Use `npm run import-google-places` to import to InstantDB
3. Or use `npm run process-data` to process for static JSON files





















