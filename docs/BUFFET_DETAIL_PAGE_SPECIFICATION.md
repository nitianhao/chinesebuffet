# Buffet Detail Page - Canonical Specification

## Overview

This document defines the canonical structure for all buffet detail pages. Every buffet page MUST conform to this specification to ensure consistency, SEO optimization, and user experience.

## Section Categories

### 1. Mandatory Sections
**Always rendered, regardless of data availability.**
- These sections provide core page structure and SEO value
- Must include fallback content if data is missing
- Cannot be omitted

### 2. Optional Sections
**Rendered only when specific data exists.**
- Conditional rendering based on data availability
- Omitted entirely if data is missing (no empty sections)
- Must have clear visibility conditions

### 3. SEO-Only Sections
**Always in DOM, may be visually hidden.**
- Content remains accessible to search engines
- May use `sr-only` or similar techniques when collapsed
- Critical for long-tail SEO

### 4. User-Only Sections
**Visible to users, may not be indexed separately.**
- Interactive elements (e.g., collapsible sections)
- User experience enhancements
- May be hidden from initial render but accessible on interaction

---

## Canonical Section Order

### Tier 1: Above the Fold (Mandatory)

#### 1. Decision Header Section
- **Type**: Mandatory
- **Heading**: H1
- **ID**: None (root section)
- **Visibility**: Always shown
- **Content**:
  - H1: Buffet name (required)
  - Rating + review count (optional, shown if data exists)
  - Price range badge (optional, shown if data exists)
  - Open/Closed status (optional, shown if hours data exists)
  - Comparison context (optional, shown if 3+ nearby buffets)
  - Cuisine tags (optional, shown if categories exist)
  - Decision summary (1-2 sentence AI-generated, optional)
- **Omit if**: Never omitted (fallback to name only)

#### 2. Verdict Module
- **Type**: Optional (User-Only)
- **Heading**: None (card component)
- **ID**: None
- **Visibility**: Always shown (generates fallback content)
- **Content**: "Should you eat here?" verdict with 3 bullets
- **Omit if**: Never omitted (always generates content)

#### 3. Best For / Not Ideal For Section
- **Type**: Optional (User-Only)
- **Heading**: H3
- **ID**: None
- **Visibility**: Always shown (generates fallback content)
- **Content**: Two-column suitability analysis
- **Omit if**: Never omitted (always generates content)

---

### Tier 2: Core Content (Mandatory)

#### 4. Overview Section
- **Type**: Mandatory
- **Heading**: H2
- **ID**: `overview`
- **Visibility**: Always shown
- **Content**:
  - Address (optional, shown if exists)
  - Description (optional, shown if description2 or description exists)
- **Omit if**: Never omitted (section always rendered, content may be minimal)

#### 5. Summary Panel
- **Type**: Optional (User-Only)
- **Heading**: None (card component)
- **ID**: None
- **Visibility**: Shown if buffet has any summary data
- **Content**: Quick reference card with key facts
- **Omit if**: No summary data available

---

### Tier 3: Media & Location (Optional)

#### 6. Photos Section
- **Type**: Optional
- **Heading**: H2
- **ID**: `photos`
- **Visibility**: Shown if `images.length > 0` OR `imageCount > 0`
- **Content**: Image gallery
- **Omit if**: No images and imageCount === 0

#### 7. Hours & Location Section
- **Type**: Optional
- **Heading**: H2
- **ID**: `hours-location`
- **Visibility**: Shown if `hours.hours` OR `hours.popularTimesHistogram` exists
- **Content**:
  - Hours table (if hours.hours exists)
  - Best Time to Visit component (if hours or reviews exist)
  - Map (if location.lat/lng exists)
- **Omit if**: No hours data

#### 8. Contact Information Section
- **Type**: Optional
- **Heading**: H2
- **ID**: `contact`
- **Visibility**: Shown if `contactInfo.phone` OR `contactInfo.menuUrl` OR `contactInfo.orderBy` exists
- **Content**: Phone, menu links, order links
- **Omit if**: No contact data

---

### Tier 4: Attributes & Reviews (Optional)

#### 9. Accessibility & Amenities Section
- **Type**: Optional (User-Only, Mobile Collapsible)
- **Heading**: H2
- **ID**: `accessibility-amenities`
- **Visibility**: Shown if `accessibility` OR `amenities` exists
- **Content**:
  - AttributesSummary component (human-readable summary)
  - Accessibility component (if data exists)
  - Amenities component (if data exists)
  - Atmosphere, Food Options, Parking, Payment, Service Options, Food & Drink, Highlights, Planning (if data exists)
- **Omit if**: No accessibility or amenities data
- **Mobile**: Collapsible (low priority)

#### 10. Reviews Section
- **Type**: Optional
- **Heading**: H2
- **ID**: `reviews`
- **Visibility**: Shown if `reviewsCount > 0` OR `reviewsDistribution` OR `reviewsTags` OR `reviews.length > 0`
- **Content**:
  - ReviewThemes component (thematic clusters)
  - Rating distribution
  - Review tags
  - Full review list (collapsible)
- **Omit if**: No review data
- **SEO**: All reviews remain in DOM (sr-only when collapsed)

#### 11. FAQs Section
- **Type**: Optional (SEO-Only, Mobile Collapsible)
- **Heading**: H2
- **ID**: `faqs`
- **Visibility**: Shown if `questionsAndAnswers.length > 0`
- **Content**: Q&A pairs
- **Omit if**: No Q&A data
- **Mobile**: Collapsible (low priority)
- **SEO**: Always in DOM for FAQPage schema

---

### Tier 5: Nearby Context (Optional, SEO-Heavy)

#### 12. Nearby Highlights Section
- **Type**: Optional (User-Only)
- **Heading**: H2
- **ID**: None
- **Visibility**: Shown if transportationAutomotive OR retailShopping OR recreationEntertainment exists
- **Content**: Horizontal strip of closest parking, shopping, gas, attraction
- **Omit if**: No relevant POI data

#### 13. Nearby Places Section
- **Type**: Optional (SEO-Only, Extended Local Info)
- **Heading**: H2
- **ID**: `nearby-places`
- **Visibility**: Shown if any POI section has data
- **Content**: Wrapped in DeferredSection for performance
- **Subsections** (all Optional, Extended Local Info):
  - Financial Services (H3 via ExtendedLocalInfo)
  - Food & Dining (H3 via POISectionCard)
  - Government & Public Services (H3 via ExtendedLocalInfo)
  - Healthcare & Medical Services (H3 via POISectionCard)
  - Garden & Home Improvement (H3 via ExtendedLocalInfo)
  - Industrial Manufacturing (H3 via ExtendedLocalInfo)
  - Miscellaneous Services (H3 via ExtendedLocalInfo)
  - Personal Care & Beauty (H3 via ExtendedLocalInfo)
  - Professional & Business Services (H3 via ExtendedLocalInfo)
  - Recreation & Entertainment (H3 via POISectionCard)
  - Religious & Spiritual (H3 via ExtendedLocalInfo)
  - Retail & Shopping (H3 via POISectionCard)
  - Sports & Fitness (H3 via ExtendedLocalInfo)
  - Transportation & Automotive (H3 via POISectionCard)
  - Travel & Tourism Services (H3, custom format)
  - Utilities & Infrastructure (H3 via ExtendedLocalInfo)
  - Accommodation & Lodging (H3 via POISectionCard)
  - Arts & Culture (H3 via POISectionCard)
  - Communications & Technology (H3 via ExtendedLocalInfo)
- **Omit if**: No POI data
- **SEO**: All content in DOM, ExtendedLocalInfo uses sr-only when collapsed

#### 14. Neighborhood Context Section
- **Type**: Optional (SEO-Only, Mobile Collapsible)
- **Heading**: H2 (via MobileCollapsibleSection)
- **ID**: `neighborhood-context`
- **Visibility**: Shown if `neighborhoodContext` exists
- **Content**: Neighborhoods (H3), districts (H3), county (H3), metro area (H3)
- **Omit if**: No neighborhood data
- **Mobile**: Collapsible (low priority)

---

### Tier 6: Related Content (Optional)

#### 15. Related Buffets Comparison Grid
- **Type**: Optional (User-Only)
- **Heading**: H2
- **ID**: `related-buffets`
- **Visibility**: Shown if `nearbyBuffetsForComparison.length > 0`
- **Content**: Grid of nearby buffets with ratings, distance, price
- **Omit if**: No nearby buffets

#### 16. Related Links Section
- **Type**: Optional (User-Only, Mobile Collapsible)
- **Heading**: H2
- **ID**: `related-links`
- **Visibility**: Shown if `webResults.length > 0`
- **Content**: External links
- **Omit if**: No web results
- **Mobile**: Collapsible (low priority)

---

## Heading Hierarchy (STRICT RULES)

### H1 (Single Use - Required)
- **Location**: Decision Header Section
- **Content**: Buffet name + city + state
- **Format**: `"{Buffet Name} in {City}, {State}"` or `"{Buffet Name} in {City}"` if state unavailable
- **Rules**: 
  - **Exactly one H1 per page** (enforced)
  - Must include city and state when available
  - Required (page invalid without it)
  - Example: "Golden Dragon Buffet in Salem, Oregon"

### H2 (Core Sections Only - Strict)
- **Usage**: **ONLY** core major sections
- **Allowed H2 Sections**:
  - Overview
  - Photos
  - Hours & Location
  - Contact Information
  - Accessibility & Amenities
  - Reviews
  - FAQs
  - Nearby Places
  - Related Buffets
  - Related Links
- **Rules**:
  - **Each major section gets exactly one H2**
  - Must have unique `id` attribute for anchor links
  - Use `scroll-mt-24` for scroll offset
  - Format: Section divider with icon + H2
  - **POI categories MUST NOT use H2** (use H3 instead)
  - **Review themes MUST NOT use H2** (use H3 instead)

### H3 (Subsections - Strict)
- **Usage**: 
  - Extended Local Info sections (POI categories) - **REQUIRED**
  - POI section titles (when not using ExtendedLocalInfo) - **REQUIRED**
  - Review themes (e.g., "Review Highlights by Theme") - **REQUIRED**
  - Sub-sections within major sections (e.g., "Regular Hours", "Popular Times")
- **Rules**:
  - **POI categories MUST use H3** (not H2)
  - Used for ExtendedLocalInfo component titles
  - Used for POISection titles when hideTitle=false
  - Used for ReviewThemes section title
  - Can be nested under H2 sections
  - **No skipped levels**: H3 must follow H2 (not H1)

### H4 (Item Headers)
- **Usage**:
  - POI group labels (within POI sections)
  - Individual POI item names
  - Review theme labels (within ReviewThemes)
  - FAQ question headers
- **Rules**:
  - Used for individual items within sections
  - Typically within accordions or lists
  - **No skipped levels**: H4 must follow H3 (not H2 or H1)

### Heading Hierarchy Rules (ENFORCED)
1. **Exactly one H1** per page (buffet name + city + state)
2. **No skipped heading levels**: H1 → H2 → H3 → H4 (sequential only)
3. **H2 reserved for core sections only** (see allowed list above)
4. **POI categories must use H3** (not H2)
5. **Review themes must use H3** (not H2)
6. **POI groups must use H4** (under H3 POI sections)

---

## Section Omission Rules

### Never Omit
1. Decision Header (H1 required)
2. Overview Section (H2 required, even if minimal content)
3. Verdict Module (always generates content)
4. Best For Section (always generates content)

### Omit If No Data
1. Photos: No images AND imageCount === 0
2. Hours & Location: No hours.hours AND no hours.popularTimesHistogram
3. Contact: No phone AND no menuUrl AND no orderBy
4. Accessibility & Amenities: No accessibility AND no amenities
5. Reviews: No reviewsCount AND no reviewsDistribution AND no reviewsTags AND no reviews
6. FAQs: No questionsAndAnswers OR questionsAndAnswers.length === 0
7. Nearby Highlights: No transportationAutomotive AND no retailShopping AND no recreationEntertainment
8. Nearby Places: No POI sections have data
9. Neighborhood Context: No neighborhoodContext
10. Related Buffets: nearbyBuffetsForComparison.length === 0
11. Related Links: No webResults OR webResults.length === 0

### Conditional Rendering Patterns

```typescript
// Pattern 1: Simple existence check
{buffet.images && buffet.images.length > 0 && (
  <section>...</section>
)}

// Pattern 2: Multiple conditions (OR)
{(buffet.transportationAutomotive || buffet.retailShopping || buffet.recreationEntertainment) && (
  <section>...</section>
)}

// Pattern 3: Complex condition
{buffet.hours && (buffet.hours.hours || buffet.hours.popularTimesHistogram) && (
  <section>...</section>
)}

// Pattern 4: Always render with fallback
<section>
  {buffet.description2 || buffet.description ? (
    <div>{buffet.description2 || buffet.description}</div>
  ) : (
    <div>No description available.</div>
  )}
</section>
```

---

## SEO Considerations

### Always in DOM
- All review content (even when collapsed)
- All FAQ content
- All POI content (ExtendedLocalInfo uses sr-only when collapsed)
- All description text
- All structured data (JSON-LD)

### Hidden but Indexed
- Collapsed reviews: Use `sr-only` class
- Extended Local Info: Use `sr-only` when collapsed
- Mobile collapsed sections: Content remains in DOM

### Structured Data
- Restaurant schema (always)
- FAQPage schema (if FAQs exist)
- Review schema (for each review)
- BreadcrumbList schema (always)

---

## Mobile Optimization

### Collapsible Sections (Low Priority)
- Accessibility & Amenities
- FAQs
- Neighborhood Context
- Related Links

### Collapsible Sections (Medium Priority)
- None currently

### Always Expanded
- Decision Header
- Overview
- Verdict Module
- Best For Section
- Photos (if exists)
- Hours & Location (if exists)
- Reviews (if exists)

---

## Performance Considerations

### Deferred Loading
- Nearby Places Section: Wrapped in DeferredSection (threshold: 800px)
- Large POI sections: Lazy loaded

### Image Optimization
- All images use SafeImage component
- Lazy loading for gallery images
- Responsive image sizing

---

## Validation Checklist

Every buffet page MUST:
- [ ] Have exactly one H1 (buffet name)
- [ ] Have Overview section (H2) with id="overview"
- [ ] Have Decision Header section
- [ ] Have Verdict Module
- [ ] Have Best For Section
- [ ] All H2 sections have unique `id` attributes
- [ ] All H2 sections use `scroll-mt-24` for scroll offset
- [ ] No empty sections rendered (omit if no data)
- [ ] All SEO content remains in DOM
- [ ] Structured data (JSON-LD) is present
- [ ] Table of Contents matches visible sections

---

## Implementation Notes

### Section Wrapper Components
- `MobileCollapsibleSection`: For mobile-optimized collapsible sections
- `DeferredSection`: For performance-optimized lazy loading
- `ExtendedLocalInfo`: For SEO-heavy, long-tail sections
- `POISectionCard`: For high-priority POI sections
- `POISection`: For standard POI sections

### Data Requirements
- Minimum: Name (H1), Overview section
- Recommended: Rating, reviews, address, description
- Optional: All other sections based on data availability

---

## Version History

- **v1.0** (2024): Initial specification
  - Defined mandatory vs optional sections
  - Established heading hierarchy
  - Documented SEO considerations
  - Added mobile optimization rules
