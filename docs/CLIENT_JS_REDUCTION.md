# Client JS Reduction – Buffet Detail Page

This document summarizes the client-side JavaScript reduction for the buffet detail page subtree.

## Client Components Removed or Minimized

### Converted to Server Components (removed `"use client"`)

| Component | Reason | Impact |
|-----------|--------|--------|
| **Accessibility** | Pure display, no hooks | Server-rendered |
| **Amenities** | Pure display, no hooks | Server-rendered |
| **Atmosphere** | Pure display, no hooks | Server-rendered |
| **FoodOptions** | Pure display, no hooks | Server-rendered |
| **Parking** | Pure display, no hooks | Server-rendered |
| **Payment** | Pure display, no hooks | Server-rendered |
| **FoodAndDrink** | Pure display, no hooks | Server-rendered |
| **Highlights** | Pure display, no hooks | Server-rendered |
| **Planning** | Pure display, no hooks | Server-rendered |
| **ServiceOptionsSection** | Pure display, no hooks | Server-rendered |
| **SignatureCard** | Pure display, no hooks | Server-rendered |
| **Breadcrumb** | Pure display with Link | Server-rendered |
| **VerdictModule** | Only used `useMemo`; compute inline | Server-rendered |
| **BestForSection** | Only used `useMemo`; compute inline | Server-rendered |
| **ModifierVariants** | Pure data processing | Server-rendered |
| **AnswerEngineQA** | Pure data processing | Server-rendered |
| **NearbyHighlights** | Pure display | Server-rendered |
| **POIBundle** | Composes server components | Server-rendered |
| **SEOContentBundle** | Wrapper for dynamic import | Server-rendered |
| **ComparisonBundle** | Wrapper for dynamic import | Server-rendered |
| **ReviewsBundle** | Wrapper for dynamic import | Server-rendered |
| **BuffetSummaryPanel** | Extracted expand logic to `ExpandableList` | Mostly server-rendered |

### New Small Client Islands

| Component | Purpose | Size |
|-----------|---------|------|
| **ExpandableList** | "Show more" expand/collapse for BuffetSummaryPanel | ~50 lines |

### Client Components Retained (require interactivity or heavy libs)

| Component | Reason |
|-----------|--------|
| **Accordion** | `useState` for toggle |
| **ShowMore** | `useState`, `useRef`, `useLayoutEffect` for line clamping |
| **JumpToNav** | `onClick`, `document.getElementById`, `window.scrollTo` |
| **BuffetLocationMap** | Wraps Map (Leaflet) |
| **Map** | Leaflet – heavy library, `useEffect`, `useState` |
| **Menu** | `useState`, `useEffect`, `createPortal` for modal |
| **ReviewsSection** | Dynamic import, reviews UI |
| **BuffetComparisonGrid** | Dynamic import |
| **InternalLinkingBlocks** | Dynamic import |

## Evidence of Reduced Client Bundle

### Before vs After (buffet detail page subtree)

- **Client boundaries removed**: 21 components converted from client to server
- **Client components remaining in buffet subtree**: Accordion, ShowMore, JumpToNav, BuffetLocationMap, Map, Menu, ReviewsSection (via ReviewsBundle), BuffetComparisonGrid, InternalLinkingBlocks, ExpandableList
- **Heavy libraries**: Leaflet (Map) remains in a dynamically imported client island; no new heavy libs added to client components

### Bundle Impact

- Server Components do not ship their code to the client
- Components like Accessibility, Amenities, Atmosphere, FoodOptions, Parking, Payment, FoodAndDrink, Highlights, Planning, ServiceOptionsSection, SignatureCard, Breadcrumb, VerdictModule, BestForSection, ModifierVariants, AnswerEngineQA, NearbyHighlights, POIBundle, SEOContentBundle, ComparisonBundle, ReviewsBundle, and BuffetSummaryPanel (minus ExpandableList) are now server-only
- Fewer client boundaries → smaller client bundle and faster hydration

### Verification

Run `npm run build` (or `npm run build:skip-budgets` to skip performance budget checks) and inspect `.next/static/chunks/` for client bundle sizes. The buffet detail page should have fewer client chunks after these changes.

Note: A pre-existing type error in `app/api/check-images-count/route.ts` may block the full build. The component changes are independent of that route.
