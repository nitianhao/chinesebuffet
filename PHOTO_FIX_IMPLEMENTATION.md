# Photo Display Fix Implementation

## Problem
Images were not displaying on the buffet detail pages. The page showed placeholder alt text ("China Buffet image 1", etc.) instead of actual photos.

## Root Cause
The code was not consistently using `photoReference` with the new `/api/photo` proxy, causing image URLs to be built incorrectly.

## Solution
Standardized all buffet photo rendering to use `photoReference` only, proxying through `/api/photo`.

### Changes Made

1. **`app/chinese-buffets/[city-state]/[slug]/page.tsx`**
   - Uses `image.photoReference` only
   - Builds URLs via `/api/photo?photoReference=...&w=800`

### Why This Works
- The `/api/photo` route uses server-side `GOOGLE_MAPS_API_KEY`
- `photoReference` values are the canonical identifiers from Places API (New)
- Proxying through `/api/photo` avoids CORS restrictions
- The route returns proper cache headers and content types

## Testing
Refresh the buffet detail page (e.g., `localhost:3000/chinese-buffets/louisville-ky/china-buffet`) and verify that:
1. Images load and display properly
2. No broken image placeholders appear
3. Browser console shows no 404 or CORS errors
4. Images maintain their aspect ratios correctly

## Related Files
- `/app/api/photo/route.ts` - Image proxy endpoint
