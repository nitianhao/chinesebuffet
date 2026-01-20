# Apify Google Maps Reviews Scraper Setup

## Setup Instructions

### 1. Create `.env.local` file

Create a `.env.local` file in the project root with your Apify API token:

```bash
APIFY_TOKEN=8jZbabiDjHQiHregEYBRGHJEJ
```

**Note:** The `.env.local` file is already in `.gitignore` so it won't be committed to version control.

### 2. Understanding the ID Format

The IDs in `apify-reviews-cities.json` are UUIDs (e.g., `9a8d4d8b-a2a9-4e50-a649-3317e1a34143`). These are likely internal database IDs, not Google Place IDs.

**Important:** The Apify actor `compass/Google-Maps-Reviews-Scraper` requires Google Maps URLs or Google Place IDs. You have a few options:

#### Option A: Add Google Maps URLs to JSON (Recommended)
Add a `url` field to each entry in `apify-reviews-cities.json`:

```json
{
  "Title": "Asian Garden Restaurant",
  "ID": "9a8d4d8b-a2a9-4e50-a649-3317e1a34143",
  "City": "Boston",
  "url": "https://www.google.com/maps/place/Asian+Garden+Restaurant/@42.3501,-71.0662,15z"
}
```

#### Option B: Look up Place IDs from Database
If your UUIDs correspond to entries in your database, you can look up the `placeId` field and use that.

#### Option C: Use Search Query
The script will try to construct a URL using the place_id format, but this may not work for UUIDs.

### 3. Running the Script

#### Test on First ID (Recommended First Step)
```bash
npm run apify:reviews:test
```

Or directly:
```bash
node scripts/scrape-google-maps-reviews.js --test
```

#### Process All IDs
```bash
npm run apify:reviews:all
```

Or directly:
```bash
node scripts/scrape-google-maps-reviews.js --all
```

#### Custom Options
```bash
# Test with custom max reviews
node scripts/scrape-google-maps-reviews.js --test --max-reviews 100

# Use custom input/output files
node scripts/scrape-google-maps-reviews.js --test --input "path/to/input.json" --output "path/to/output.json"
```

## Script Features

- ✅ Scrapes up to 50 reviews per place (configurable)
- ✅ Sorts reviews by newest first
- ✅ Transforms reviews to match your Review interface
- ✅ Adds reviews back to the JSON file
- ✅ Shows cost information for each scrape
- ✅ Handles errors gracefully (continues if one place fails)

## Output Format

The script will add a `reviews` array to each place object in the JSON file:

```json
{
  "Title": "Asian Garden Restaurant",
  "ID": "9a8d4d8b-a2a9-4e50-a649-3317e1a34143",
  "City": "Boston",
  "reviews": [
    {
      "name": "John Doe",
      "stars": 5,
      "text": "Great food!",
      "publishAt": "2024-01-15T10:30:00Z",
      ...
    }
  ],
  "reviewsCount": 50,
  "lastScrapedAt": "2024-01-20T12:00:00Z"
}
```

## Cost Information

The script displays cost information for each scrape:

- **Cost per review**: ~$0.0006 (based on Apify pricing: $0.60 per 1,000 reviews)
- **Compute cost**: Based on actor runtime
- **Total cost**: Sum of review cost + compute cost

**Example for 50 reviews:**
- Review cost: ~$0.03
- Compute cost: ~$0.01-0.05 (depending on runtime)
- **Total: ~$0.04-0.08 per place**

## Troubleshooting

### Error: APIFY_TOKEN not found
Make sure you've created `.env.local` with your token.

### Error: Actor run failed
- Check that the Google Maps URL is valid
- Verify your Apify account has sufficient credits
- Check the actor documentation for any changes to input format

### No reviews returned
- The place might not have reviews
- The URL might be incorrect
- The actor might need a different URL format

### UUID IDs not working
If your IDs are UUIDs (not Google Place IDs), you need to:
1. Add `url` fields to your JSON file, OR
2. Look up the Google Place ID from your database using the UUID

## Next Steps

1. **Test on first ID**: Run `npm run apify:reviews:test`
2. **Verify output**: Check that reviews are correctly formatted
3. **Check cost**: Review the cost information displayed
4. **Process all**: Once verified, run `npm run apify:reviews:all`

















