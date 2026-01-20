# Menu Items Import Guide

This guide explains how to import menu data from `menu_urls.json` into your InstantDB database.

## Schema Design

The import creates a normalized database structure:

1. **`menus` table** (already exists)
   - Stores menu metadata (source URL, scraped date, status)
   - Linked to buffets via `placeId`

2. **`menuItems` table** (new)
   - Stores individual menu items
   - Fields: `categoryName`, `name`, `description`, `price`, `priceNumber`, `itemOrder`
   - Linked to `menus` via a relationship

### Why This Design?

**Benefits:**
- ✅ **Queryable**: Can search/filter menu items across all buffets
- ✅ **Scalable**: Handles large menus efficiently
- ✅ **Normalized**: No data duplication
- ✅ **Indexed**: Fast queries on category, name, price
- ✅ **Flexible**: Easy to add features like item search, price filtering, etc.

**Alternative Approaches Considered:**

1. **Store items as JSON in menus table** (current approach)
   - ❌ Not queryable
   - ❌ Can't filter by price or category easily
   - ✅ Simpler schema

2. **Embed items directly in buffets table**
   - ❌ Data duplication
   - ❌ Harder to update
   - ❌ Not normalized

3. **Separate menuItems table** (chosen approach)
   - ✅ All benefits listed above
   - ✅ Best for long-term scalability

## Prerequisites

1. **Environment Variables**
   - `INSTANT_ADMIN_TOKEN`: Your InstantDB admin token
   - `NEXT_PUBLIC_INSTANT_APP_ID` or `INSTANT_APP_ID`: Your InstantDB app ID

2. **Schema Updated**
   - The schema has been updated with the `menuItems` entity
   - Deploy the schema to InstantDB before running the import

3. **Dependencies**
   - TypeScript (`tsx` or `ts-node`)
   - `@instantdb/admin` package

## Running the Import

### Step 1: Deploy Schema

Make sure your InstantDB schema is up to date. The schema includes:
- `menuItems` entity
- `menuMenuItems` link relationship

### Step 2: Set Environment Variables

```bash
export INSTANT_ADMIN_TOKEN="your-admin-token"
export NEXT_PUBLIC_INSTANT_APP_ID="your-app-id"
```

Or create/update `.env.local`:
```
INSTANT_ADMIN_TOKEN=your-admin-token
NEXT_PUBLIC_INSTANT_APP_ID=your-app-id
```

### Step 3: Run the Import Script

```bash
npx tsx scripts/import-menu-items.ts
```

Or if you have ts-node:
```bash
npx ts-node scripts/import-menu-items.ts
```

## What the Script Does

1. **Reads** `Example JSON/menu_urls.json`
2. **For each record**:
   - Finds or creates a `menus` record (linked to buffet via `placeId`)
   - Extracts menu items from `scrapedMenu.structuredData.categories`
   - Deletes existing menu items for that menu (to avoid duplicates on re-run)
   - Creates `menuItems` records linked to the menu
3. **Processes in batches** of 100 items for performance
4. **Provides progress updates** and a summary at the end

## Expected Output

```
Starting menu items import...

Reading menu data from Example JSON/menu_urls.json...
Found 987 menu records

Connected to InstantDB

[1/987] Processing King Buffet (15 items)...
  ✓ Created 15 menu items

[2/987] Processing Another Buffet (23 items)...
  ✓ Created 23 menu items

...

============================================================
IMPORT SUMMARY
============================================================
Total records: 987
Processed: 950
Skipped: 30
Errors: 7
Total menu items created: 15234
============================================================

Import completed successfully!
```

## Querying Menu Items

After import, you can query menu items like this:

```typescript
// Get all menu items for a specific buffet
const result = await db.query({
  buffets: {
    $: { where: { placeId: 'ChIJE3H7PZOhwokR8O-GxVNKaYg' } },
    menus: {
      menuItems: {}
    }
  }
});

// Get menu items by category
const items = await db.query({
  menuItems: {
    $: { where: { categoryName: 'Appetizers' } },
    menu: {
      buffets: {}
    }
  }
});

// Search menu items by name
const searchResults = await db.query({
  menuItems: {
    $: { 
      where: { 
        name: { $like: '%chicken%' } 
      } 
    }
  }
});
```

## Troubleshooting

### Error: "INSTANT_ADMIN_TOKEN is required"
- Make sure you've set the environment variable
- Check that `.env.local` is being loaded (if using Next.js)

### Error: "Schema validation errors"
- Ensure you've deployed the updated schema to InstantDB
- The schema must include the `menuItems` entity and `menuMenuItems` link

### Error: "Failed to create menu record"
- Check that the `menus` table exists
- Verify the `placeId` is valid

### Import is slow
- The script processes items in batches of 100
- For 987 records with ~15 items each, expect 10-20 minutes
- Progress updates appear every 50 records

### Duplicate menu items
- The script deletes existing items before importing
- If you see duplicates, check that the deletion query is working correctly

## Re-running the Import

The script is **idempotent** - you can run it multiple times safely:
- It deletes existing menu items for each menu before importing
- It finds existing menus instead of creating duplicates
- Safe to re-run if the JSON file is updated

## Next Steps

After importing:

1. **Verify the data**:
   ```typescript
   const count = await db.query({
     menuItems: { $: { limit: 1 } }
   });
   console.log('Menu items count:', count.menuItems?.length);
   ```

2. **Update your UI** to display menu items from the new table

3. **Add features**:
   - Menu item search
   - Price filtering
   - Category browsing
   - Menu item recommendations

## Performance Considerations

- **Indexing**: The schema includes indexes on `categoryName` and `name` for fast queries
- **Batch Processing**: Items are created in batches of 100 to avoid transaction limits
- **Query Optimization**: Use the link relationships to efficiently fetch menu items with their menus/buffets

## Rollback

If you need to rollback:
1. The original menu data is still in the `menus.structuredData` JSON field
2. You can delete all menu items: `DELETE FROM menuItems` (via InstantDB admin)
3. The code will fall back to reading from the JSON field if menu items aren't found
