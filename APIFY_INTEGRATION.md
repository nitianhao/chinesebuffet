# Apify Integration Guide

This guide explains how to use Apify actors in the Chinese Buffet Directory project.

## Prerequisites

1. **Apify Account**: Sign up at [https://apify.com](https://apify.com) if you don't have an account
2. **API Token**: Get your API token from [https://console.apify.com/account/integrations](https://console.apify.com/account/integrations)

## Setup

### 1. Install Dependencies

```bash
npm install
```

This will install the `apify-client` package.

### 2. Configure API Token

Add your Apify API token to `.env.local`:

```bash
APIFY_TOKEN=your_apify_token_here
```

**Important**: Never commit your API token to version control. The `.env.local` file should already be in `.gitignore`.

## Usage

### Quick Start: Run Google Maps Scraper

The easiest way to get started is using the pre-configured Google Maps scraper script:

```bash
npm run apify:google-maps -- --location "New York, NY" --max-results 50
```

Or directly:

```bash
node scripts/apify-google-maps-scraper.js --location "New York, NY" --query "Chinese buffet" --max-results 100
```

### Generic Actor Runner

Run any Apify actor with the generic runner:

```bash
npm run apify:run <actorId> [options]
```

**Examples:**

```bash
# Run with command-line arguments
npm run apify:run apify/google-maps-scraper --query "Chinese buffet" --location "Los Angeles, CA"

# Run with input JSON file
npm run apify:run apify/google-maps-scraper --input input.json

# Run without waiting (returns immediately with run ID)
npm run apify:run apify/google-maps-scraper --query "Chinese buffet" --no-wait

# Run with custom timeout (default is 1 hour)
npm run apify:run apify/google-maps-scraper --query "Chinese buffet" --timeout 7200000
```

### Check Run Status

If you ran an actor with `--no-wait`, you can check its status later:

```bash
npm run apify:check <runId> [--output results.json]
```

**Example:**

```bash
npm run apify:check abc123xyz --output results.json
```

## Available Scripts

### `scripts/apify-google-maps-scraper.js`

Pre-configured script for the Google Maps Scraper actor.

**Options:**
- `--query "search query"` - Search query (default: "Chinese buffet")
- `--location "city, state"` - Location to search (required)
- `--max-results N` - Maximum number of results (default: 100)
- `--output filename.json` - Output filename

**Example:**

```bash
node scripts/apify-google-maps-scraper.js \
  --location "San Francisco, CA" \
  --query "Chinese buffet" \
  --max-results 50 \
  --output sf_buffets.json
```

### `scripts/run-apify-actor.js`

Generic script to run any Apify actor.

**Usage:**

```bash
node scripts/run-apify-actor.js <actorId> [options]
```

**Options:**
- `--input <file>` - JSON file with actor input
- `--output <file>` - Output file for results
- `--no-wait` - Don't wait for actor to finish
- `--timeout <ms>` - Timeout in milliseconds (default: 3600000)

**Input via command line:**

Any `--key value` pairs will be added to the actor input:

```bash
node scripts/run-apify-actor.js apify/google-maps-scraper \
  --queries '["Chinese buffet New York"]' \
  --maxCrawledPlaces 100
```

**Input via JSON file:**

Create `input.json`:

```json
{
  "queries": ["Chinese buffet New York", "Chinese buffet Los Angeles"],
  "maxCrawledPlaces": 100,
  "language": "en"
}
```

Then run:

```bash
node scripts/run-apify-actor.js apify/google-maps-scraper --input input.json
```

### `scripts/check-apify-run.js`

Check the status of a running or completed actor run.

**Usage:**

```bash
node scripts/check-apify-run.js <runId> [--output <file>]
```

## Using the Apify Client Library

You can also use the Apify client directly in your own scripts:

```javascript
const { runActor, getDatasetItems, getRunStatus } = require('./lib/apify-client');

// Run an actor
const result = await runActor('apify/google-maps-scraper', {
  queries: ['Chinese buffet New York'],
  maxCrawledPlaces: 100,
});

console.log(`Got ${result.items.length} results`);

// Get dataset items from a specific dataset
const items = await getDatasetItems('datasetId', {
  limit: 100,
  offset: 0,
  clean: true, // Remove Apify metadata
});

// Check run status
const status = await getRunStatus('runId');
console.log(`Status: ${status.status}`);
```

## Popular Apify Actors for This Project

### Google Maps Scraper
- **Actor ID**: `apify/google-maps-scraper`
- **Use Case**: Scrape Google Maps search results for Chinese buffets
- **Documentation**: [https://apify.com/apify/google-maps-scraper](https://apify.com/apify/google-maps-scraper)

### Google Places Scraper
- **Actor ID**: `apify/google-places-scraper` (if available)
- **Use Case**: Scrape detailed information from Google Places

### Custom Actors
You can also create and use your own custom actors on Apify.

## Output Format

Results are saved as JSON files with an array of items. Each item structure depends on the actor used. For Google Maps Scraper, typical fields include:

- `title` / `name` - Business name
- `address` / `fullAddress` - Full address
- `totalScore` / `rating` - Rating (e.g., 4.5)
- `reviewsCount` - Number of reviews
- `location` - Coordinates (lat, lng)
- `phone` - Phone number
- `website` - Website URL
- `category` - Business category
- And more...

## Processing Apify Results

After running an Apify actor, you can process the results using your existing scripts:

```bash
# 1. Run Apify actor
npm run apify:google-maps -- --location "New York, NY" --output apify_results.json

# 2. Process the results (adapt your existing process-data.js if needed)
node scripts/process-data.js apify_results.json

# 3. Import to InstantDB
npm run import-to-db
```

## Troubleshooting

### Error: APIFY_TOKEN not found

Make sure you've added your Apify API token to `.env.local`:

```bash
APIFY_TOKEN=your_token_here
```

### Actor run fails

- Check the actor documentation for correct input format
- View the run in Apify Console: `https://console.apify.com/actors/runs/<runId>`
- Check actor logs for specific error messages

### Timeout errors

Increase the timeout:

```bash
node scripts/run-apify-actor.js <actorId> --timeout 7200000  # 2 hours
```

Or run without waiting and check status later:

```bash
node scripts/run-apify-actor.js <actorId> --no-wait
# Get runId from output, then:
node scripts/check-apify-run.js <runId>
```

## Cost Considerations

Apify charges based on:
- Compute time (actor runtime)
- Data transfer
- Storage

Check your Apify account usage at [https://console.apify.com/account/billing](https://console.apify.com/account/billing).

For free tier users, there are usually monthly limits. Consider:
- Running actors during off-peak hours
- Using `--no-wait` to start runs and checking status later
- Processing results in batches

## Next Steps

1. **Get your Apify token** and add it to `.env.local`
2. **Run a test scrape** with the Google Maps scraper
3. **Process the results** using your existing data processing pipeline
4. **Integrate into your workflow** for regular data updates

## Support

- Apify Documentation: [https://docs.apify.com](https://docs.apify.com)
- Apify Console: [https://console.apify.com](https://console.apify.com)
- Actor-specific documentation: Check each actor's page on Apify




















