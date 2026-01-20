# Apify Menu URL Enrichment - Cost Analysis & Recommendation

## Current Situation

- **Total Restaurants:** 5,703
- **Restaurants Needing Menu URLs:** ~5,703 (all need enrichment)
- **Existing Test Results:** You've already tested 3 Apify actors (see `APIFY_MENU_URL_TEST_RESULTS.md`)

## Cost Analysis

### Option 1: `tri_angle/yelp-scraper` ⭐ **CHEAPEST**

**Pricing:**
- **Per-result:** $1.00 per 1,000 results
- **CU-based:** ~0.08 CUs per record (from your test: 0.16135 CUs for 2 records)
- **Apify CU Pricing:** ~$0.25 per 1,000 CUs (varies by plan)

**Cost Estimates for 5,703 restaurants:**
- **Per-result pricing:** ~$5.70 ($1.00 × 5.703)
- **CU-based pricing:** ~$0.11 (0.08 CUs × 5,703 = 456 CUs × $0.25/1000)
- **Actual cost will likely be:** ~$5.70 (actors typically charge per-result when available)

**Pros:**
- ✅ Lowest cost option
- ✅ Well-tested (216,526+ total runs)
- ✅ Returns website URLs that can be used to construct menu URLs
- ✅ Returns comprehensive business data

**Cons:**
- ⚠️ Doesn't directly extract menu URLs
- ⚠️ Requires constructing menu URLs from website field
- ⚠️ Menu URLs need verification (may not exist)

**Implementation Strategy:**
1. Extract `website` field from Yelp scraper results
2. Construct menu URLs using common patterns:
   - `{website}/menu`
   - `{website}/menus`
   - `{website}/menu.html`
   - `{website}/#menu`
3. Optionally verify URLs exist (HTTP HEAD request)
4. Store in `yelp.details.menu_url` field

---

### Option 2: `igview-owner/yelp-business-data-scraper` ⭐ **DIRECT EXTRACTION**

**Pricing:**
- **Per-result:** $8.00 per 1,000 results
- **CU-based:** ~0.00003 CUs per record (from your test: 0.000189 CUs for 3 records)
- **Very low CU usage**

**Cost Estimates for 5,703 restaurants:**
- **Per-result pricing:** ~$45.62 ($8.00 × 5.703)
- **CU-based pricing:** ~$0.04 (0.00003 CUs × 5,703 = 0.17 CUs × $0.25/1000)
- **Actual cost will likely be:** ~$45.62 (actors typically charge per-result when available)

**Pros:**
- ✅ Directly extracts `menu_url` and `menu_display_url`
- ✅ Very low compute unit usage
- ✅ Fast execution (3.2s for 3 records in your test)
- ✅ Returns comprehensive business data

**Cons:**
- ⚠️ 8x more expensive than Option 1
- ⚠️ Your test showed it returned data for a different business (may need input format adjustment)

**Implementation Strategy:**
1. Use `businessUrls` format: `{ businessUrls: ["https://www.yelp.com/biz/..."] }`
2. Extract `menu_display_url` (preferred, cleaner) or `menu_url` (Yelp redirect)
3. Store in `yelp.details.menu_url` field

---

### Option 3: Custom Apify Actor (Cheerio Scraper)

**Pricing:**
- **CU-based only:** ~$0.25 per 1,000 CUs
- **Estimated CUs:** ~0.1-0.5 CUs per restaurant (depending on complexity)

**Cost Estimates for 5,703 restaurants:**
- **Conservative estimate:** ~$0.14 - $0.71 (0.1-0.5 CUs × 5,703 × $0.25/1000)
- **Requires development time**

**Pros:**
- ✅ Potentially cheapest option (CU-based only)
- ✅ Full control over scraping logic
- ✅ Can customize to your exact needs

**Cons:**
- ⚠️ Requires development time
- ⚠️ Need to handle Yelp's anti-scraping measures
- ⚠️ May need proxies/rotations

---

### Option 4: Smart Restaurant Menu Scraper (Currently Unavailable)

**Pricing:** $0.01 per 1,000 results (if available)
**Status:** ❌ Under maintenance

**If available, cost would be:** ~$0.06 for 5,703 restaurants

---

## Recommendation: **Option 1 - `tri_angle/yelp-scraper`** ⭐

### Why This is the Best Choice:

1. **Cost-Effective:** ~$5.70 for all 5,703 restaurants
2. **Proven:** Already tested and working in your environment
3. **Flexible:** Website URLs can be used for multiple purposes beyond just menu URLs
4. **Reliable:** High usage (216,526+ runs) indicates stability

### Implementation Plan:

1. **Batch Processing:**
   - Process in batches of 100-500 restaurants
   - Use Apify's dataset feature to track progress
   - Handle rate limiting and retries

2. **Menu URL Construction:**
   - Extract `website` field from results
   - Try common menu URL patterns
   - Optionally verify URLs exist before storing

3. **Cost Optimization:**
   - Use Apify's free plan ($5/month credits) to offset costs
   - Process in smaller batches to stay within free tier if possible
   - Monitor CU usage vs per-result pricing

### Estimated Total Cost:
- **Best case (CU-based):** ~$0.11
- **Worst case (per-result):** ~$5.70
- **With free plan credits:** $0.00 - $0.70

---

## Alternative: Hybrid Approach

If you want to maximize menu URL discovery:

1. **First Pass:** Use `tri_angle/yelp-scraper` to get website URLs (~$5.70)
2. **Second Pass:** For restaurants without menu URLs, use `igview-owner/yelp-business-data-scraper` on a smaller subset
3. **Total Cost:** ~$5.70 + (subset × $8.00/1000)

---

## Next Steps

1. ✅ Verify you have Apify token configured
2. ✅ Create script to batch process restaurants
3. ✅ Extract website URLs using `tri_angle/yelp-scraper`
4. ✅ Construct menu URLs from website patterns
5. ✅ Update JSON file with menu URLs
6. ✅ Monitor costs during processing

---

## Cost Comparison Summary

| Option | Cost for 5,703 Restaurants | Direct Menu URL | Development Time |
|--------|---------------------------|-----------------|------------------|
| **tri_angle/yelp-scraper** | **~$5.70** | ❌ (construct from website) | ✅ Low |
| igview-owner/yelp-business-data-scraper | ~$45.62 | ✅ Yes | ✅ Low |
| Custom Cheerio Actor | ~$0.14-$0.71 | ✅ Yes | ⚠️ High |
| Smart Restaurant Menu Scraper | ~$0.06 | ✅ Yes | ✅ Low (unavailable) |

**Winner:** `tri_angle/yelp-scraper` for best balance of cost, reliability, and ease of implementation.


