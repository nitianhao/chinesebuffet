# Scripts Directory

This directory contains utility scripts for data processing, migration, and maintenance.

## SEO Description Generator

Generates unique, keyword-rich SEO descriptions (150-200 words) for buffet detail pages.

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables** (in `.env.local`):
   ```bash
   INSTANT_ADMIN_TOKEN=your_token_here
   GEMINI_API_KEY=your_gemini_key_here  # Primary provider
   GROQ_API_KEY=your_groq_key_here      # Fallback provider
   GEMINI_MODEL=gemini-2.0-flash-exp    # Optional, defaults to gemini-2.0-flash-exp
   GROQ_MODEL=llama-3.1-8b-instant      # Optional, defaults to llama-3.1-8b-instant
   ```

### Usage

**Basic run:**
```bash
npx tsx scripts/generate-seo-descriptions.ts
```

**With options:**
```bash
# Process only 100 buffets
npx tsx scripts/generate-seo-descriptions.ts --limit 100

# Use 5 concurrent workers
npx tsx scripts/generate-seo-descriptions.ts --concurrency 5

# Force regenerate even if description exists
npx tsx scripts/generate-seo-descriptions.ts --force

# Dry run (don't write to database)
npx tsx scripts/generate-seo-descriptions.ts --dry-run

# Filter by field
npx tsx scripts/generate-seo-descriptions.ts --where "state=CA"
```

**Combined example:**
```bash
npx tsx scripts/generate-seo-descriptions.ts --limit 50 --concurrency 3 --force
```

### Running in tmux (for long-running processes)

```bash
# Start a new tmux session
tmux new -s seo-gen

# Run the script
npx tsx scripts/generate-seo-descriptions.ts --concurrency 3

# Detach: Ctrl+B, then D
# Reattach: tmux attach -t seo-gen
```

### Features

- **Multi-provider support**: Automatically falls back from Gemini to Groq on rate limits
- **Rate limiting**: Circuit breakers prevent getting stuck on rate-limited providers
- **Checkpointing**: Progress saved to `scripts/output/seo-gen-progress.jsonl` for resume capability
- **Uniqueness checking**: Tracks used sentences and prevents repetition
- **Review preprocessing**: Filters negative reviews and extracts positive highlights
- **JSON validation**: Ensures output meets requirements (word count, bold phrases, etc.)
- **Robust error handling**: Continues processing even if individual records fail

### Output Files

- `scripts/output/seo-gen-progress.jsonl` - Progress log (append-only)
- `scripts/output/seo-sentences.json` - Tracked sentences for uniqueness checking

### Database Fields

The script creates/updates these fields on the `buffets` table:
- `seoDescriptionMd` - Generated description in Markdown
- `seoDescriptionProvider` - AI provider used (gemini, groq)
- `seoDescriptionModel` - Model name
- `seoDescriptionGeneratedAt` - ISO timestamp
- `seoDescriptionInputHash` - Hash of input data for change detection
