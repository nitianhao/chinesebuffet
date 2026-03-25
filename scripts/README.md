# Scripts

## Foursquare buffet importer

Environment variables:
- `FOURSQUARE_SERVICE_KEY` (recommended, new Places API)
- `FOURSQUARE_API_KEY` (legacy fallback)
- `INSTANT_ADMIN_TOKEN`

Safe default (dry-run):
- `npm run import-foursquare-buffets -- --city-limit 5`

Write to DB:
- `npm run import-foursquare-buffets:commit -- --city-limit 5`

Useful flags:
- `--state TX`
- `--city "Houston"`
- `--reset-checkpoint`
- `--max-per-query 50`
- `--max-offsets 3`

Outputs:
- `data/foursquare-import-checkpoint.json`
- `data/foursquare-import-report.json`
- `data/foursquare-candidates.json`
- `data/foursquare-rejected.json`

## SEO description generator

Environment variables:
- `INSTANT_ADMIN_TOKEN`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`
- `GEMINI_MODEL_PRIMARY` (default `gemini-2.5-flash`)
- `GEMINI_MODEL_SECONDARY` (default `gemini-flash-latest`)
- `GROQ_MODEL` (default `llama-3.1-8b-instant`)
- `REQUEST_TIMEOUT_MS` (default `25000`)

Logs/output:
- `scripts/output/seo-gen-progress.jsonl`
- `scripts/output/seo-sentences.json`

Examples (tmux):
- `tmux new -s seo-preflight 'npx tsx scripts/generate-seo-descriptions.ts --preflight'`
- `tmux new -s seo-run 'npx tsx scripts/generate-seo-descriptions.ts --concurrency 3 --limit 200'`
