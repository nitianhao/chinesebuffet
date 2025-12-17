# Chinese Buffet Directory

A programmatic SEO directory for Chinese buffets across the United States, built with Next.js.

## Features

- **Homepage** with interactive map showing sample buffets
- **City Pages** for each city with 100k+ population
- **Individual Buffet Pages** with detailed information
- **Search Functionality** to find buffets by city or name
- **SEO Optimized** with schema markup, sitemaps, and proper meta tags
- **Responsive Design** with Tailwind CSS

## Prerequisites

You need Node.js and npm installed to run this project. If you don't have them installed:

### Option 1: Install from nodejs.org (Recommended)
1. Visit [https://nodejs.org/](https://nodejs.org/)
2. Download the LTS (Long Term Support) version for macOS
3. Run the installer and follow the instructions
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### Option 2: Install using Homebrew
1. Install Homebrew (if not already installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. Install Node.js:
   ```bash
   brew install node
   ```
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Process Data**
   First, you need to process the scraped data:
   ```bash
   npm run process-data
   ```
   This will:
   - Parse the JSON file from `Example JSON/`
   - Filter for Chinese buffets
   - Match buffets to cities from the CSV
   - Generate organized JSON files in the `data/` directory

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## Project Structure

```
/chinese-buffet-directory/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Homepage
│   ├── chinese-buffets/   # Dynamic routes
│   │   └── [city-state]/  # City pages
│   │       └── [slug]/    # Individual buffet pages
│   ├── sitemap.ts         # Dynamic sitemap
│   └── robots.ts          # Robots.txt
├── components/            # React components
│   ├── Map.tsx           # Interactive map
│   ├── BuffetCard.tsx    # Buffet listing card
│   ├── SearchBar.tsx     # Search component
│   └── SchemaMarkup.tsx  # SEO schema markup
├── lib/                   # Utilities
│   ├── data.ts           # Data loading functions
│   └── utils.ts          # Helper functions
├── scripts/               # Data processing
│   └── process-data.js   # Data processing script
└── data/                  # Processed data (generated)
    ├── buffets-by-city.json
    ├── buffets-by-id.json
    └── summary.json
```

## Data Processing

The data processing script (`scripts/process-data.js`) will:
1. Read the scraped JSON file
2. Filter for Chinese buffets (checks categories for "Chinese restaurant" and "Buffet")
3. Match buffets to cities from the CSV
4. Generate slugs for URLs
5. Output organized JSON files

## Configuration

Before deploying, update the following:
- `components/SchemaMarkup.tsx`: Replace `https://yoursite.com` with your actual domain
- `app/sitemap.ts`: Replace `https://yoursite.com` with your actual domain
- `app/robots.ts`: Replace `https://yoursite.com` with your actual domain

## SEO Features

- **Schema Markup**: JSON-LD for WebSite, ItemList, Restaurant, and BreadcrumbList
- **Dynamic Sitemap**: Automatically generated for all pages
- **Meta Tags**: Dynamic titles and descriptions per page
- **Internal Linking**: Hub-and-spoke model with proper navigation

## Technologies

- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- Leaflet (for maps)
- React-Leaflet
- Leaflet.markercluster

## Notes

- The map uses OpenStreetMap tiles (free, no API key required)
- Data is stored in JSON files for the MVP (can be migrated to a database later)
- City pages are generated for cities with 100k+ population
- Only cities with at least 1 buffet are included in the directory

