# Google Places Photo Display Fix

## Problem Diagnosis

**Root Cause:** Photos were not rendering on localhost because:

1. **Missing API Route**: The frontend was calling `/api/place-photo` which didn't exist, causing 404 errors
2. **API Key Exposure Risk**: The original `photoUrl` fields in the database contained Google API keys that would be exposed to browsers
3. **Data Structure Mismatch**: The code was extracting `photoReference` from database objects but the proxy route wasn't implemented

## Solution Implemented

### 1. Created `/api/place-photo` Proxy Route
- **Location**: `app/api/place-photo/route.ts`
- **Purpose**: Securely proxy Google Places photos without exposing API keys
- **Features**:
  - Accepts `photoReference` parameter (e.g., `places/.../photos/...`)
  - Accepts optional `maxWidthPx` and `maxHeightPx` parameters
  - Builds Google Places API URL server-side using `GOOGLE_MAPS_API_KEY` from environment
  - Streams image bytes directly to client
  - Returns proper cache headers (24 hour cache)
  - Handles errors gracefully (400, 500, 502 responses)

### 2. Updated Next.js Config
- **File**: `next.config.js`
- **Change**: Added `places.googleapis.com` to `remotePatterns` (fallback, though proxy is primary)

### 3. Enhanced Frontend Rendering
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
✅ **No Key in Network Requests**: Browser only sees `/api/place-photo` URLs

## Verification Checklist

- [x] `/api/place-photo` route created and functional
- [x] Frontend updated to use proxy route
- [x] Error handling added for broken images
- [x] Aspect ratio preservation for layout stability
- [x] Next.js config updated (defensive measure)
- [x] API key never exposed to browser

## Testing

To verify the fix works:

1. **Check API Route**: Visit `http://localhost:3000/api/place-photo?photoReference=places/ChIJzSx4EjkG2YgRuVMnhaPRb7M/photos/AZLasHq4cj8UXV9fFfhv-KkLNGD8HLqQnE4eJmhwBGMo_LTR8jIopPsljWMEcETBkX1mHOasL8xQV65mS6LK_DdWCvlcqKOh4cRD3_PtAyoZfkQcc3Zf-h2U0CoorDstc1aM1lM8Kii3bf47bOvpVlVjrPf2S54_7pHEFPmEHLxISM3fUhjv14oXoLC3BByuiuiRQ5gHxThU0AsBIYeH6I017onn98D95rc357KmRvu8M7P0fLQGYGNT4uABf43cofWTy_ItiOTmjXNaB1kaJtu8DtNNBxP60XCJ4FqMR5Fr_lnWsF7WXfDjP-mX88LLQhQCLkruZOo0KXqJEgv1yIAmrDMoqaDx-bxSX6HLt4KhL2zE43_WBh-IZ8yklNO1Byf_nZe3drvmaFJphnANvIzeHjghDo5BfwuxN0dqs7tnNK6EzL0j&maxWidthPx=800`
   - Should return an image (200 status)
   - Should NOT contain API key in response headers or body

2. **Check Buffet Detail Page**: Visit any buffet detail page
   - Photos should render in grid
   - Check browser DevTools Network tab - should see requests to `/api/place-photo`
   - Verify no Google API key appears in HTML source or Network requests

3. **Check Console**: No errors related to missing images or 404s

## Environment Variables Required

Ensure `.env.local` contains:
```
GOOGLE_MAPS_API_KEY=your_api_key_here
```
OR
```
GOOGLE_PLACES_API_KEY=your_api_key_here
```

## Notes

- The proxy route handles both `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACES_API_KEY` environment variables
- Images are cached for 24 hours to reduce API calls
- The route supports both `maxWidthPx` and `maxHeightPx` parameters for flexible sizing
- Error responses are JSON formatted for debugging
