# Mobile Audit

This document defines the mobile-first UX targets and completion criteria for the Chinese Buffet site.

## Mobile-first UX goals

- Speed: pages feel instant on mid-tier mobile devices.
- Clarity: users can quickly find nearby buffets and key details.
- Thumb-friendly nav: primary actions are reachable one-handed.
- Scannability: content is easy to skim with strong hierarchy.

## Global acceptance criteria

- Core Web Vitals: LCP < 2.5s on mid-tier mobile, CLS < 0.1, INP rated "good".
- Tap targets: all interactive elements are at least 44px by 44px.
- No horizontal scrolling on any page at common mobile widths.
- Buffet detail: the main CTA is reachable within the first viewport.
- Filters: usable with one thumb, and results update fast after changes.

## Per-page checklist

### Home

- Hero search is visible without scrolling.
- Primary CTAs are above the fold and thumb-reachable.
- Sections are short, scannable, and vertically spaced for touch.
- Cards have clear affordance and large tap targets.
- No layout shifts when images load.

### State

- State title and search/filter controls are visible near the top.
- City list is grouped, scannable, and easy to tap.
- Filter chips and sorting controls remain reachable.
- Pagination or infinite list does not block navigation.
- Empty or zero-result states are clear and actionable.

### City

- City header and key filters are visible within the first viewport.
- Neighborhood list is grouped and tap-friendly.
- Results are easy to scan with consistent card sizes.
- Sticky filter bar does not obscure content.
- Map or secondary content does not push results below the fold.

### Neighborhood

- Neighborhood name and key filters are visible within the first viewport.
- Buffet cards show distance, rating, and price range clearly.
- Filters are usable with one thumb and update results fast.
- Loading states are short, readable, and do not shift layout.
- No horizontal scroll from card grids or tables.

### Buffet detail

- Hero image and primary CTA are visible in the first viewport.
- Key info (hours, price, rating, location) is scannable.
- Secondary actions are available but do not compete with the main CTA.
- Long sections are chunked with clear headings.
- Reviews and photos are easy to browse with one thumb.

## Definition of done

### Layout

- Consistent spacing and typography across pages.
- Primary actions are within thumb range.
- No horizontal scrolling at any mobile width.
- Content is organized into short, scannable sections.

### Performance

- LCP < 2.5s on mid-tier mobile.
- CLS < 0.1.
- INP rated "good".
- Images are optimized and load without layout shifts.

### Accessibility

- Tap targets >= 44px.
- Color contrast meets WCAG AA.
- Focus states are visible and consistent.
- Screen readers announce labels for controls and CTAs.

### SEO

- Unique, descriptive titles and meta descriptions per page.
- Canonical URLs are set and valid.
- Structured data is present where applicable.
- Indexable pages avoid accidental noindex.
