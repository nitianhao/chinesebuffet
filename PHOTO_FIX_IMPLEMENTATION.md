# Photo Display Fix Implementation

## Problem
Images were not displaying on the buffet detail pages. The page showed placeholder alt text ("China Buffet image 1", etc.) instead of actual photos.

## Root Cause
The code was trying to use `image.photoReference` and construct URLs through `/api/place-photo`, but the database images field contains objects with `photoUrl` - complete Google Places API URLs with embedded API keys.

### Example Database Image Object Structure
```json
{
  "photoReference": "places/ChIJ.../photos/AZLasHq4...",
  "photoUrl": "https://places.googleapis.com/v1/places/.../media?key=AIzaSy...&maxHeightPx=400&maxWidthPx=400",
  "widthPx": 3600,
  "heightPx": 4800,
  "authorAttribution": null
}
```

## Solution
Changed the code to use `photoUrl` instead of `photoReference`, proxying it through the existing `/api/photo` endpoint to avoid CORS issues.

### Changes Made

1. **`app/chinese-buffets/[city-state]/[slug]/page.tsx`**
   - Changed from checking `image.photoReference` to `image.photoUrl`
   - Changed from constructing URL via `/api/place-photo` to using `/api/photo` proxy
   - Now uses: `/api/photo?url=${encodeURIComponent(image.photoUrl)}`

2. **`components/ImageGallery.tsx`**
   - Updated to proxy all external image URLs through `/api/photo`
   - Ensures consistency and avoids CORS issues
   - Already was extracting `photoUrl` correctly, just needed to add proxying

### Why This Works
- The `/api/photo` route already has `places.googleapis.com` in its `ALLOWED_HOSTS` list
- The `photoUrl` field contains complete URLs with API keys
- Proxying through `/api/photo` avoids CORS restrictions
- The route returns proper cache headers and content types

## Testing
Refresh the buffet detail page (e.g., `localhost:3000/chinese-buffets/louisville-ky/china-buffet`) and verify that:
1. Images load and display properly
2. No broken image placeholders appear
3. Browser console shows no 404 or CORS errors
4. Images maintain their aspect ratios correctly

## Related Files
- `/app/api/photo/route.ts` - Image proxy endpoint (already configured)
- `/app/api/place-photo/route.ts` - Alternative endpoint (not needed for this data structure)
