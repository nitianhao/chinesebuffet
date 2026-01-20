# DoorDash Menu Scraping

This script scrapes restaurant menus from DoorDash using Apify and stores them in InstantDB.

## Prerequisites

1. **Apify Account & Token**
   - Sign up at [https://apify.com](https://apify.com)
   - Get your API token from [https://console.apify.com/account/integrations](https://console.apify.com/account/integrations)
   - Add to `.env.local`: `APIFY_TOKEN=your_token_here`

2. **InstantDB Credentials**
   - Ensure `INSTANT_ADMIN_TOKEN` is set in `.env.local`
   - Ensure `NEXT_PUBLIC_INSTANT_APP_ID` or `INSTANT_APP_ID` is set

## Usage

### Test with 10 Restaurants (Recommended First)

```bash
npm run scrape-doordash-menus -- --limit 10
```

Or directly:
```bash
node scripts/scrape-doordash-menus.js --limit 10
```

### Process More Restaurants

```bash
# Process 50 restaurants
node scripts/scrape-doordash-menus.js --limit 50

# Process all restaurants (no limit)
node scripts/scrape-doordash-menus.js --limit 99999
```

## How It Works

1. **Loads restaurants** from `data/buffets-by-id.json`
2. **Searches DoorDash** using restaurant name + location (lat/lng)
3. **Matches results** to original restaurant (name + location proximity)
4. **Extracts menu data** (categories, items, prices)
5. **Saves to InstantDB** `menus` entity linked by `placeId`

## Matching Strategy

The script matches DoorDash results to your restaurants by:
- **Name similarity** (normalized, case-insensitive)
- **Location proximity** (within 0.5 miles)
- **Combined scoring** (name match + location)

## Cost Monitoring

- **Apify Actor**: `axlymxp/doordash-store-scraper`
- **Pricing**: $1.00 per 1,000 results
- **Estimated cost for 10 restaurants**: ~$0.01

**Important**: After running, check your actual costs at:
- [Apify Console - Runs](https://console.apify.com/actors/runs)
- [Apify Console - Billing](https://console.apify.com/account/billing)

## Output

The script stores menu data in the `menus` entity with:
- `placeId` - Links to buffet via Google Place ID
- `sourceUrl` - DoorDash store URL
- `contentType` - "DOORDASH"
- `structuredData` - JSON with categories and items
- `categories` - JSON array of menu categories
- `items` - JSON array of all menu items
- `status` - SUCCESS, FAILED, or PENDING
- `scrapedAt` - Timestamp

## Menu Data Structure

```json
{
  "categories": [
    {
      "name": "Appetizers",
      "items": [
        {
          "name": "Spring Rolls",
          "description": "Crispy vegetable rolls",
          "price": "$4.99",
          "priceNumber": 4.99,
          "imageUrl": "..."
        }
      ]
    }
  ],
  "items": [...],
  "metadata": {
    "source": "DoorDash",
    "sourceUrl": "...",
    "restaurantName": "...",
    "extractedAt": "...",
    "totalCategories": 5,
    "totalItems": 50
  }
}
```

## Troubleshooting

### No Results Found
- Restaurant may not be on DoorDash
- Location may be incorrect
- Name may not match exactly

### No Match Found
- Restaurant name may differ on DoorDash
- Location may be outside search radius (1 mile)
- Check console output for found restaurants

### Schema Error
- Run `npm run sync-schema` to sync InstantDB schema

### Apify Token Error
- Verify `APIFY_TOKEN` is set in `.env.local`
- Check token is valid at [Apify Console](https://console.apify.com)

## Next Steps

1. **Test with 10 restaurants** and verify costs
2. **Check menu data quality** in InstantDB
3. **Adjust matching logic** if needed (edit script)
4. **Scale up** to more restaurants

## Notes

- The script processes restaurants sequentially with 2-second delays
- Failed restaurants are logged with error messages
- Existing menus are updated (not duplicated)
- Menu data is linked to restaurants via `placeId`





