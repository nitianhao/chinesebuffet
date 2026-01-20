# Finding Direct Menu URLs on Restaurant Websites - Cost Analysis

## Goal
Find **direct menu URLs** on restaurant websites (not Yelp redirects).

## Two-Step Approach

### Step 1: Get Website URLs
**Actor:** `tri_angle/yelp-scraper`
- **Cost:** $1.00 per 1,000 results
- **For 5,703 restaurants:** ~$5.70
- **Output:** Restaurant website URLs

### Step 2: Find Menu Links on Websites

#### Option A: Custom Cheerio Scraper (CHEAPEST) ⭐
**Actor:** Custom actor using `apify/cheerio-scraper` or build your own
- **Cost:** CU-based only (~$0.25 per 1,000 CUs)
- **Estimated:** ~0.1-0.3 CUs per website
- **For 5,703 websites:** ~$0.14 - $0.43
- **Total Cost:** ~$5.84 - $6.13

**How it works:**
- Scrapes each restaurant website
- Finds all links containing "menu" in URL or text
- Returns the most likely menu URL

#### Option B: Apify Web Scraper
**Actor:** `apify/web-scraper` (built-in Apify actor)
- **Cost:** CU-based (~$0.25 per 1,000 CUs)
- **Estimated:** ~0.2-0.5 CUs per website
- **For 5,703 websites:** ~$0.29 - $0.71
- **Total Cost:** ~$5.99 - $6.41

#### Option C: Restaurant Menu Scraper (Discovers Menu URLs)
**Actor:** `learned_district/wedo-scrape-menu`
- **Cost:** $15.00 per 1,000 results
- **For 5,703 restaurants:** ~$85.55
- **Total Cost:** ~$91.25 (includes Step 1)

**Note:** This actor discovers menu URLs AND extracts menu content, but it's expensive.

#### Option D: Smart Restaurant Menu Scraper (Currently Unavailable)
**Actor:** `express_kingfisher/local-restaurant-website-menu-scraper`
- **Cost:** $0.01 per 1,000 results (if available)
- **For 5,703 restaurants:** ~$0.06
- **Total Cost:** ~$5.76

---

## Recommendation: **Option A - Custom Cheerio Scraper** ⭐

### Why This is Best:
1. **Cheapest total cost:** ~$5.84 - $6.13
2. **Full control:** You can customize the menu link detection logic
3. **CU-based pricing:** Only pay for compute, not per-result
4. **Flexible:** Can try multiple menu URL patterns

### Implementation Strategy:

1. **Get website URLs** using `tri_angle/yelp-scraper` (~$5.70)
2. **For each website:**
   - Scrape the homepage
   - Find all links with "menu" in:
     - URL path (e.g., `/menu`, `/menus`, `/menu.html`)
     - Link text (e.g., "View Menu", "Our Menu")
   - Check common menu URL patterns:
     - `{website}/menu`
     - `{website}/menus`
     - `{website}/menu.html`
     - `{website}/#menu`
   - Return the first valid menu URL found

3. **Store menu URLs** in `yelp.details.menu_url`

### Cost Breakdown:
- Step 1 (Get websites): ~$5.70
- Step 2 (Find menu links): ~$0.14 - $0.43
- **Total: ~$5.84 - $6.13**

---

## Alternative: Hybrid Approach

If you want to maximize success rate:

1. **Step 1:** Get website URLs (~$5.70)
2. **Step 2a:** Try common menu URL patterns first (free, just HTTP checks)
3. **Step 2b:** For websites without obvious menu URLs, scrape to find links (~$0.14 - $0.43 for subset)

**Total Cost:** ~$5.70 - $6.13 (depending on how many need scraping)

---

## Cost Comparison

| Approach | Step 1 Cost | Step 2 Cost | Total Cost | Direct Menu URLs |
|----------|------------|-------------|------------|------------------|
| **Custom Cheerio** | $5.70 | $0.14-$0.43 | **~$5.84-$6.13** | ✅ Yes |
| Apify Web Scraper | $5.70 | $0.29-$0.71 | ~$5.99-$6.41 | ✅ Yes |
| Restaurant Menu Scraper | $5.70 | $85.55 | ~$91.25 | ✅ Yes |
| Smart Restaurant Menu Scraper | $5.70 | $0.06 | ~$5.76 | ✅ Yes (unavailable) |

**Winner:** Custom Cheerio Scraper for best cost/control balance.

---

## Implementation

See `scripts/find-menu-urls-on-websites.js` for the implementation script.


