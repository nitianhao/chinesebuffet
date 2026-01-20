# Apify Google Places Menu URL Extraction - Quick Start

## 🏆 Cheapest Option

**Actor:** `compass/crawler-google-places`  
**Pricing:** $0.004 per place + $0.007 per run  
**Free Credits:** $5/month = ~1,250 places

## 🚀 Quick Commands

### Test with Single Place ID
```bash
npm run apify:menu-urls:test -- --place-id "ChIJ27isjSkjhYARsl2iAuDOEeU"
```

### Extract from JSON File
```bash
npm run apify:menu-urls -- \
  --input data/your-places.json \
  --output results/menu-urls.json
```

### Use Alternative Actor
```bash
npm run apify:menu-urls -- \
  --input data/places.json \
  --actor fatihtahta/google-maps-scraper-enterprise
```

## 💰 Cost Examples

- **100 places:** ~$0.41
- **1,000 places:** ~$4.01
- **10,000 places:** ~$40.01

## 📋 Setup

1. Add your Apify token to `.env.local`:
   ```bash
   APIFY_TOKEN=your_token_here
   ```

2. Get token from: https://console.apify.com/account/integrations

## 📚 Full Documentation

See `APIFY_GOOGLE_PLACES_MENU_URL.md` for complete guide.

## 🔄 Alternatives to Test

1. **compass/crawler-google-places** ⭐ (Cheapest - $0.004/place)
2. **fatihtahta/google-maps-scraper-enterprise** ($2.50/1,000 places)
3. **apify/google-maps-scraper** (Check current pricing)




