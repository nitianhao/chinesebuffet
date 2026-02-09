# Quick Start Guide

## 1. Install Dependencies

```bash
cd scraper
npm install
```

## 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Google Maps API key:

```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

## 3. Prepare Input File

Create a file with Google Place IDs. Example formats:

**JSON** (`places.json`):
```json
["ChIJN1t_tDeuEmsRUsoyG83frY4", "ChIJN1t_tDeuEmsRUsoyG83frY5"]
```

**CSV** (`places.csv`):
```csv
place_id
ChIJN1t_tDeuEmsRUsoyG83frY4
ChIJN1t_tDeuEmsRUsoyG83frY5
```

**TXT** (`places.txt`):
```
ChIJN1t_tDeuEmsRUsoyG83frY4
ChIJN1t_tDeuEmsRUsoyG83frY5
```

## 4. Run the Scraper

```bash
# Basic usage
tsx src/index.ts --input places.json

# With export
tsx src/index.ts --input places.json --export

# Custom concurrency (be more polite)
tsx src/index.ts --input places.json --max-concurrent 1 --min-delay 5000
```

## 5. Check Results

- **Database**: `./data/tripadvisor_reviews.db` - Use SQLite browser or CLI
- **Raw HTML**: `./data/raw/{place_id}/*.html` - Debug snapshots
- **Export**: `./data/exports/reviews.ndjson` - If using `--export`

## Query the Database

```bash
# Using sqlite3 CLI
sqlite3 data/tripadvisor_reviews.db

# Example queries:
SELECT COUNT(*) FROM places;
SELECT COUNT(*) FROM ta_reviews;
SELECT status, COUNT(*) FROM places GROUP BY status;
SELECT * FROM ta_reviews LIMIT 10;
```

## Resuming

The scraper automatically resumes from where it left off. Just run the same command again:

```bash
tsx src/index.ts
```

It will process places with status `pending` or `retry` that are due to run.

## Troubleshooting

### "No reviews extracted"

1. Check raw HTML files in `./data/raw/{place_id}/`
2. Verify TripAdvisor URL was correctly mapped:
   ```sql
   SELECT place_id, google_name, ta_url FROM places WHERE ta_url IS NOT NULL;
   ```

### "Blocked by TripAdvisor"

Places are marked as `blocked`. Wait and retry later, or reduce concurrency:

```bash
tsx src/index.ts --max-concurrent 1 --min-delay 10000
```

### Google API Errors

- Verify API key is valid
- Check API quota in Google Cloud Console
- Ensure Places API is enabled
