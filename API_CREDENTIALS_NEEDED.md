# API Credentials Needed

## Yelp Fusion API (Required for Matching)

To use the Yelp API matching script, you need:

### 1. Yelp API Key

**How to get it:**
1. Go to https://www.yelp.com/developers
2. Sign up / Log in with your Yelp account
3. Click "Create New App"
4. Fill in the form (any name/description is fine)
5. Copy your API Key

**Cost:** FREE (5,000 calls/day is plenty for 367 restaurants)

**How to provide it:**

Option 1 - Environment variable (recommended):
```bash
export YELP_API_KEY=your_api_key_here
```

Option 2 - Command line:
```bash
python3 scripts/match-restaurants-yelp-api.py --api-key your_api_key_here
```

Option 3 - .env.local file:
Add to `.env.local`:
```
YELP_API_KEY=your_api_key_here
```

## TripAdvisor API (Optional - for future use)

TripAdvisor Content API exists but requires:
- Business/enterprise approval
- Usually requires partnership

**Alternative:** We can scrape TripAdvisor directly with Selenium once we have the URLs from Yelp matches (many restaurants have TripAdvisor links on their Yelp pages).

## Next Steps

1. **Get your Yelp API key** (follow steps above)
2. **Set it as environment variable:**
   ```bash
   export YELP_API_KEY=your_key_here
   ```
3. **Run the matching script:**
   ```bash
   python3 scripts/match-restaurants-yelp-api.py
   ```

This will take about 5-10 minutes for 367 restaurants and will create the mapping file needed for scraping.
















