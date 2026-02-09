# Structured Data (JSON-LD) Schema Documentation

This document describes the layered JSON-LD structured data implementation for buffet detail pages.

## Overview

The site uses Schema.org structured data to provide rich search results and improve SEO. Each buffet detail page includes multiple schema types that work together to describe the business comprehensively.

## Schema Hierarchy

```
@graph
├── Restaurant (extends LocalBusiness)
│   ├── AggregateRating
│   └── Review[] (embedded)
├── FAQPage
│   └── Question[]
│       └── Answer
├── BreadcrumbList
│   └── ListItem[]
└── Place[] (for nearby POIs)
```

## Schema Types

### 1. Restaurant Schema

The primary schema for the buffet, extending LocalBusiness.

**Required Fields:**
- `@type`: "Restaurant"
- `@id`: Unique identifier (page URL + "#restaurant")
- `name`: Buffet name

**Recommended Fields:**
- `address`: PostalAddress object
- `geo`: GeoCoordinates (lat/lng)
- `telephone`: Phone number
- `priceRange`: e.g., "$$"
- `servesCuisine`: ["Chinese"]
- `aggregateRating`: Rating summary
- `review`: Array of Review objects
- `image`: Array of image URLs
- `openingHoursSpecification`: Hours by day

**Example:**
```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "@id": "https://example.com/chinese-buffets/salem-or/china-buffet#restaurant",
  "name": "China Buffet",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "123 Main St",
    "addressLocality": "Salem",
    "addressRegion": "OR",
    "postalCode": "97301",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 44.9429,
    "longitude": -123.0351
  },
  "telephone": "(503) 555-1234",
  "priceRange": "$$",
  "servesCuisine": ["Chinese"],
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.2",
    "reviewCount": "172",
    "bestRating": "5",
    "worstRating": "1"
  }
}
```

### 2. Review Schema

Individual customer reviews, embedded within Restaurant schema.

**Required Fields:**
- `@type`: "Review"
- `reviewRating`: Rating object with ratingValue
- `reviewBody`: Review text

**Recommended Fields:**
- `author`: Person object with name
- `datePublished`: ISO 8601 date

**Example:**
```json
{
  "@type": "Review",
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "5",
    "bestRating": "5",
    "worstRating": "1"
  },
  "reviewBody": "Great food and friendly service!",
  "author": {
    "@type": "Person",
    "name": "John D."
  },
  "datePublished": "2024-01-15T00:00:00.000Z"
}
```

### 3. FAQPage Schema

Questions and answers from customers.

**Required Fields:**
- `@type`: "FAQPage"
- `mainEntity`: Array of Question objects (minimum 3)

**Validation:**
- Questions must have both question text and answer text
- Answer text must be at least 10 characters

**Example:**
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://example.com/chinese-buffets/salem-or/china-buffet#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do you offer takeout?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, we offer takeout. Call ahead to place your order."
      }
    }
  ]
}
```

### 4. BreadcrumbList Schema

Navigation hierarchy for the page.

**Required Fields:**
- `@type`: "BreadcrumbList"
- `itemListElement`: Array of ListItem objects

**Structure:**
1. Home
2. Chinese Buffets (category page)
3. City, State (city page)
4. Buffet Name (current page)

**Example:**
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://example.com/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Chinese Buffets",
      "item": "https://example.com/chinese-buffets"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Salem, OR",
      "item": "https://example.com/chinese-buffets/salem-or"
    },
    {
      "@type": "ListItem",
      "position": 4,
      "name": "China Buffet",
      "item": "https://example.com/chinese-buffets/salem-or/china-buffet"
    }
  ]
}
```

### 5. Place Schema (for POIs)

Nearby points of interest, rendered as a @graph.

**Required Fields:**
- `@type`: "Place"
- `name`: POI name

**Optional Fields:**
- `additionalType`: More specific type (e.g., "ParkingFacility", "GasStation", "Store")
- `geo`: GeoCoordinates
- `address`: Address string or PostalAddress

**Example:**
```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Place",
      "@id": "https://example.com/chinese-buffets/salem-or/china-buffet#poi-0",
      "name": "City Parking Garage",
      "additionalType": "https://schema.org/ParkingFacility",
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": 44.9425,
        "longitude": -123.0345
      }
    }
  ]
}
```

## Validation

### Running Validation

```bash
# Validate all buffet pages
npm run validate-schemas

# Verbose output (shows individual failures)
npm run validate-schemas:verbose
```

### Validation Rules

1. **Restaurant Schema:**
   - Must have `name` field
   - Should have either `address` or `geo` (warning if missing)
   - `aggregateRating.ratingValue` must be 1-5
   - `aggregateRating.reviewCount` must be non-negative

2. **Review Schema:**
   - Must have `reviewRating.ratingValue`
   - Must have `reviewBody` (min 10 chars)
   - Should have `datePublished`

3. **FAQPage Schema:**
   - Must have at least 3 valid Q&A pairs
   - Each question must have text and answer

4. **BreadcrumbList Schema:**
   - Must have at least 1 item
   - Each item must have `name` and URL

5. **Place Schema:**
   - Must have `name` field
   - Should have either `geo` or `address`

## Implementation Files

- `lib/seoJsonLd.ts` - Schema builder functions
- `components/SeoJsonLd.tsx` - React component for rendering schemas
- `scripts/validate-schemas.ts` - Validation script

## Best Practices

1. **Omit vs Placeholder:** Always omit missing fields rather than using placeholder values
2. **Truncate Long Text:** Review bodies are truncated to 1200 chars, descriptions to 500 chars
3. **Validate Dates:** Only include dates that can be parsed as valid ISO 8601
4. **Validate Ratings:** Clamp ratings to 1-5 range
5. **Absolute URLs:** Always convert relative URLs to absolute

## Testing

To test structured data:
1. Build the site: `npm run build`
2. View page source and search for `application/ld+json`
3. Use [Google's Rich Results Test](https://search.google.com/test/rich-results)
4. Use [Schema.org Validator](https://validator.schema.org/)
