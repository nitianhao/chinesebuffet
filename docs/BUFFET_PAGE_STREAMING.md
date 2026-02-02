# Buffet Detail Page Streaming

## Overview

The buffet detail page uses **React Suspense + Server Component streaming** to get meaningful content on screen ASAP. The shell (above-the-fold) renders first; heavy below-the-fold sections stream in progressively.

## Above-the-Fold (Shell)

Rendered immediately—no Suspense:

| Content | Purpose |
|---------|---------|
| Breadcrumb | Navigation context |
| Hero card | Title, rating, badges, CTAs (Directions, Call, Website, Menu) |
| Map | Location (if lat/lng) |
| Verdict | "Should You Eat Here?" decision |
| Best For | Quick decision aid |
| Jump to nav (mobile) | Section navigation |

This is the minimal shell needed for LCP and perceived load. All data (buffet, city, transforms) is fetched in parallel before render; the shell is just the first HTML chunk sent.

## What Streams (Below-the-Fold)

Each wrapped in `<Suspense fallback={<SectionFallback />}>` + `StreamableSection`:

| Section | Why it streams |
|---------|----------------|
| **SeoJsonLd** | Long JSON-LD schema (Restaurant, FAQPage, BreadcrumbList, Place[]). CPU-heavy, invisible. |
| **SEOContentBundle** | Modifier variants, answer engine content. Not LCP-critical. |
| **About + BuffetSummaryPanel** | Description, key facts, decision summary. Below fold on mobile. |
| **Photos + Hours** | Image grid (many SafeImage), hours accordions. Heavy DOM. |
| **Amenities** | Many accordions (Accessibility, Amenities, Atmosphere, etc.). Heavy DOM. |
| **Menu** | Potentially large menu with categories/items. |
| **Reviews** | ReviewsBundle with distribution, tags, list. |
| **FAQs** | AnswerEngineQA. |
| **POIBundle + ComparisonBundle** | Nearby places, nearby buffets. POI data, comparison grid. |
| **Sidebar** | Jump nav, Quick Info, Quick Actions. Desktop-only, below fold on mobile. |

## How It Reduces TTFB

1. **Shell first**: React sends the shell HTML as soon as it's rendered. The browser can start parsing and painting before below-the-fold content is ready.

2. **No blocking on heavy sections**: Previously, the server waited for the entire page (SeoJsonLd, Photos, Amenities, etc.) before sending the first byte. Now it sends the shell + fallbacks immediately.

3. **Progressive enhancement**: Fallbacks (simple gray skeletons) show where content will appear. Real content streams in as each `StreamableSection` resolves.

4. **Parallel resolution**: Multiple Suspense boundaries resolve in parallel. Photos, Amenities, Reviews, etc. can stream in independently.

## Components

- **StreamableSection**: Async Server Component that `await Promise.resolve()` before rendering. Creates a suspension point so React streams the fallback first.
- **SectionFallback**: Minimal gray bar (`h-12 rounded bg-[var(--muted)]/20 animate-pulse`). No new UI features.

## Data Flow

Data is fetched once at the top of the page (buffet, city, menu, transforms). All streamed sections receive this data as props—no additional fetches. Streaming is purely about **when** HTML is sent, not **what** data is fetched.
