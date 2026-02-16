# POI "Structured Categories" Source Analysis

## 1. UI Component

**Component File**: `components/NearbyHighlights.tsx`

This component renders the accordion list of categories (e.g. "Food & Dining", "Healthcare & Medical").

- **Input Props**: `NearbyHighlightsProps` interface, which takes optional `POISection` objects for each category (e.g. `foodDining`, `healthcareMedicalServices`).
- **Data Rendering**: It iterates over `POI_LABELS` keys, checks for matching props, and uses `POISectionAccordion` to render each section.

**Parent Wrapper**: `components/bundles/POIBundle.tsx`

- Takes the full `buffet` object.
- Maps fields from the buffet object directly to `NearbyHighlights` props:
  ```typescript
  const poiData = {
    accommodationLodging: buffet.accommodationLodging,
    agriculturalFarming: buffet.agriculturalFarming,
    // ...
    foodDining: buffet.foodDining,
    healthcareMedicalServices: buffet.healthcareMedicalServices,
    // ...
  };
  return <NearbyHighlights {...poiData} />;
  ```

## 2. Data Source & Fetching

**Fetch Function**: `getBuffetNameBySlug` in `lib/data-instantdb.ts` (wrapped as `getCachedBuffet` in the page).

**Source**: InstantDB `buffets` collection.

**Mechanism**:
1. The page calls `getCachedBuffet(citySlug, buffetSlug)`.
2. This triggers an `adminQuery` to InstantDB to fetch the city and its buffet (filtered by slug).
3. The specific POI category data is stored as **JSON-stringified fields directly on the buffet entity**.

**Fields**:
The `buffets` schema (in `src/instant.schema.ts`) excludes these specific top-level fields:
- `accommodationLodging`
- `agriculturalFarming`
- `artsCulture`
- `communicationsTechnology`
- `educationLearning`
- `financialServices`
- `foodDining`
- `governmentPublicServices`
- `healthcareMedicalServices`
- ... (others matching the categories)

**Transformation**:
In `lib/data-instantdb.ts`, the raw string data from InstantDB is parsed:
```typescript
// Example for Healthcare
if (buffet.healthcareMedicalServices && ...) {
  const data = safeParseJsonObject(buffet.healthcareMedicalServices);
  if (data) buffetData.healthcareMedicalServices = data;
}
```

## 3. Data Shape

The data stored in the JSON fields matches the `POISection` interface.

**Example JSON Data Structure (Single Category Field)**:

```json
{
  "summary": "There are 5 options for Healthcare & Medical nearby.",
  "highlights": [
    {
      "label": "Hospitals",
      "items": [
        {
          "name": "City General Hospital",
          "category": "Hospital",
          "distanceText": "0.5 mi",
          "distanceFt": 2640,
          "addressText": "123 Main St",
          "hoursText": "Open 24 hours",
          "phone": "(555) 123-4567",
          "website": "https://hospital.example.com"
        }
      ]
    },
    {
      "label": "Pharmacies",
      "items": [
        {
          "name": "CVS Pharmacy",
          "category": "Pharmacy",
          "distanceText": "0.2 mi"
        }
      ]
    }
  ],
  "poiCount": 12,
  "generatedAt": "2023-10-27T10:00:00Z",
  "model": "gpt-4-turbo"
}
```

## 4. Join Key

There is no "join" key required to fetch this data at runtime because it is **embedded** directly in the `buffet` document.

- **Primary Lookup**: `buffets` table via `slug` (and `citySlug`).
- The POI data is a property of the buffet record itself.

*Note: There is a separate `poiRecords` table linked via `buffetPOIRecords` in the schema, but the runtime rendering for `NearbyHighlights` currently relies on the pre-generated JSON string fields on the buffet entity, not the live `poiRecords` relation.*
