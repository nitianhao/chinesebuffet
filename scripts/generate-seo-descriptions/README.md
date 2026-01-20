# SEO Description Generation - Test Samples

This script generates sample SEO-optimized descriptions for the first 3 buffets in the database to preview the output before running the full generation.

## Setup

1. Install required dependencies:
```bash
npm install openai
```

2. Ensure you have the following environment variables in `.env.local`:
- `INSTANT_ADMIN_TOKEN` - Your InstantDB admin token
- `OPENAI_API_KEY` - Your OpenAI API key
- `NEXT_PUBLIC_INSTANT_APP_ID` or `INSTANT_APP_ID` - Your InstantDB app ID

## Run Test

```bash
npx tsx scripts/generate-seo-descriptions/test-sample.ts
```

This will:
- Fetch the first 3 buffets from your InstantDB database
- Extract all relevant data (reviews, amenities, accessibility, etc.)
- Generate SEO-optimized descriptions using GPT-4 Turbo
- Display the raw data and generated descriptions for review

**Note**: This is a readonly test - it does NOT modify the database.
