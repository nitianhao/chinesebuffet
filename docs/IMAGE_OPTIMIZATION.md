# Buffet Detail Page – Image Optimization

This document describes how images are optimized on the buffet detail page for LCP (Largest Contentful Paint) and bandwidth efficiency.

## LCP Image

**The LCP image is the first buffet photo** (index 0) in the Photos section.

- **Location**: Photos section (`#photos`), first image in the grid
- **Optimization**:
  - `priority={true}` – disables lazy loading; the browser fetches it eagerly
  - `maxWidthPx=1200` – upstream fetch capped at 1200px (place-photo API) or `=s1200` (photo API for Google URLs)
  - `sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"` – responsive sizing for 2/3/4-column grid
  - `fill` + `object-cover` – responsive layout without fixed dimensions

## Image Sources

1. **Google Places `photoReference`** → `/api/place-photo?photoReference=...&maxWidthPx={n}`
   - Uses Google Places API media endpoint with `maxWidthPx`
   - LCP: 1200px; others: 800px

2. **External `photoUrl` (Google/Yelp)** → `/api/photo?url=...&maxWidthPx={n}`
   - Proxies external URLs; for Google `lh*.googleusercontent.com` URLs, appends `=s{n}` to limit size
   - LCP: 1200px; others: 800px

3. **Raw string URL** → same as (2)

## Layout Shift Prevention

- Each image wrapper uses `style={{ aspectRatio }}` from `image.widthPx / image.heightPx`, or `4/3` fallback
- `next/image` with `fill` keeps the image within the reserved space
- `object-cover` avoids distortion while filling the container

## next/image Usage

- **Component**: `next/image` (not `SafeImage` or raw `<img>`)
- **Props**:
  - `fill` – responsive sizing
  - `sizes` – viewport-based sizes for srcset
  - `priority` – only on the first (LCP) image
  - `className="object-cover"`
- **Lazy loading**: default for all images except the LCP image

## API Routes

### `/api/place-photo`

- **Parameters**: `photoReference`, `maxWidthPx` (default 800)
- **Behavior**: Fetches from Google Places API with `maxWidthPx`; streams response
- **Cache**: `Cache-Control: public, max-age=86400`

### `/api/photo`

- **Parameters**: `url`, `maxWidthPx` (optional)
- **Behavior**: Proxies allowed hosts (Google, Yelp). For `lh*.googleusercontent.com`, applies `=s{maxWidthPx}` to limit size
- **Cache**: `Cache-Control: public, max-age=86400`

## Sizes Attribute

- **Mobile** (≤768px): 2-column grid → `50vw`
- **Tablet** (≤1200px): 3-column grid → `33vw`
- **Desktop** (>1200px): 4-column grid → `25vw`

## Summary

| Image       | priority | maxWidthPx | Lazy |
|------------|----------|------------|------|
| First (LCP)| ✓        | 1200       | No   |
| Others     | ✗        | 800        | Yes  |
