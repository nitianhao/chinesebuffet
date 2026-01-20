# Reviews Migration Guide

This guide explains how to migrate reviews from the JSON field to the new separate reviews table.

## Overview

We've migrated from storing reviews as a JSON string in the `buffets.reviews` field to a separate `reviews` table linked via InstantDB relationships. This provides better performance and scalability.

## Changes Made

1. **Schema Updates** (`src/instant.schema.ts`):
   - Added new `reviews` entity with all review fields
   - Added `buffetReviews` link connecting buffets to reviews
   - Kept old `reviews` JSON field for backward compatibility

2. **Data Layer Updates** (`lib/data-instantdb.ts`):
   - Added `transformReview()` function
   - Updated `transformBuffet()` to accept reviews from link relationship
   - Added `getReviewsForBuffet()` function
   - Updated `getBuffetBySlug()` to optionally fetch reviews via link

3. **Page Updates**:
   - Buffet detail pages now fetch reviews from the new table

## Running the Migration

### Prerequisites

1. Make sure your InstantDB schema is deployed with the new `reviews` entity and `buffetReviews` link
2. Ensure you have `INSTANT_ADMIN_TOKEN` in your environment variables

### Steps

1. **Deploy the schema** (if not already done):
   ```bash
   # Your schema should already be deployed if you've deployed the code changes
   # Verify in InstantDB dashboard that the reviews entity exists
   ```

2. **Run the migration script**:
   ```bash
   npm run migrate-reviews
   ```
   
   Or directly:
   ```bash
   node scripts/migrate-reviews-to-table.js
   ```

3. **Monitor the output**:
   - The script will show progress as it processes buffets
   - It will report how many reviews were created and skipped (duplicates)
   - Any errors will be displayed

4. **Verify the migration**:
   - Check your InstantDB dashboard to confirm reviews are in the `reviews` table
   - Visit a buffet detail page and verify reviews load correctly
   - Check that the count matches expectations

### What the Migration Does

1. Fetches all buffets that have reviews in the JSON field
2. For each buffet:
   - Parses the JSON reviews array
   - Checks for existing reviews in the reviews table (by reviewId or content hash)
   - Creates new review records linked to the buffet
   - Skips duplicates to avoid creating duplicate reviews
3. Processes reviews in batches of 50 for performance
4. Provides a summary report at the end

### Post-Migration

After migration is complete:

1. **Verify everything works**:
   - Test buffet detail pages load reviews correctly
   - Check that review counts match
   - Verify review content is correct

2. **Optional: Remove JSON field** (not recommended initially):
   - The old `reviews` JSON field can remain for backward compatibility
   - If you want to remove it later, you can update the schema to remove the field
   - **Wait at least a few weeks after migration to ensure everything is stable**

## Rollback

If you need to rollback:

1. The old JSON field still contains the original data
2. Update `transformBuffet()` to not use `reviewsFromLink` parameter
3. The code will automatically fall back to the JSON field
4. Note: Once you remove the JSON field from the schema, you cannot rollback

## Performance Benefits

After migration:
- ✅ Listing pages no longer load review data (much faster)
- ✅ Review queries are optimized with proper indexing
- ✅ Can handle 100+ reviews per buffet efficiently
- ✅ Better scalability for future growth

## Troubleshooting

**Error: "INSTANT_ADMIN_TOKEN is required"**
- Make sure you have the token in your `.env.local` file or environment

**Error: Schema validation errors**
- Ensure you've deployed the new schema with the reviews entity

**Reviews not appearing after migration**
- Check that reviews were created in the reviews table
- Verify the link relationship is correct
- Check browser console for errors

**Duplicate reviews**
- The script checks for duplicates by reviewId or content hash
- If you see duplicates, they may have different reviewIds
- You can manually deduplicate if needed

## Support

If you encounter issues:
1. Check the migration script output for specific errors
2. Verify your InstantDB dashboard shows the reviews table
3. Check that buffet IDs match between buffets and reviews tables







