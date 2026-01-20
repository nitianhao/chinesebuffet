# Menu Scraping System

This system scrapes restaurant menu data from URLs and stores it in a structured format in InstantDB.

## Overview

The menu scraping infrastructure supports:
- **HTML pages** - Extracts text using Cheerio
  - Automatically detects and processes menu images within HTML pages using OCR
  - Falls back to Puppeteer for JavaScript-rendered content (when available)
- **PDF files** - Extracts text using pdf-parse
- **Direct images** - Extracts text using Tesseract.js OCR
- **Image-based menus** - Detects menu images in HTML pages and processes them with OCR

Menus are parsed into structured format with categories, items, descriptions, and prices.

## Database Schema

A new `menus` entity has been added to InstantDB with the following fields:
- `placeId` (indexed) - Links to buffet via Google Place ID
- `sourceUrl` - Original menu URL
- `contentType` - HTML, PDF, or IMAGE
- `rawText` - Extracted raw text
- `structuredData` - JSON stringified structured menu
- `categories` - JSON stringified array of menu categories
- `items` - JSON stringified array of menu items
- `scrapedAt` - Timestamp
- `status` - SUCCESS, FAILED, or PENDING
- `errorMessage` - Error details if failed

## Installation

Install required dependencies:

```bash
npm install
```

The following packages are used:
- `cheerio` - HTML parsing (already in devDependencies)
- `pdf-parse` - PDF text extraction
- `tesseract.js` - OCR for images

## Usage

### Scraping Menus

#### Option 1: Use default file (buffets-urls-websites.json)

```bash
npm run scrape-menus
```

This will read menu URLs from `data/buffets-urls-websites.json` and process all records with `menu1_check: "OK"` or `menu2_check: "OK"`.

#### Option 2: Provide custom URLs file

```bash
node scripts/scrape-menus.js --urls-file path/to/urls.json
```

The JSON file should have this format:
```json
[
  {
    "url": "https://example.com/menu",
    "placeId": "ChIJ..."
  }
]
```

Or it can use the same format as `buffets-urls-websites.json`:
```json
[
  {
    "PlaceID": "ChIJ...",
    "menu1": "https://example.com/menu",
    "menu1_check": "OK"
  }
]
```

#### Option 3: Single URL

```bash
node scripts/scrape-menus.js --url "https://example.com/menu" --place-id "ChIJ..."
```

### Configuration

Edit `scripts/scrape-menus.js` to adjust:
- `delayBetweenRequests` - Delay between requests (default: 2000ms)
- `requestTimeout` - Request timeout (default: 30000ms)
- `maxRetries` - Maximum retry attempts (default: 3)
- `batchSize` - Batch size for progress updates (default: 10)

## Menu Structure

Menus are parsed into this structure:

```json
{
  "categories": [
    {
      "name": "Appetizers",
      "items": [
        {
          "name": "Spring Rolls",
          "description": "Crispy vegetable rolls",
          "price": "$4.99",
          "priceNumber": 4.99
        }
      ]
    }
  ],
  "items": [
    {
      "name": "Spring Rolls",
      "description": "Crispy vegetable rolls",
      "price": "$4.99",
      "priceNumber": 4.99
    }
  ],
  "metadata": {
    "sourceUrl": "https://example.com/menu",
    "extractedAt": "2024-01-01T00:00:00.000Z",
    "parsingStatus": "SUCCESS",
    "totalCategories": 1,
    "totalItems": 1
  }
}
```

## Display

The `Menu` component automatically displays structured menus with:
- Categories as sections
- Items with prices
- Descriptions
- Link to original menu

Menus are automatically fetched when viewing a buffet detail page if `includeMenu: true` is passed to `getBuffetBySlug()`.

## API

### Get Menu for Buffet

```typescript
import { getMenuForBuffet } from '@/lib/data-instantdb';

const menu = await getMenuForBuffet(placeId);
```

### Get Buffet with Menu

```typescript
import { getBuffetBySlug } from '@/lib/data-instantdb';

const buffet = await getBuffetBySlug(citySlug, buffetSlug, false, true);
// The buffet.menu will contain structured menu data
```

## Error Handling

- Network errors: Retried with exponential backoff
- Parsing errors: Raw text stored as fallback
- Invalid URLs: Marked as FAILED with error message
- Rate limiting: Configurable delays between requests

## Progress Tracking

The scraper:
- Saves progress after each menu
- Skips already scraped menus (checks by placeId)
- Shows progress updates every N menus
- Logs success/failure counts

## Notes

- Menus are linked to buffets via `placeId` (not a database foreign key)
- Only one menu per placeId is stored (most recent)
- The system handles various menu formats flexibly
- **Image-based menus**: The scraper automatically detects images within HTML pages (common for restaurants using image menus) and processes them with OCR
- OCR for images is slower but supports menu images and image-based menus
- PDF parsing works for most PDF menus
- JavaScript-rendered pages may require Puppeteer (configured separately)

## Image Menu Detection

The scraper automatically:
1. Scans HTML pages for images (especially those with "menu" in URL/alt text)
2. Downloads and processes menu images with OCR
3. Combines extracted text from HTML and images
4. Parses the combined text into structured format

This handles common scenarios where restaurants embed menu images in their HTML pages.

