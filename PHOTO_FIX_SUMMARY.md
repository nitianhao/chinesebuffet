# Google Places Photo Display Fix (Current)

## Problem Diagnosis

**Root Cause:** Photos were not rendering on localhost because:

1. **Proxy mismatch**: The frontend and data did not consistently use `photoReference`
2. **API key handling**: Calls to Google needed to be server-side only

## Solution Implemented

### 1. Created `/api/photo` Proxy Route
- **Location**: `app/api/photo/route.ts`
- **Purpose**: Securely proxy Google Places (New) photos without exposing API keys
- **Features**:
  - Accepts `photoReference` parameter (e.g., `places/.../photos/...`)
  - Accepts optional `w` parameter (default 800)
  - Builds Google Places API URL server-side using `GOOGLE_MAPS_API_KEY` from environment
  - Streams image bytes directly to client
  - Returns strong cache headers
  - Handles errors gracefully (400, 500, 502 responses)

### 2. Enhanced Frontend Rendering
- **File**: `app/chinese-buffets/[city-state]/[slug]/page.tsx`
- **Improvements**:
  - Uses proper aspect ratio from `widthPx`/`heightPx` to prevent layout shift
  - Adds error handling to hide broken images gracefully
  - Maintains responsive grid layout (2-4 columns)
  - Sorts images by area (largest first) for better UX

## Security Benefits

✅ **API Key Protection**: Google API key is never sent to the browser
✅ **Server-Side Only**: All Google API calls happen server-side
✅ **No Key in HTML**: API key is not present in page source or DevTools
✅ **No Key in Network Requests**: Browser only sees `/api/photo` URLs

## Verification Checklist

- [x] `/api/photo` route created and functional
- [x] Frontend updated to use proxy route
- [x] Error handling added for broken images
- [x] Aspect ratio preservation for layout stability
- [x] Next.js config updated (defensive measure)
- [x] API key never exposed to browser

## Testing

To verify the fix works:

1. **Check API Route**: Visit `http://localhost:3000/api/photo?photoReference=places/ChIJzSx4EjkG2YgRuVMnhaPRb7M/photos/AcnlKN...&w=800`
   - Should return an image (200 status)
   - Should NOT contain API key in response headers or body

2. **Check Buffet Detail Page**: Visit any buffet detail page
   - Photos should render in grid
   - Check browser DevTools Network tab - should see requests to `/api/photo`
   - Verify no Google API key appears in HTML source or Network requests

3. **Check Console**: No errors related to missing images or 404s

## Environment Variables Required

Ensure `.env.local` contains:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```
## Notes

- The proxy route uses `GOOGLE_MAPS_API_KEY` on the server
- Images are strongly cached to reduce API calls
- Error responses are JSON formatted for debugging
