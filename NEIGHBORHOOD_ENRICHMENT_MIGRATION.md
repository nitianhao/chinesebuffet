# Neighborhood Enrichment Migration Guide

## Overview

This migration enriches the `neighborhood` field to support multiple location groupings (neighborhoods, districts, counties, metro areas) while maintaining backward compatibility.

## Schema Changes

### Before
- `neighborhood` (string | null) - Single neighborhood value

### After
- `neighborhood` (string | null) - **Primary neighborhood** (backward compatible - existing code continues to work)
- `neighborhoodContext` (string | null) - **JSON stringified** enriched location context

### Why This Design?

1. **Backward Compatible**: Existing code reading `buffet.neighborhood` continues to work unchanged
2. **SEO-Friendly**: Rich context enables filtering/grouping by area, county, metro for better SEO
3. **Flexible**: JSON structure allows adding more fields later without schema changes
4. **Migration-Safe**: If enrichment fails, original `neighborhood` value is preserved

## Migration Steps

### 1. Schema Update & Sync
The schema has been updated to include `neighborhoodContext` field. **You must sync the schema before running the enrichment script:**

```bash
# Option 1: Use the sync script
npm run sync-schema

# Option 2: Use InstantDB CLI directly
npx instant-cli push --app 709e0e09-3347-419b-8daa-bad6889e480d

# Option 3: Start Next.js dev server (auto-syncs on startup)
npm run dev
# (Let it start, then stop it - this syncs the schema)
```

**Important**: If you see the error "Attributes are missing in your schema", the schema hasn't been synced yet. Run one of the commands above first.

### 2. Run Enrichment Script
```bash
# Test with 10 records
npx tsx scripts/enrich-neighborhoods-advanced.ts --limit 10 --concurrency 3

# Process all records
npx tsx scripts/enrich-neighborhoods-advanced.ts --concurrency 3

# Resume from checkpoint
npx tsx scripts/enrich-neighborhoods-advanced.ts --resume --concurrency 3

# Dry run (no database writes)
npx tsx scripts/enrich-neighborhoods-advanced.ts --limit 5 --dry-run
```

### 3. Update Application Code (Optional)
Once enrichment is complete, you can update application code to read from `neighborhoodContext` when available:

```typescript
// Read enriched context
const context = buffet.neighborhoodContext 
  ? JSON.parse(buffet.neighborhoodContext)
  : null;

// Use primary neighborhood (backward compatible)
const primary = buffet.neighborhood;

// Access enriched data
if (context) {
  const neighborhoods = context.neighborhoods; // Array of {name, type, confidence}
  const districts = context.districts_or_areas; // Array of {name, confidence}
  const county = context.county;
  const metroArea = context.metro_area;
}
```

## Data Structure

The `neighborhoodContext` field stores a JSON object with this structure:

```json
{
  "neighborhoods": [
    {"name": "Downtown", "type": "informal", "confidence": "high"},
    {"name": "Chinatown", "type": "informal", "confidence": "medium"}
  ],
  "districts_or_areas": [
    {"name": "Financial District", "confidence": "medium"}
  ],
  "county": "Maricopa County",
  "metro_area": "Greater Phoenix Area",
  "generatedAt": "2025-01-15T10:30:00.000Z",
  "model": "groq:llama-3.1-8b-instant",
  "source": "llm"
}
```

## Features

- ✅ **Checkpointing**: Script can resume from last processed record
- ✅ **Concurrency**: Configurable parallel processing (default: 3)
- ✅ **Deduplication**: Automatically deduplicates against existing neighborhood
- ✅ **Error Handling**: Retries on failures, validates JSON output
- ✅ **Cost-Conscious**: Uses cheapest Groq model, short prompts, low temperature
- ✅ **Non-Hallucination**: Omits uncertain values, validates against known locations

## Checkpoint File

The script creates `scripts/neighborhood-enrichment-checkpoint.json` to track progress:
- `lastProcessedId`: Last buffet ID processed
- `processedIds`: Array of all processed IDs
- `processedCount`: Total successfully processed
- `errorCount`: Total errors
- `skippedCount`: Total skipped (missing data)
- `startTime`: Timestamp when script started

## Troubleshooting

### Script fails with "GROQ_API_KEY is not set"
Add to `.env.local`:
```
GROQ_API_KEY=your-key-here
```

### Script fails with "INSTANT_ADMIN_TOKEN is not set"
Add to `.env.local`:
```
INSTANT_ADMIN_TOKEN=your-token-here
```

### Resume not working
Delete `scripts/neighborhood-enrichment-checkpoint.json` and restart.

### Too many rate limit errors
Reduce concurrency:
```bash
npx tsx scripts/enrich-neighborhoods-advanced.ts --concurrency 1
```
