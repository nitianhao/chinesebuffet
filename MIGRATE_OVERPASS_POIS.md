# Overpass POIs Migration Guide

This guide explains how to migrate `overpassPOIs` from a JSON field in the `buffets` table to a separate `overpassPOIs` table for better database performance.

## Overview

We've migrated from storing POIs as a JSON string in the `buffets.overpassPOIs` field to a separate `overpassPOIs` table linked via InstantDB relationships. This provides better performance and scalability, especially when dealing with arrays that can be up to 200 items.

## Changes Made

1. **Schema Updates** (`src/instant.schema.ts`):
   - ✅ Removed `overpassPOIs` string field from `buffets` entity
   - ✅ Added new `overpassPOIs` entity with all POI fields
   - ✅ Added `buffetOverpassPOIs` link connecting buffets to POIs

2. **Migration Scripts**:
   - ✅ Created `scripts/check-overpass-pois-schema.js` to verify schema is synced
   - ✅ Created `scripts/migrate-overpass-pois-to-table.js` to migrate existing data

## Running the Migration

### Prerequisites

1. **Sync the schema** in InstantDB dashboard first
   - The schema changes have been made in `src/instant.schema.ts`
   - You need to manually sync the schema in your InstantDB dashboard
   - Once synced, the `overpassPOIs` entity and `buffetOverpassPOIs` link will be available

2. Ensure you have `INSTANT_ADMIN_TOKEN` in your environment variables

### Steps

1. **Check if schema is synced**:
   ```bash
   npm run check-overpass-pois-schema
   ```
   
   Or directly:
   ```bash
   node scripts/check-overpass-pois-schema.js
   ```
   
   This will verify that:
   - The `overpassPOIs` entity exists
   - The `buffetOverpassPOIs` link relationship is working

2. **If schema is not synced**:
   - Go to your InstantDB dashboard
   - Sync the schema from `src/instant.schema.ts`
   - Wait for the sync to complete
   - Run the check script again

3. **Run the migration script**:
   ```bash
   npm run migrate-overpass-pois
   ```
   
   Or directly:
   ```bash
   node scripts/migrate-overpass-pois-to-table.js
   ```

4. **Monitor the output**:
   - The script will show progress as it processes buffets
   - It will report how many POIs were created and skipped (duplicates)
   - Any errors will be displayed

5. **Verify the migration**:
   - Check your InstantDB dashboard to confirm POIs are in the `overpassPOIs` table
   - Verify that POIs are linked to their parent buffets
   - Check that the count matches expectations

### What the Migration Does

1. Fetches all buffets that have `overpassPOIs` in the JSON field
2. For each buffet:
   - Parses the JSON POIs array/object
   - Checks for existing POIs in the `overpassPOIs` table (by osmId + coordinates)
   - Creates new POI records linked to the buffet
   - Sorts POIs by distance to maintain order
   - Skips duplicates to avoid creating duplicate POIs
3. Processes POIs in batches of 50 for performance
4. Provides a summary report at the end

### Schema Structure

The new `overpassPOIs` entity has the following fields:

- `osmId`: OSM element ID (indexed)
- `type`: Element type: 'node', 'way', or 'relation' (indexed)
- `name`: POI name (optional, indexed)
- `category`: Category/amenity type (optional, indexed)
- `distance`: Distance in meters from the buffet (indexed)
- `lat`: Latitude (indexed)
- `lon`: Longitude (indexed)
- `tags`: JSON stringified object with all OSM tags
- `order`: Order/rank of this POI (for sorting by distance)

### Querying POIs

After migration, you can query POIs like this:

```typescript
// Get all POIs for a buffet
const result = await db.query({
  buffets: {
    $: { where: { id: buffetId } },
    overpassPOIs: {
      $: { order: [{ field: 'distance', direction: 'asc' }] }
    }
  }
});

const pois = result.buffets[0].overpassPOIs;
```

## Post-Migration

After migration is complete:

1. **Verify everything works**:
   - Check that POI data is correctly linked to buffets
   - Verify POI counts match expectations
   - Test any code that uses POI data

2. **Update data access code** (if needed):
   - If you have code that reads `buffet.overpassPOIs` JSON field, update it to use the link relationship
   - Example: `buffet.overpassPOIs` → `buffet.overpassPOIs` (via link)

3. **Optional: Remove JSON field** (not recommended initially):
   - The old `overpassPOIs` JSON field has been removed from the schema
   - If you want to keep it for backward compatibility temporarily, you can add it back
   - **Wait at least a few weeks after migration to ensure everything is stable**

## Performance Benefits

After migration:
- ✅ Main table no longer stores large JSON arrays (much faster queries)
- ✅ POI queries are optimized with proper indexing
- ✅ Can filter/sort POIs by distance, category, type, etc.
- ✅ Better scalability for future growth
- ✅ Each POI is a separate record, easier to manage and query

## Troubleshooting

**Error: "INSTANT_ADMIN_TOKEN is required"**
- Make sure you have the token in your `.env.local` file or environment

**Error: "Schema not synced"**
- Ensure you've synced the schema in InstantDB dashboard
- The `overpassPOIs` entity and `buffetOverpassPOIs` link must exist

**POIs not appearing after migration**
- Check that POIs were created in the `overpassPOIs` table
- Verify the link relationship is correct
- Check that the JSON field contained valid POI data

**Duplicate POIs**
- The script checks for duplicates by osmId + coordinates
- If you see duplicates, check that the duplicate detection logic is working

**Migration is slow**
- The script processes POIs in batches of 50
- For buffets with 200 POIs each, expect some processing time
- Progress updates appear every batch

## Rollback

If you need to rollback:

1. The old JSON field data is no longer in the schema
2. If you need to restore it, you would need to:
   - Add the `overpassPOIs` field back to the schema
   - Re-export data from the `overpassPOIs` table back to JSON format
   - This is complex and not recommended

## Next Steps

After successful migration:

1. Update any code that reads POI data to use the new table structure
2. Consider adding features like:
   - POI filtering by category
   - POI search functionality
   - Distance-based POI recommendations
3. Monitor performance improvements
