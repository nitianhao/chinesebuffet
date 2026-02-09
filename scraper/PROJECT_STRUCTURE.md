# Project Structure

```
scraper/
├── src/
│   ├── db/
│   │   └── schema.ts              # Database schema and DatabaseManager class
│   ├── exporters/
│   │   └── json-export.ts          # NDJSON export functionality
│   ├── loaders/
│   │   └── input-loader.ts         # Load place IDs from JSON/CSV/TXT files
│   ├── mappers/
│   │   ├── google-places.ts        # Google Places API integration
│   │   └── tripadvisor.ts          # TripAdvisor search and mapping
│   ├── processors/
│   │   └── place-processor.ts      # Main processing orchestration
│   ├── scrapers/
│   │   └── tripadvisor-reviews.ts  # Review scraping logic
│   ├── utils/
│   │   ├── delay.ts                # Delay and backoff utilities
│   │   ├── http.ts                 # HTTP client with retry logic
│   │   └── logger.ts               # Pino logger setup
│   └── index.ts                    # Main CLI entry point
├── data/                           # Data directory (created at runtime)
│   ├── tripadvisor_reviews.db      # SQLite database
│   ├── raw/                        # Raw HTML snapshots for debugging
│   └── exports/                    # JSON exports
├── .env.example                    # Environment variables template
├── .gitignore                      # Git ignore rules
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── tripadvisor-scraper.service     # Systemd service file
├── README.md                       # Full documentation
├── QUICKSTART.md                   # Quick start guide
└── example-places.json             # Example input file
```

## Key Components

### Database Layer (`src/db/schema.ts`)
- `DatabaseManager`: Manages SQLite database operations
- Automatic schema migration on startup
- Idempotent operations for safe resuming

### Mappers
- **Google Places** (`src/mappers/google-places.ts`): Fetches place details from Google Places API
- **TripAdvisor** (`src/mappers/tripadvisor.ts`): Searches TripAdvisor and maps Google places to TA listings

### Scrapers
- **TripAdvisor Reviews** (`src/scrapers/tripadvisor-reviews.ts`): Extracts reviews from TripAdvisor pages with pagination

### Processors
- **Place Processor** (`src/processors/place-processor.ts`): Orchestrates the full pipeline:
  1. Fetch Google Place details
  2. Map to TripAdvisor
  3. Scrape reviews
  4. Handle errors and retries

### Utilities
- **HTTP** (`src/utils/http.ts`): Polite HTTP client with retry, timeout, and blocking detection
- **Delay** (`src/utils/delay.ts`): Random delays and exponential backoff
- **Logger** (`src/utils/logger.ts`): Structured logging with Pino

## Data Flow

```
Input File (JSON/CSV/TXT)
    ↓
Load Place IDs
    ↓
Insert into DB (status: pending)
    ↓
For each place:
    ├─→ Fetch Google Details
    ├─→ Search TripAdvisor
    ├─→ Map to TA URL
    ├─→ Scrape Reviews (paginated)
    └─→ Save to DB
    ↓
Export (optional)
```

## Status Flow

```
pending → mapped → scraping → done
   ↓         ↓
  retry   blocked/error
```

## Error Handling

1. **Transient Errors**: Retry with exponential backoff (status: `retry`)
2. **Blocking**: Mark as `blocked`, don't retry immediately
3. **Permanent Errors**: Mark as `error` after max attempts
4. **Checkpointing**: Progress saved after each place

## Rate Limiting Strategy

- Random delays: 2-5 seconds (configurable)
- Concurrency limit: 2 (configurable)
- Exponential backoff: 1 min to 24 hours
- Respects HTTP 403/429 as blocking signals
