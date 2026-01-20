# Amenities Section Debug Notes

## Problem Summary
Amenities were not rendering on the buffet page even though data existed in InstantDB.

## Root Causes
1. **Null group handling blocked records like `hasTv`.**
   - Records with `group = null` were being forced to `"unknown"`.
   - That prevented the "categorize by type" logic from running, so `hasTv` never landed in `buffet.amenities`.

2. **Amenities data was nested and not fully displayed.**
   - `type = amenities` stores data like:
     - `amenities: ["Restroom"]`
     - `goodForGroups: true`
     - `goodForKids: true`
     - `outdoorSeating: false`
   - The UI only rendered `amenities[]` and ignored the boolean fields.

3. **The page guarded the component too aggressively.**
   - The buffet page required `Object.keys(buffet.amenities).length > 0`.
   - If `amenities` was present but empty (or only contained null-group data), the component never mounted.

## Fixes Applied
1. **Preserve `null` group values** in `getBuffetNameBySlug` so null-group records are categorized by type.
2. **Render `type = amenities` booleans** as yes/no items in the Amenities section.
3. **Relax the guard** on the buffet page so the component can decide whether to display content.

## Additional Notes
- `hasTv` is a boolean `type = hasTv` record with `group = null`.
- It now appears once in the Amenities section, and duplicates are filtered out.
