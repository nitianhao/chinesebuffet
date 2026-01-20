# Apify Menu URL Extraction Test Results

## Summary

Tested 3 Apify actors to determine which can extract `menu_url` from Yelp business pages and their associated costs.

**Date:** December 30, 2024  
**Test Sample:** 3 records without menu_url  
**Total Records Needing menu_url:** 3,586

---

## Test Results

### 1. tri_angle/yelp-scraper ✅

- **Actor ID:** `tri_angle/yelp-scraper`
- **Pricing:** $1.00 per 1,000 results (from web search)
- **Test Run ID:** 3uhXsZYTd8HkjWenx (successful test)
- **Status:** ✅ **SUCCESS** - Returns data with website URLs
- **Duration:** 146.19s for 2 records
- **Compute Units:** 0.16135 CUs per 2 records
- **Estimated Cost:** $0.004 per 2 records
- **Input Format:** `{ directUrls: ["https://www.yelp.com/biz/..."] }` ✅ **WORKING**
- **Result:** ✅ Successfully returns business data including `website` field

#### Output Structure

The actor returns comprehensive business data:

```json
{
  "directUrl": "https://www.yelp.com/biz/kings-buffet-vacaville",
  "bizId": "L7yD75ulqF7Q8KV0UZM5JQ",
  "name": "King's Buffet",
  "website": "https://kingsbuffet.shop",
  "phone": "(707) 448-8808",
  "address": { ... },
  "aggregatedRating": 2.2,
  "reviewCount": 332,
  "operationHours": [ ... ],
  "amenitiesAndMore": [ ... ],
  ...
}
```

**Key Field:** `website` - Contains restaurant website URL

**Menu URL Strategy:** Use the `website` field to construct common menu URL patterns:
- `{website}/menu`
- `{website}/menus`
- `{website}/menu.html`
- etc.

**Estimated Cost for 3,586 records:** 
- Based on pricing: ~$3.59 ($1.00 per 1,000 × 3.586)
- Based on CU usage: ~$0.65 (0.16135 CUs per 2 records × 1793 batches)

---

### 2. web_wanderer/yelp-scraper

- **Actor ID:** `web_wanderer/yelp-scraper`
- **Pricing:** Pay-per-event (not specified)
- **Test Run ID:** UV0KS3ex9uMqxOKnA
- **Status:** ❌ Failed - Returned 0 items
- **Duration:** 7.46s
- **Compute Units:** 0.000956 CUs
- **Estimated Cost:** $0.0000 per 3 records
- **Input Format Used:** `{ urls: ["..."] }`
- **Result:** No data returned. Actor may require different input format or may not be working correctly.

**Estimated Cost for 3,586 records:** ~$0.03 (based on CU usage)

---

### 3. igview-owner/yelp-business-data-scraper ⭐

- **Actor ID:** `igview-owner/yelp-business-data-scraper`
- **Pricing:** $8.00 per 1,000 results (from web search)
- **Test Run ID:** Wckh4hfNr0S79xgW0
- **Status:** ✅ Success - Returned data with menu_url
- **Duration:** 3.20s
- **Compute Units:** 0.000189 CUs
- **Estimated Cost:** $0.0000 per 3 records (based on CU usage)
- **Input Format Used:** `{ businessUrls: ["..."] }`
- **Result:** ✅ **SUCCESS** - Actor returned data with menu_url field!

#### Output Structure

The actor returns data with the following menu-related fields:

```json
{
  "menu_url": "https://m.yelp.com/biz_redir?link_source=yelp_app&s=...&url=https%3A%2F%2Fstjames-dc.com%2Fmenu%2F&website_link_type=menu",
  "menu_display_url": "https://stjames-dc.com/menu/",
  "menu": {
    "action_url": "https://m.yelp.co.uk/menu/8h3jCN0ckKZZfogt0V0lOQ",
    "external_action_url": "https://m.yelp.com/biz_redir?link_source=yelp_app&s=...&url=https%3A%2F%2Fstjames-dc.com%2Fmenu%2F&website_link_type=menu",
    "action_title": "Explore the Menu",
    "action_text": "Jerk wings, Oxtails, Pepper Shrimp"
  }
}
```

**Key Fields:**
- `menu_url` - Yelp redirect URL to menu
- `menu_display_url` - Direct URL to menu (cleaner, preferred)
- `menu.external_action_url` - Alternative menu URL

**Estimated Cost for 3,586 records:** 
- Based on pricing: ~$28.69 ($8.00 per 1,000 × 3.586)
- Based on CU usage: ~$0.02 (very low CU usage)

**Note:** The test returned data for a different business than requested, suggesting the actor may need URL format adjustment or there may be an issue with URL matching.

---

## Recommendations

### ✅ Recommended: igview-owner/yelp-business-data-scraper

**Pros:**
- ✅ Successfully extracts `menu_url` and `menu_display_url`
- ✅ Very low compute unit usage (cost-effective)
- ✅ Fast execution (3.2s for test)
- ✅ Returns comprehensive business data

**Cons:**
- ⚠️ Higher per-result pricing ($8.00 per 1,000 vs $1.00)
- ⚠️ Test returned data for different business (may need input format adjustment)

**Action Items:**
1. Verify correct input format for `igview-owner/yelp-business-data-scraper`
2. Test with a single URL to confirm it matches correctly
3. If working correctly, proceed with full run
4. Extract `menu_display_url` (cleaner) or `menu_url` (Yelp redirect) based on preference

### ✅ Alternative: tri_angle/yelp-scraper (General Approach)

**Pros:**
- ✅ Lower per-result pricing ($1.00 per 1,000 vs $8.00)
- ✅ Popular actor (216,526 total runs)
- ✅ Successfully returns website URLs
- ✅ Can use website URLs to construct menu URL patterns
- ✅ Returns comprehensive business data

**Cons:**
- ⚠️ Doesn't directly extract menu URLs
- ⚠️ Requires constructing menu URLs from website field
- ⚠️ Menu URLs need to be verified (may not exist)

**Action Items:**
1. ✅ Use `directUrls` format: `{ directUrls: ["https://www.yelp.com/biz/..."] }`
2. Extract `website` field from results
3. Construct menu URLs using common patterns:
   - `{website}/menu`
   - `{website}/menus`
   - `{website}/menu.html`
   - `{website}/#menu`
4. Optionally verify URLs exist (HTTP HEAD request)
5. Store in `yelp.details.menu_url` field

**General Menu URL Finding Strategy:**
1. Get website URL from Yelp scraper
2. Try common menu URL patterns
3. Optionally scrape website to find menu links
4. Use most common pattern (`/menu`) as fallback

### ❌ Not Recommended: web_wanderer/yelp-scraper

**Pros:**
- Very low CU usage

**Cons:**
- ❌ Did not return data in test
- Unclear pricing structure
- Lower user base (2,005 total runs)

---

## Cost Comparison

| Actor | Per 1,000 Results | For 3,586 Records | CU-Based Estimate | Menu URL Method |
|-------|-------------------|-------------------|-------------------|----------------|
| **tri_angle/yelp-scraper** | **$1.00** | **~$3.59** | **~$0.65** | **Website URL patterns** ✅ |
| web_wanderer/yelp-scraper | Unknown | Unknown | ~$0.03 | ❌ Not working |
| igview-owner/yelp-business-data-scraper | $8.00 | ~$28.69 | ~$0.02 | Direct extraction ✅ |

**Note:** CU-based estimates are very low and may not reflect actual pricing if actors use pay-per-result models.

**Recommendation:** Use `tri_angle/yelp-scraper` for cost-effectiveness, then construct menu URLs from website field using common patterns.

---

## Next Steps

1. **Verify igview-owner/yelp-business-data-scraper input format**
   - Test with a single known URL
   - Confirm it returns data for the correct business
   - Check if URL format needs adjustment

2. **If igview-owner works correctly:**
   - Create script to process all 3,586 records
   - Extract `menu_display_url` (preferred) or `menu_url`
   - Update JSON file with menu URLs
   - Estimated cost: ~$28.69

3. **If tri_angle needs investigation:**
   - Review actor documentation
   - Try alternative input formats
   - Test with single URL
   - If successful, could save ~$25 (cost difference)

4. **Data Extraction:**
   - Use `menu_display_url` when available (cleaner URL)
   - Fall back to `menu_url` if `menu_display_url` not available
   - Store in `yelp.details.menu_url` field

---

## Test Run Links

- tri_angle/yelp-scraper: https://console.apify.com/actors/runs/PIwFIm6OnO1qT8hRa
- web_wanderer/yelp-scraper: https://console.apify.com/actors/runs/UV0KS3ex9uMqxOKnA
- igview-owner/yelp-business-data-scraper: https://console.apify.com/actors/runs/Wckh4hfNr0S79xgW0

---

## Files Generated

- `scripts/test-apify-menu-url-actors.js` - Test script
- `apify-menu-url-test-results.json` - Detailed test results in JSON format
- `APIFY_MENU_URL_TEST_RESULTS.md` - This summary document

