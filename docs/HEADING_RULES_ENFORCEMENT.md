# Heading Rules Enforcement

## Overview

Strict heading hierarchy rules are enforced on all buffet detail pages to ensure:
- SEO compliance
- Accessibility standards
- Consistent page structure
- Proper semantic HTML

## Rules

### H1: Buffet Name + City + State
- **Exactly one H1** per page
- **Format**: `"{Buffet Name} in {City}, {State}"`
- **Fallback**: `"{Buffet Name} in {City}"` if state unavailable
- **Location**: Decision Header Section
- **Example**: "Golden Dragon Buffet in Salem, Oregon"

### H2: Core Sections Only
**Allowed H2 sections:**
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

**Forbidden:**
- POI categories (must use H3)
- Review themes (must use H3)
- Any subsection

### H3: Subsections
**Required for:**
- POI categories (e.g., "Financial Services", "Food & Dining")
- Review themes (e.g., "Review Highlights by Theme")
- Sub-sections within H2 sections (e.g., "Regular Hours", "Popular Times")

### H4: Items
**Used for:**
- POI group labels (within POI sections)
- Individual POI item names
- Review theme labels (within ReviewThemes)
- FAQ question headers

### No Skipped Levels
- **Enforced**: Headings must be sequential
- **Valid**: H1 → H2 → H3 → H4
- **Invalid**: H1 → H3 (skipped H2), H2 → H4 (skipped H3)

## Validation

### Runtime Validation
- **Component**: `HeadingValidator` (development mode only)
- **Location**: Rendered in buffet detail page
- **Output**: Console warnings/errors in browser dev tools

### Static Validation
- **Script**: `npm run validate-headings`
- **Usage**: `node scripts/validate-headings.js [file-path]`
- **Output**: Errors, warnings, and heading list

### TypeScript Types
- **File**: `lib/heading-validator.ts`
- **Functions**: 
  - `validateHeadingHierarchy()` - Validate heading structure
  - `extractHeadingsFromCode()` - Extract headings from code
  - `validatePageHeadings()` - Runtime validation helper

## Implementation

### Current Fixes Applied
1. ✅ H1 now includes city and state
2. ✅ POI sections use H3 (not H2)
3. ✅ POI groups use H4 (not H3)
4. ✅ Review themes use H3
5. ✅ All headings follow sequential hierarchy

### Components Updated
- `POISection`: Uses H3 (was H2)
- `POISectionCard`: Uses H3 (was H2)
- `POIGroupAccordion`: Uses H4 (was H3)
- `ExtendedLocalInfo`: Uses H3 (correct)
- `ReviewThemes`: Uses H3 (correct)
- `BestForSection`: Uses H3 (correct)

## Usage

### Development
Runtime validation runs automatically in development mode. Check browser console for warnings.

### Pre-commit
```bash
npm run validate-headings
```

### CI/CD
Add to build pipeline:
```bash
npm run validate-headings || exit 1
```

## Examples

### ✅ Valid Structure
```html
<h1>Golden Dragon Buffet in Salem, Oregon</h1>
<h2 id="overview">Overview</h2>
<h2 id="reviews">Reviews</h2>
  <h3>Review Highlights by Theme</h3>
    <h4>Food Quality</h4>
<h2 id="nearby-places">Nearby Places</h2>
  <h3>Financial Services</h3>
    <h4>Banks</h4>
      <h4>ATMs</h4>
```

### ❌ Invalid Structure
```html
<!-- ERROR: H1 missing city/state -->
<h1>Golden Dragon Buffet</h1>

<!-- ERROR: POI category using H2 (should be H3) -->
<h2>Financial Services</h2>

<!-- ERROR: Skipped level (H1 → H3) -->
<h1>Buffet Name</h1>
<h3>Some Section</h3>
```
