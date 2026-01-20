# Yelp API Additional Data Available

## Current Data We're Getting

From the **Search endpoint**, we currently get:
- Basic info: name, address, phone, rating, review_count, price
- Categories
- URL

## Additional Data from Business Details Endpoint

The Yelp **Business Details endpoint** (`/v3/businesses/{id}`) provides much more:

### 1. **Operating Hours** (`hours`)
- Detailed operating hours for each day
- Whether currently open
- Format: Array of hour objects with day, open, close times

### 2. **Photos** (`photos`)
- Array of photo URLs (unlimited, not just 3)
- High-resolution images
- Can get all available photos for a business

### 3. **Coordinates** (`coordinates`)
- Precise lat/lng (if different from what you have)
- Can help verify/improve location accuracy

### 4. **Transactions** (`transactions`)
- Array indicating what services are available:
  - `"delivery"` - Delivery available
  - `"pickup"` - Pickup available  
  - `"restaurant_reservation"` - Reservations available

### 5. **Business Attributes** (`attributes`)
- Various attributes like:
  - `BusinessAcceptsCreditCards`
  - `RestaurantsPriceRange2`
  - `WheelchairAccessible`
  - `OutdoorSeating`
  - `GoodForGroups`
  - `GoodForKids`
  - And many more...

### 6. **Is Closed Status** (`is_closed`)
- Boolean indicating if business is permanently closed
- Helps identify closed restaurants

### 7. **Review Excerpts** (`reviews`)
- Up to 3 review excerpts (first 160 characters)
- Review ratings
- User info (name, image)
- Time created

### 8. **Specialties** (`specialties`)
- Special business specialties (if any)

## How to Get This Data

I've created a script to fetch detailed business information:

```bash
python3 scripts/get-yelp-business-details.py --api-key YOUR_KEY
```

This will:
- Use the Business Details API endpoint
- Fetch additional data for all matched restaurants
- Add `details` object to each Yelp match in the mapping file
- Use minimal API calls (1 per restaurant, but only for already-matched ones)

## API Usage

- **Search endpoint**: Used for matching (already done)
- **Business Details endpoint**: 1 call per restaurant = ~515 calls for current matches
- **Daily limit**: 5,000 calls/day (well within limits)

## Value Comparison

### What You Have (from Google Places):
- Hours ✅
- Photos ✅  
- Coordinates ✅
- Service options ✅
- Reviews ✅
- Many other fields ✅

### What Yelp Adds:
- **Alternative data source** (validation/comparison)
- **Yelp-specific photos** (may differ from Google)
- **Yelp review excerpts** (different user base)
- **Yelp transactions** (delivery/pickup/reservations - Yelp-specific)
- **Yelp attributes** (different categorization)

## Recommendation

Since you already have comprehensive data from Google Places, the Yelp Business Details API provides:
1. **Redundancy/validation** - Compare hours, ratings, etc.
2. **Yelp-specific content** - Yelp photos, Yelp reviews
3. **Transaction info** - Yelp's delivery/pickup indicators
4. **Alternative perspective** - Different user base may provide different ratings/reviews

**If you already have all the data you need from Google Places**, you may not need to fetch Yelp details. However, having both sources can provide:
- Data validation
- More photos (different sources)
- Different review perspectives
- Backup data if one source is missing

Would you like me to run the script to fetch the detailed Yelp data, or skip it since you already have most of it?
















