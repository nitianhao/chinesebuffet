# Buffet Detail Page – Image Optimization

This document describes how images are optimized on the buffet detail page for LCP (Largest Contentful Paint) and bandwidth efficiency.

## LCP Image

**The LCP image is the first buffet photo** (index 0) in the Photos section.

- **Location**: Photos section (`#photos`), first image in the grid
- **Optimization**:
  - `loading="eager"` for the first image
  - `/api/photo?photoReference=...&w=800` for all buffet images
  - `object-cover` to preserve layout

## Image Sources

1. **Google Places `photoReference`** → `/api/photo?photoReference=...&w=800`
   - Uses Google Places API (New) media endpoint on the server
   - Client only ever sees `/api/photo`

## Layout Shift Prevention

- Each image wrapper uses `style={{ aspectRatio }}` from `image.widthPx / image.heightPx`, or `4/3` fallback
- Raw `<img>` with `object-cover` keeps the image within the reserved space

## API Routes

### `/api/photo`

- **Parameters**: `photoReference` (required), `w` (optional, default 800)
- **Behavior**: Fetches from Google Places API (New) media endpoint; streams response
- **Cache**: `Cache-Control: public, max-age=31536000, immutable`

## Summary

All buffet photos use `/api/photo` with `photoReference` and render via `<img>` tags.
