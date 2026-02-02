# TripAdvisor Review Scraper

A robust, production-ready Node.js + TypeScript scraping pipeline that maps Google Place IDs to TripAdvisor listings and collects reviews. Designed to run reliably on low-power VPS with polite rate limiting and graceful error handling.

## Features

- ✅ Maps Google Place IDs to TripAdvisor restaurant listings
- ✅ Scrapes reviews with pagination support
- ✅ SQLite database with checkpointing and resumable processing
- ✅ Polite rate limiting with exponential backoff
- ✅ Graceful failure handling (no captcha solving, no stealth)
- ✅ Systemd service support
- ✅ Raw HTML snapshots for debugging failed parses
- ✅ NDJSON export functionality

## Installation

```bash
cd scraper
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Edit `.env` and set your Google Maps API key:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Usage

### Basic Usage

Load place IDs from a file and start scraping:

```bash
tsx src/index.ts --input places.json
```

### Input File Formats

The scraper supports multiple input formats:

**JSON** (array of place IDs or objects):
```json
["ChIJ...", "ChIJ..."]
```
or
```json
{"place_ids": ["ChIJ...", "ChIJ..."]}
```

**CSV** (with `place_id` column):
```csv
place_id
ChIJ...
ChIJ...
```

**TXT** (one place ID per line):
```
ChIJ...
ChIJ...
```

### Command Line Options

```bash
tsx src/index.ts [options]

Options:
  -i, --input <file>        Input file with place IDs
  -e, --export              Export reviews to NDJSON after processing
  -c, --max-concurrent <n>  Maximum concurrent requests (default: 2)
      --max-pages <n>       Maximum review pages per place (default: 10)
      --min-delay <ms>      Minimum delay between requests (default: 2000)
      --max-delay <ms>      Maximum delay between requests (default: 5000)
  -h, --help                Show help message
```

### Environment Variables

- `GOOGLE_MAPS_API_KEY` or `GOOGLE_PLACES_API_KEY` - Required: Google Maps API key
- `USER_AGENT` - Optional: Custom user agent string
- `DB_PATH` - Optional: Database path (default: `./data/tripadvisor_reviews.db`)
- `MAX_CONCURRENT` - Optional: Max concurrent requests (default: 2)
- `MIN_DELAY_MS` - Optional: Minimum delay in ms (default: 2000)
- `MAX_DELAY_MS` - Optional: Maximum delay in ms (default: 5000)
- `LOG_LEVEL` - Optional: Logging level (default: info)

## Database Schema

### `places` Table

Tracks Google Places and their TripAdvisor mappings:

- `place_id` (TEXT, PRIMARY KEY) - Google Place ID
- `google_name` (TEXT) - Place name from Google
- `google_address` (TEXT) - Formatted address
- `google_lat` (REAL) - Latitude
- `google_lng` (REAL) - Longitude
- `ta_url` (TEXT) - TripAdvisor restaurant URL
- `ta_location_id` (TEXT) - TripAdvisor location ID
- `status` (TEXT) - Status: pending|mapped|scraping|done|retry|blocked|error
- `attempts` (INTEGER) - Number of processing attempts
- `last_error` (TEXT) - Last error message
- `last_success_at` (TEXT) - Last successful processing timestamp
- `next_run_at` (TEXT) - Next scheduled run time (for retries)
- `created_at` (TEXT) - Creation timestamp
- `updated_at` (TEXT) - Last update timestamp

### `ta_reviews` Table

Stores scraped TripAdvisor reviews:

- `id` (INTEGER, PRIMARY KEY) - Auto-increment ID
- `place_id` (TEXT) - Foreign key to places table
- `ta_review_id` (TEXT) - TripAdvisor review ID (if extractable)
- `ta_author` (TEXT) - Review author name
- `ta_author_location` (TEXT) - Author location
- `rating` (REAL) - Rating (1-5)
- `title` (TEXT) - Review title
- `text` (TEXT) - Review text
- `visited_date` (TEXT) - Date visited
- `published_date` (TEXT) - Publication date
- `language` (TEXT) - Detected language
- `created_at` (TEXT) - Creation timestamp

## Systemd Service

1. Copy the service file:
```bash
sudo cp tripadvisor-scraper.service /etc/systemd/system/
```

2. Edit the service file and update paths:
```bash
sudo nano /etc/systemd/system/tripadvisor-scraper.service
```

Update:
- `User=` - Your system user
- `WorkingDirectory=` - Path to scraper directory
- `EnvironmentFile=` - Path to `.env` file

3. Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable tripadvisor-scraper
sudo systemctl start tripadvisor-scraper
```

4. Check status:
```bash
sudo systemctl status tripadvisor-scraper
sudo journalctl -u tripadvisor-scraper -f
```

## Output Files

- **Database**: `./data/tripadvisor_reviews.db` - SQLite database
- **Raw HTML**: `./data/raw/{place_id}/*.html` - Debug snapshots for failed parses
- **Export**: `./data/exports/reviews.ndjson` - NDJSON export (when using `--export`)

## Error Handling

The scraper implements several error handling strategies:

1. **Exponential Backoff**: Failed places are retried with increasing delays (1 min to 24 hours)
2. **Status Tracking**: Places are marked as `pending`, `mapped`, `scraping`, `done`, `retry`, `blocked`, or `error`
3. **Blocking Detection**: If blocked by TripAdvisor, places are marked as `blocked` and not retried immediately
4. **Checkpointing**: Progress is saved after each place, making the scraper resumable
5. **Raw HTML Snapshots**: Failed parses save raw HTML for debugging

## Rate Limiting

The scraper is designed to be polite:

- Random delays between requests (2-5 seconds by default)
- Configurable concurrency limits (default: 2 concurrent requests)
- Exponential backoff on errors
- Respects HTTP status codes (403, 429 = blocking)

## Resuming

The scraper automatically resumes from where it left off:

- Places with status `pending` or `retry` are processed
- `next_run_at` field controls when retries happen
- Safe to stop and restart at any time

## Limitations

- **No Captcha Solving**: If blocked, the scraper records it and moves on
- **No Stealth**: Uses standard HTTP requests with realistic headers
- **No Proxy Rotation**: Single IP address (suitable for VPS)
- **Best Effort**: May not find all TripAdvisor listings (depends on search quality)

## Troubleshooting

### No reviews extracted

- Check raw HTML files in `./data/raw/{place_id}/` to see what TripAdvisor returned
- TripAdvisor may have changed their HTML structure
- Verify the TripAdvisor URL was correctly mapped

### Blocked by TripAdvisor

- Places are marked as `blocked` in the database
- Wait and retry later (exponential backoff handles this)
- Consider reducing concurrency and increasing delays

### Google API errors

- Verify your API key is valid and has Places API enabled
- Check API quota limits
- Ensure the API key has proper permissions

## License

MIT
