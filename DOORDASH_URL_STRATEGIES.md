# Strategies for Getting DoorDash Store URLs

There are several approaches to find DoorDash store URLs for restaurants:

## Approach 1: Check Existing Data ✅ (Fastest)

**Check if URLs already exist in your database:**

- **`website` field**: Some restaurants already have DoorDash URLs stored here
- **`orderBy` field**: Google Maps sometimes provides delivery platform links here (array of `{name, orderUrl}`)

**Pros:**
- Instant, no API calls needed
- Free
- Already have some data (found at least 1 restaurant with DoorDash URL in website field)

**Cons:**
- Most restaurants won't have this data populated
- `orderBy` field is mostly null in your database

---

## Approach 2: Web Scraping with Puppeteer 🌐 (Most Reliable)

**Directly search DoorDash website:**

1. Navigate to: `https://www.doordash.com/search/store/{restaurant-name} {city} {state}/`
2. Scrape search results for store links
3. Match restaurants by name similarity
4. Extract DoorDash store URLs (format: `https://www.doordash.com/store/store-name-store-id/`)

**Implementation:** `scripts/find-doordash-urls.js`

**Pros:**
- Gets real-time data from DoorDash
- Can match by name + location
- Free (no Apify costs for this step)

**Cons:**
- Slower (needs to load pages)
- May hit rate limits
- Requires maintaining scraping logic if DoorDash changes their HTML

---

## Approach 3: Use Apify Web Scraper 🤖 (Automated)

**Use Apify's `apify/web-scraper` or `apify/puppeteer-scraper`:**

Similar to Approach 2, but automated through Apify infrastructure.

**Pros:**
- Handles rate limiting and retries
- Can scale better
- Browser automation handled by Apify

**Cons:**
- Costs money (Apify compute units)
- May be slower due to Apify infrastructure

---

## Approach 4: Two-Step Process 🔄 (Recommended)

**Combined workflow:**

1. **Step 1**: Find DoorDash URLs (use Approach 1 + 2)
   - Check existing data first (free)
   - Web scrape for missing ones
   - Save URLs to a file: `data/doordash-urls.json`

2. **Step 2**: Scrape menus using `tri_angle/doordash-store-details-scraper`
   - Use the URLs from Step 1
   - Extract menu data for each URL
   - Save to InstantDB

**Script:** `scripts/find-doordash-urls.js` (Step 1) + modified `scrape-doordash-menus.js` (Step 2)

---

## Recommended Workflow

```bash
# Step 1: Find DoorDash URLs for 10 restaurants
node scripts/find-doordash-urls.js --limit 10

# This creates/updates: data/doordash-urls.json

# Step 2: Scrape menus from found URLs
node scripts/scrape-doordash-menus-from-urls.js --urls-file data/doordash-urls.json
```

---

## DoorDash URL Format

DoorDash store URLs follow this pattern:
```
https://www.doordash.com/store/{store-name-slug}-{store-id}/
```

Example:
```
https://www.doordash.com/store/tokyo-mandarin-knoxville-634344/
```

---

## Cost Comparison

| Approach | Cost | Speed | Reliability |
|----------|------|-------|-------------|
| **Check Existing** | Free | Instant | Low (limited data) |
| **Puppeteer Scraping** | Free | Slow | High |
| **Apify Web Scraper** | ~$0.15-0.45/1K pages | Medium | High |
| **Find URLs + Scrape** | $1.00/1K results | Medium | High |

**For 10 restaurants:**
- Finding URLs with Puppeteer: Free
- Scraping menus: ~$0.01
- **Total: ~$0.01**

---

## Next Steps

1. **Test URL finding**: Run `find-doordash-urls.js` on 10 restaurants
2. **Verify URLs work**: Check a few URLs manually
3. **Update menu scraper**: Modify to accept DoorDash URLs as input
4. **Full pipeline**: Run both steps for all restaurants

---

## Alternative: Direct Store ID Search

If you can find DoorDash store IDs another way (e.g., from Google Maps API `orderBy` field), you can construct URLs directly:

```javascript
const storeId = "634344"; // From orderBy data
const storeName = "tokyo-mandarin-knoxville"; // Slugified name
const url = `https://www.doordash.com/store/${storeName}-${storeId}/`;
```

This is the most efficient if Google Maps provides DoorDash store IDs in the `orderBy` field.





