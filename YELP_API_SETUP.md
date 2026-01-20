# Yelp Fusion API Setup Guide

## Getting Your Yelp API Key

The Yelp Fusion API is **free** and allows up to **5,000 calls per day**, which is perfect for matching your 367 restaurants.

### Steps:

1. **Sign up for Yelp Developer Account**
   - Go to: https://www.yelp.com/developers
   - Click "Create App" or "Sign In" if you already have an account

2. **Create a New App**
   - Log in to your Yelp account
   - Go to: https://www.yelp.com/developers/v3/manage_app
   - Click "Create New App"
   - Fill in the form:
     - **App Name**: Chinese Buffet Directory (or any name)
     - **Industry**: Food & Drink
     - **Description**: Matching Chinese buffets with Yelp listings
   - Accept the Terms of Use
   - Click "Create App"

3. **Get Your API Key**
   - After creating the app, you'll see your **API Key** (starts with something like `Bearer` or just the key itself)
   - Copy this key - you'll need it to run the matching script

## Using the API Key

You have two options:

### Option 1: Environment Variable (Recommended)

```bash
export YELP_API_KEY=your_api_key_here
python3 scripts/match-restaurants-yelp-api.py
```

To make it permanent, add to your `~/.zshrc` or `~/.bash_profile`:
```bash
echo 'export YELP_API_KEY=your_api_key_here' >> ~/.zshrc
source ~/.zshrc
```

### Option 2: Command Line Argument

```bash
python3 scripts/match-restaurants-yelp-api.py --api-key your_api_key_here
```

### Option 3: .env.local file (Most Secure)

1. Create/edit `.env.local` in the project root:
```bash
YELP_API_KEY=your_api_key_here
```

2. Update the script to read from .env.local (or we can add this support)

## API Limits

- **Free tier**: 5,000 API calls per day
- **For 367 restaurants**: You'll use ~367 calls (well under the limit)
- **Rate limiting**: The script includes a small delay (0.5s) between requests to be respectful

## Running the Matching Script

Once you have your API key set up:

```bash
# Make sure dependencies are installed
pip3 install requests fuzzywuzzy python-Levenshtein

# Run the matching script
python3 scripts/match-restaurants-yelp-api.py
```

The script will:
- Load all 367 buffets from your database
- Search Yelp for each one using the API
- Match restaurants using fuzzy name matching
- Save results to `data/restaurant-mapping.json`
- Show progress updates every 10 restaurants
- Resume capability (can stop and continue)

## What Data You'll Get

For each matched restaurant, you'll get:
- Yelp business ID
- Business name (as listed on Yelp)
- Yelp URL
- Rating and review count
- Price range ($, $$, $$$, $$$$)
- Phone number
- Address
- Categories
- Match score and reasons (how confident the match is)

## Next Steps

After matching is complete:
1. Review `data/restaurant-mapping.json` to verify matches
2. Use the Yelp business IDs/URLs for detailed scraping
3. Proceed with TripAdvisor matching (if needed)

## Troubleshooting

**"Authentication failed" error:**
- Double-check your API key is correct
- Make sure there are no extra spaces
- Try regenerating the API key from Yelp Developer portal

**"Rate limit exceeded" error:**
- Wait 24 hours (daily limit resets)
- Or upgrade to paid plan if needed

**No matches found:**
- Some restaurants may not be on Yelp
- The script uses fuzzy matching (70%+ similarity)
- You can manually add Yelp URLs to the mapping file if needed
















