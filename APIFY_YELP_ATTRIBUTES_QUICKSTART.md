# Quick Start: Scraping Yelp Attributes with Apify

## Overview

This guide will help you scrape Yelp business attributes using the **cheapest Apify scraper** available.

**Scraper:** `agents/yelp-business`  
**Cost:** $0.0005 per record (~$1.62 for all 3,236 records)  
**Status:** 3,236 records missing attributes

## Prerequisites

1. **Apify Account** with credits
2. **Apify Token** - Get it from: https://console.apify.com/account/integrations

## Setup

### Option 1: Using .env.local file (Recommended)

Create a `.env.local` file in the project root:

```bash
APIFY_TOKEN=your_apify_token_here
```

### Option 2: Using Environment Variable

```bash
export APIFY_TOKEN=your_apify_token_here
```

## Running the Script

### Test Run (50 records)

First, test with 50 records to verify everything works:

```bash
node scripts/scrape-yelp-attributes-apify.js
```

This will:
- ✅ Skip records that already have attributes
- ✅ Process only the first 50 records missing attributes
- ✅ Show progress for each record
- ✅ Save results incrementally
- ✅ Display estimated cost (~$0.025)

**After the test:**
1. Check your Apify console to verify usage and cost
2. Verify the attributes were added correctly to a few records
3. If everything looks good, proceed to full run

### Full Run (All 3,236 records)

Once you've verified the test works:

1. Edit `scripts/scrape-yelp-attributes-apify.js`
2. Change line 23: `const TEST_LIMIT = 50;` to `const TEST_LIMIT = null;`
3. Run again:

```bash
node scripts/scrape-yelp-attributes-apify.js
```

**Estimated cost:** ~$1.62 for all 3,236 records

## What Gets Scraped

The script will extract attributes like:
- `business_accepts_credit_cards`
- `good_for_kids`
- `restaurants_good_for_groups`
- `restaurants_delivery`
- `restaurants_take_out`
- `outdoor_seating`
- `wi_fi`
- `alcohol`
- `bike_parking`
- And many more...

## Output

Results are saved to: `Example JSON/yelp-restaurant-mapping.json`

The script:
- ✅ Automatically skips records that already have attributes
- ✅ Processes in batches of 50
- ✅ Saves progress after each batch
- ✅ Shows which records were processed

## Monitoring

Check your Apify console at: https://console.apify.com/

You can monitor:
- Real-time run status
- Actual costs incurred
- Number of records processed
- Any errors

## Troubleshooting

### Error: APIFY_TOKEN not found
- Make sure you've set the token in `.env.local` or as an environment variable
- Verify the token is valid at https://console.apify.com/account/integrations

### Script stops or errors
- Check the Apify console for run details
- The script saves progress after each batch, so you can resume
- Failed records won't be saved, so you can re-run safely

### Attributes not matching expected format
- The script maps Apify's format to Yelp API format automatically
- Some attributes may have slightly different names (this is expected)
- Check a few sample records to verify the mapping

## Cost Breakdown

- **Test (50 records):** ~$0.025
- **Full run (3,236 records):** ~$1.62
- **Per record:** $0.0005

This is **20x cheaper** than the alternative scraper ($32.36 for the same data)!






