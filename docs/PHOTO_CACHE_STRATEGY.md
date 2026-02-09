# Photo Cache Strategy – DB-First External Calls

This document describes the current server-side photo proxy and caching behavior.

## Current Approach

- One proxy route: `/api/photo`
- All buffet images use `photoReference` from the DB
- Client only ever sees `/api/photo` URLs (no API key exposure)

## Caching

- **Server fetch**: `next: { revalidate: 60 * 60 * 24 * 30 }`
- **Browser cache**: `Cache-Control: public, max-age=31536000, immutable`

## Dependencies

- `GOOGLE_MAPS_API_KEY` required by `/api/photo`
