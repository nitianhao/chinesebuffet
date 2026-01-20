# Apify Yelp Attributes Scraper Setup

## Summary

Found an Apify scraper that can extract Yelp business attributes at **$10.00 per 1,000 results** (pay-per-result pricing).

**Actor:** `delicious_zebu/yelp-advanced-business-scraper-pay-per-result`
**URL:** https://apify.com/delicious_zebu/yelp-advanced-business-scraper-pay-per-result

## Current Status

- **Total records:** 5,703
- **Records with Yelp data:** 3,744
- **Records with attributes:** 508
- **Records missing attributes:** 3,236 (need to scrape)

## Cost Estimate

For 3,236 URLs:
- **Cost:** ~$32.36 (3,236 / 1,000 × $10.00)

## What It Extracts

The scraper extracts attributes in the `amenities` field, including:
- Offers Delivery
- Offers Takeout
- Takes Reservations
- Vegan Options
- Accepts Credit Cards
- Accepts Apple Pay
- Outdoor Seating
- Good for Groups
- Good For Kids
- Wheelchair accessible
- Wi-Fi
- Alcohol
- And many more...

## How to Use

### Option 1: Direct URL Input (Recommended)

The scraper accepts Yelp business URLs directly. You can input a list of URLs from your JSON file.

### Option 2: Using the Apify Client

See `scripts/scrape-yelp-attributes-apify.js` for a script that:
1. Reads your JSON file
2. Extracts Yelp URLs for records missing attributes
3. Calls the Apify scraper
4. Merges the attributes back into your JSON file

## Input Format

The scraper accepts:
- **URLs:** Array of Yelp business URLs (e.g., `https://www.yelp.com/biz/kings-buffet-vacaville`)
- **OR** Search keywords + locations

For your use case, use the URL input mode since you already have the Yelp URLs.

## Output Format

The scraper returns data with an `amenities` object containing all the attributes:

```json
{
  "amenities": {
    "Offers Delivery": true,
    "Offers Takeout": true,
    "Accepts Credit Cards": true,
    "Good For Kids": true,
    ...
  }
}
```

## Next Steps

1. Run `python3 check-missing-attributes.py` to generate the list of URLs
2. Use the Apify scraper with those URLs
3. Map the `amenities` field to your JSON structure's `attributes` field
4. Merge the results back into `yelp-restaurant-mapping.json`






