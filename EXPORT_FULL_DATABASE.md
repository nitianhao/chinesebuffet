# Export Full Database for Yelp Matching

You have **over 5,000 restaurants** in your InstantDB database, but the current matching script is only using the 367 processed restaurants from `buffets-by-id.json`.

## Step 1: Export All Buffets from InstantDB

You need to export ALL buffets from InstantDB to a JSON file. You have a few options:

### Option A: Use the Existing Export Script

If you have `INSTANT_ADMIN_TOKEN` set in your `.env.local` file:

```bash
node scripts/export-all-buffets-for-matching.js
```

This will create `data/all-buffets-for-matching.json` with all buffets.

### Option B: Use the Full Export Script

The existing `export-from-instantdb.js` script exports all data. You can modify it or use it as-is, then the matching script will work with whatever JSON file you provide.

### Option C: Manual Export via InstantDB Dashboard

1. Go to your InstantDB dashboard
2. Export all buffets
3. Save as `data/all-buffets-for-matching.json` in the format:
```json
{
  "buffet-id-1": {
    "id": "buffet-id-1",
    "name": "Restaurant Name",
    "address": {
      "city": "City",
      "state": "State",
      "full": "Full address"
    },
    "phone": "phone number"
  },
  ...
}
```

## Step 2: Run Matching with Full Database

Once you have the export file, run:

```bash
python3 scripts/match-restaurants-yelp-api.py --api-key YOUR_KEY --input data/all-buffets-for-matching.json
```

Or if you saved it as `all-buffets-for-matching.json`, the script will automatically find it:

```bash
python3 scripts/match-restaurants-yelp-api.py --api-key YOUR_KEY
```

## Important Notes

- **Yelp API Limit**: 5,000 calls per day (FREE tier)
- **For 5,000+ restaurants**: You'll need multiple days OR upgrade to paid plan
- **The script saves progress**: You can stop and resume - it will skip already-matched restaurants
- **Rate limiting**: The script includes delays to stay within API limits

## Estimated Time

- **5,000 restaurants** × 0.5 seconds delay = ~42 minutes per run
- If you hit the daily limit, resume the next day - it will skip already-processed restaurants
















