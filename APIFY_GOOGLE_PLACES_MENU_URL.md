# Apify Google Places Menu URL Extraction Guide

## Summary

This guide helps you extract **menu URLs** from Google Places using Apify actors. Based on research, here are the best options:

---

## 🏆 Cheapest Option: `compass/crawler-google-places`

### Pricing
- **Actor Start:** $0.007 per run
- **Place Scraped:** $0.004 per place
- **Example:** 1,000 places = $4.007 total

### Free Credits
- Apify provides **$5 in free credits per month** (Free plan)
- This covers approximately **1,250 places** per month

### Actor Details
- **Actor ID:** `compass/crawler-google-places`
- **Documentation:** [https://apify.com/compass/crawler-google-places](https://apify.com/compass/crawler-google-places)
- **Total Runs:** High usage (popular actor)

### Input Format
```json
{
  "searchTerms": ["Chinese buffet"],
  "location": "New York, NY",
  "maxPlaces": 100,
  "includeMenu": true
}
```

### Output Fields
The actor returns data with menu-related fields:
- `menuUrl` - Direct menu URL (if available)
- `menu` - Menu object with menu information
- `website` - Restaurant website (can be used to construct menu URLs)

---

## 💰 Alternative Option: `fatihtahta/google-maps-scraper-enterprise`

### Pricing
- **$2.50 per 1,000 saved places**
- More expensive but may have additional features

### Actor Details
- **Actor ID:** `fatihtahta/google-maps-scraper-enterprise`
- **Documentation:** [https://apify.com/fatihtahta/google-maps-scraper-enterprise](https://apify.com/fatihtahta/google-maps-scraper-enterprise)

---

## 📋 Other Alternatives to Test

### 1. `apify/google-maps-scraper`
- **Actor ID:** `apify/google-maps-scraper`
- **Pricing:** Pay-per-use (check current pricing)
- **Note:** May not directly extract menu URLs, but returns comprehensive place data

### 2. Custom Google Places API Integration
- Use Google Places API directly (requires API key)
- More control but requires more setup
- Pricing: Pay-per-request model

---

## 🚀 Quick Start

### Prerequisites
1. **Apify Account:** Sign up at [https://apify.com](https://apify.com)
2. **API Token:** Get from [https://console.apify.com/account/integrations](https://console.apify.com/account/integrations)
3. **Add Token to `.env.local`:**
   ```bash
   APIFY_TOKEN=your_apify_token_here
   ```

### Run Menu URL Extraction

#### Option 1: Using the provided script
```bash
node scripts/extract-google-places-menu-urls.js \
  --input data/your-places.json \
  --output results/menu-urls.json \
  --actor compass/crawler-google-places
```

#### Option 2: Using the generic Apify runner
```bash
node scripts/run-apify-actor.js compass/crawler-google-places \
  --searchTerms '["Chinese buffet"]' \
  --location "New York, NY" \
  --maxPlaces 100 \
  --includeMenu true
```

---

## 📊 Cost Estimation

### For 1,000 Places
- **compass/crawler-google-places:** ~$4.01
- **fatihtahta/google-maps-scraper-enterprise:** ~$2.50

### For 10,000 Places
- **compass/crawler-google-places:** ~$40.01
- **fatihtahta/google-maps-scraper-enterprise:** ~$25.00

### Monthly Free Credits
- **$5 free credits** = ~1,250 places (using compass/crawler-google-places)

---

## 🔍 Menu URL Extraction Strategy

### Method 1: Direct Menu URL (Preferred)
If the actor returns `menuUrl` directly:
```javascript
const menuUrl = place.menuUrl || place.menu?.url || place.menuUrl;
```

### Method 2: Construct from Website
If only website is available:
```javascript
const website = place.website;
const menuUrl = website ? `${website}/menu` : null;
// Try common patterns:
// - {website}/menu
// - {website}/menus
// - {website}/menu.html
// - {website}/#menu
```

### Method 3: Extract from Menu Object
```javascript
const menuUrl = place.menu?.url || 
                place.menu?.actionUrl || 
                place.menu?.externalActionUrl ||
                place.menu?.displayUrl;
```

---

## 📝 Output Format

The script will extract and save menu URLs in this format:

```json
{
  "placeId": "ChIJ27isjSkjhYARsl2iAuDOEeU",
  "name": "Kings Buffet",
  "menuUrl": "https://example.com/menu",
  "source": "compass/crawler-google-places",
  "extractedAt": "2025-01-15T10:30:00Z"
}
```

---

## 🧪 Testing

### Test with a Single Place
```bash
node scripts/extract-google-places-menu-urls.js \
  --test \
  --place-id "ChIJ27isjSkjhYARsl2iAuDOEeU"
```

### Test with Small Batch
```bash
node scripts/extract-google-places-menu-urls.js \
  --input data/test-places.json \
  --max-places 10 \
  --output results/test-menu-urls.json
```

---

## ⚠️ Important Notes

1. **Menu URLs may not be available for all places** - Google Places doesn't always have menu URLs
2. **Menu URLs may be redirect URLs** - Some may need to be followed to get the actual menu
3. **Rate Limits** - Be aware of Apify rate limits and your account limits
4. **Free Tier** - Free plan has monthly limits, check your usage

---

## 📚 Additional Resources

- [Apify Console](https://console.apify.com)
- [Apify Documentation](https://docs.apify.com)
- [Google Places API Documentation](https://developers.google.com/maps/documentation/places)

---

## 🔄 Next Steps

1. **Test the cheapest option** (`compass/crawler-google-places`) with a small batch
2. **Verify menu URL extraction** works correctly
3. **Compare results** with alternative actors if needed
4. **Scale up** to process all your places
5. **Update your database** with extracted menu URLs

---

## 💡 Tips

- Start with a small test batch (10-50 places) to verify costs and results
- Use `--no-wait` flag for large batches to avoid timeouts
- Check actor documentation for latest pricing and features
- Monitor your Apify usage in the console
- Use free credits strategically for testing




