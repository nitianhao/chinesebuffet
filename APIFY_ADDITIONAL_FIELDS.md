# Additional Fields Extracted from Apify Scraper

## Summary

The Apify `agents/yelp-business` scraper provides several fields that are **not currently in your JSON file**. The script has been updated to extract these additional fields.

## New Fields Being Extracted

### 1. **businessId** (Top-level Yelp field)
- **Location**: `yelp.businessId`
- **Type**: String
- **Description**: Yelp's internal business ID (different from the `alias` or `id` field)
- **Example**: `"y3uxJuigY6atehWRpe9uMg"`

### 2. **isClaimed** (Top-level Yelp field)
- **Location**: `yelp.isClaimed`
- **Type**: Boolean
- **Description**: Whether the business owner has claimed their Yelp listing
- **Example**: `true` or `false`

### 3. **isBusinessClosed** (Details field)
- **Location**: `yelp.details.is_business_closed`
- **Type**: Boolean
- **Description**: Whether the business is permanently closed
- **Note**: Your JSON already has `details.is_closed`, but this provides an alternative source
- **Example**: `false`

### 4. **primaryPhoto** (Details field)
- **Location**: `yelp.details.primaryPhoto`
- **Type**: String (URL)
- **Description**: Main/featured photo URL for the business
- **Note**: Your JSON has `details.photos` array, but this is the primary/featured photo
- **Example**: `"https://s3-media0.fl.yelpcdn.com/bphoto/OPOFMJuvJ0Fyfk_TEPjWNA/"`

### 5. **operationHours** (Details field)
- **Location**: `yelp.details.operationHours`
- **Type**: Object (day-based keys)
- **Description**: Operating hours in a day-based object format
- **Note**: Your JSON already has `details.hours` as an array, but this provides an alternative format
- **Example**:
  ```json
  {
    "Mon": "",
    "Tue": "11:00 AM - 9:00 PM",
    "Wed": "11:00 AM - 9:00 PM",
    ...
  }
  ```

### 6. **about** (Details field)
- **Location**: `yelp.details.about`
- **Type**: Object or String
- **Description**: Business description/about text
- **Note**: May be empty in some cases, but extracted when available
- **Example**: Business description text

### 7. **reservationUrl** (Details field)
- **Location**: `yelp.details.reservationUrl`
- **Type**: String (URL)
- **Description**: Yelp reservation URL for making reservations
- **Example**: `"https://www.yelp.com/reservations/golden-dynasty-fresno"`

### 8. **mediaCount** (Details field)
- **Location**: `yelp.details.mediaCount`
- **Type**: Number
- **Description**: Total number of photos/media available
- **Note**: Your JSON has `details.photos_count`, but this provides an alternative source
- **Example**: `240`

## Fields Already in JSON (Not Duplicated)

These fields from Apify are already present in your JSON structure:
- ✅ `url`, `rating`, `reviewCount`, `price`, `categories`, `phone`, `address`, `city`, `state`, `zipCode`
- ✅ `details.hours`, `details.photos`, `details.coordinates`, `details.attributes`
- ✅ `details.is_closed`, `details.location`, `details.transactions`

## Implementation

The script (`scripts/scrape-yelp-attributes-apify.js`) has been updated to:
1. Extract all 8 additional fields listed above
2. Only add fields if they don't already exist (to preserve existing data)
3. Store them in the appropriate location in your JSON structure

## Usage

When you run the script, it will automatically extract these additional fields along with the attributes:

```bash
node scripts/scrape-yelp-attributes-apify.js
```

The fields will be merged into your existing JSON structure without overwriting existing data.






