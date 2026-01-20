# Health Inspection Data Collection - Complete Guide

## Overview

This directory contains scripts and tools for collecting, matching, and integrating health inspection data for Chinese buffet restaurants across the United States.

## Current Status

### ✅ Completed

1. **NYC Data Collection**
   - ✅ Fetched 441 NYC restaurants with health inspection data
   - ✅ Data stored in `data/health-inspections/nyc-inspections.json`
   - ✅ Complete with grades, scores, violations, and history

2. **Matching System**
   - ✅ Fuzzy matching algorithm (name, address, phone)
   - ✅ State filtering
   - ✅ Confidence scoring
   - ✅ Ready to match any collected data

3. **Data Structure**
   - ✅ Standardized health inspection format
   - ✅ Supports all common data fields
   - ✅ Compatible with database schema

4. **Web Scraping Infrastructure**
   - ✅ Generic scraper framework
   - ✅ City configuration system
   - ✅ HTTP and Puppeteer support
   - ✅ Documentation and guides

### ⏳ In Progress

- **Web Scraping Implementation**: Framework ready, needs website analysis
- **Data Collection**: NYC complete, other cities pending

## Files Overview

### Data Collection Scripts

- **`fetch-nyc-inspections.js`** ✅ Working
  - Fetches NYC DOHMH data via Socrata API
  - Usage: `node fetch-nyc-inspections.js [restaurant-name]`

- **`fetch-sf-inspections.js`** ⚠️ API endpoint needs verification
  - Attempts to fetch San Francisco data
  - Status: Endpoint returned 404

- **`fetch-la-inspections.js`** ⚠️ Needs implementation
  - Template for Los Angeles County
  - Status: Requires website analysis

- **`fetch-texas-inspections.js`** ⚠️ Placeholder
  - Template for Texas cities
  - Status: Requires scraping implementation

### Web Scraping Scripts

- **`scrape-generic.js`** ✅ Framework ready
  - Flexible scraper for any city
  - Supports HTTP and Puppeteer
  - Usage: `node scrape-generic.js <city> [restaurant-name]`

- **`scrape-houston.js`** ⚠️ Template
  - Puppeteer-based scraper for Houston
  - Status: Needs website analysis

- **`scrape-houston-simple.js`** ⚠️ Template
  - HTTP-based scraper for Houston
  - Status: Needs website analysis

### Matching Scripts

- **`match-inspections-to-buffets.js`** ✅ Working
  - Matches inspections to buffets by state
  - Usage: `node match-inspections-to-buffets.js [state]`

- **`match-all-health-data.js`** ✅ Working
  - Comprehensive matching across all sources
  - Usage: `node match-all-health-data.js`

### Utility Scripts

- **`add-sample-health-data.js`** ✅ Working
  - Manually add health data to specific buffets
  - Usage: `node add-sample-health-data.js`

- **`sync-health-data-to-db.js`** ✅ Working
  - Syncs health data to InstantDB
  - Usage: `node sync-health-data-to-db.js`

## Quick Start

### 1. Collect Data

```bash
# NYC (already done)
node scripts/health-inspection/fetch-nyc-inspections.js

# Other cities (after website analysis)
node scripts/health-inspection/scrape-generic.js houston
```

### 2. Match Data

```bash
# Match all collected data
node scripts/health-inspection/match-all-health-data.js
```

### 3. Sync to Database

```bash
# Sync matched data to InstantDB
node scripts/health-inspection/sync-health-data-to-db.js
```

## Data Sources

### Available APIs

- ✅ **NYC DOHMH**: Socrata API - Working
- ⚠️ **San Francisco**: Socrata API - Endpoint needs verification
- ❌ **Most other cities**: No public APIs

### Requires Web Scraping

- **Texas**: Houston, Dallas, Austin (75 buffets total)
- **California**: Los Angeles, San Diego, etc. (28 buffets)
- **Arizona**: Phoenix area (28 buffets)
- **Florida**: Various cities (27 buffets)
- **Other states**: Varies by city/county

## Implementation Guide

### For New Cities

1. **Analyze Website**
   - Visit health department website
   - Test search functionality
   - Inspect HTML structure
   - Document selectors and data fields

2. **Update Configuration**
   - Edit `CITY_CONFIGS` in `scrape-generic.js`
   - Add city-specific selectors
   - Configure data mapping

3. **Test Scraper**
   - Test with 1-2 sample restaurants
   - Verify data extraction
   - Fix any issues

4. **Run Full Scrape**
   - Run for all buffets in city
   - Monitor for errors
   - Save results

5. **Match and Sync**
   - Run matching algorithm
   - Review matches
   - Sync to database

See `IMPLEMENTATION_PLAN.md` for detailed steps.

## Data Format

All health inspection data follows this standardized format:

```json
{
  "currentScore": 12,
  "currentGrade": "A",
  "inspectionDate": "2025-12-02T00:00:00.000",
  "violations": [
    {
      "code": "04H",
      "description": "Raw food contamination...",
      "category": "Critical",
      "severity": "High"
    }
  ],
  "criticalViolationsCount": 1,
  "generalViolationsCount": 0,
  "inspectionHistory": [...],
  "dataSource": "NYC DOHMH",
  "healthDepartmentUrl": "..."
}
```

## Documentation

- **`WEB_SCRAPING_GUIDE.md`**: Complete web scraping guide
- **`IMPLEMENTATION_PLAN.md`**: Step-by-step implementation plan
- **`SCRAPING_STATUS.md`**: Current status and roadmap
- **`README_DATA_SOURCES.md`**: Data source information
- **`DATA_COLLECTION_SUMMARY.md`**: Summary of collected data

## Statistics

- **Total Buffets**: 367
- **With Health Data**: 68 (18.5%)
- **NYC Data Collected**: 441 restaurants
- **Priority Cities**: Houston (28), Dallas (8), Austin (7)

## Next Steps

1. **Analyze Houston website** and implement scraper (highest priority)
2. **Implement Dallas and Austin** scrapers
3. **Expand to California cities**
4. **Continue with other states**

## Support

For issues or questions:
1. Check documentation files
2. Review implementation plan
3. Test with sample restaurants first
4. Verify website structure hasn't changed

## Notes

- Most health departments don't provide APIs
- Web scraping requires maintenance (websites change)
- Rate limiting is important
- Some sites may have Terms of Service restrictions
- Consider third-party services for broader coverage
