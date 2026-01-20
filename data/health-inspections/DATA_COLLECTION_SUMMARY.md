# Health Inspection Data Collection Summary

## Overview

This document summarizes the health inspection data collection and matching process for Chinese buffet restaurants.

## Data Collection

### Sources Collected

1. **NYC DOHMH (New York City Department of Health and Mental Hygiene)**
   - **API Endpoint**: `https://data.cityofnewyork.us/resource/43nn-pn8j.json`
   - **Type**: Socrata Open Data API
   - **Records Collected**: 441 unique restaurants
   - **Coverage**: New York City (5 boroughs) only
   - **Grading System**: A/B/C letter grades (0-13 = A, 14-27 = B, 28+ = C)
   - **Data File**: `data/health-inspections/nyc-inspections.json`

### Data Structure

Each health inspection record includes:
- **Current Inspection**: Grade, score, date, inspector
- **Violations**: Codes, descriptions, critical vs general classification
- **Inspection History**: Up to 10 most recent inspections
- **Closure History**: Any closures in the last 2 years
- **Metadata**: Data source, permit number, health department URL

## Matching Process

### Algorithm

The matching algorithm uses fuzzy matching with weighted scores:
- **Name Similarity** (50% weight): Levenshtein distance, keyword extraction
- **Address Similarity** (40% weight): Normalized address comparison
- **Phone Matching** (10% weight): Last 10 digits comparison

### Matching Results

- **Total Health Inspection Records**: 882 (441 NYC + 441 NY duplicate)
- **Total Buffets in Database**: 367
- **Initial Matches Found**: 372 (with 0.5 threshold)
- **Filtered Matches**: 0 (after state filtering - NYC data only matches NYC restaurants)

### Why No Matches?

The NYC health inspection data only covers restaurants in New York City (5 boroughs). However, the NY buffets in our database are located in:
- Syracuse, NY (3 buffets)
- Rochester, NY (3 buffets)  
- Buffalo, NY (2 buffets)

These cities are not covered by NYC DOHMH data, so no matches were found.

## Current Status

### Buffets with Health Data

**Total**: 68 buffets have health inspection data

**Sources**:
- NYC DOHMH: 68 buffets (manually added sample data for testing)

**Note**: The 68 buffets with health data were manually added for demonstration purposes. They use sample NYC inspection data, but most are not actually NYC restaurants.

## Files Generated

1. **`data/health-inspections/nyc-inspections.json`**
   - 441 unique NYC restaurants with health inspection data
   - Complete inspection history and violations

2. **`data/health-inspections/ny-inspections.json`**
   - Duplicate of NYC data (441 restaurants)

3. **`data/health-inspections/matching-report.json`**
   - Summary of matching results
   - Confidence levels and state distribution

4. **`data/health-inspections/all-matches.json`**
   - Detailed match results with scores

5. **`data/buffets-by-id.json`**
   - Updated with health inspection data for 68 buffets

## Next Steps

### To Get Real Matches:

1. **Collect Data for Other States/Cities**:
   - Syracuse, NY health department data
   - Rochester, NY health department data
   - Buffalo, NY health department data
   - Other high-priority states (TX, CA, AZ, FL, etc.)

2. **Data Sources to Explore**:
   - County health department websites (most require scraping)
   - State health department APIs (limited availability)
   - Third-party aggregators (may require subscription)

3. **Improve Matching**:
   - Add state/city filtering to matching algorithm
   - Increase confidence threshold for automatic matching
   - Manual review of medium-confidence matches

### Priority States for Data Collection:

Based on buffet distribution:
1. **Texas** (75 buffets) - Highest priority
2. **California** (28 buffets)
3. **Arizona** (28 buffets)
4. **Florida** (27 buffets)
5. **North Carolina** (20 buffets)

## Scripts Available

1. **`fetch-nyc-inspections.js`**: Fetches NYC DOHMH data
2. **`match-inspections-to-buffets.js`**: Matches inspections to buffets by state
3. **`match-all-health-data.js`**: Comprehensive matching across all sources
4. **`add-sample-health-data.js`**: Manually add health data to specific buffets
5. **`sync-health-data-to-db.js`**: Sync health data to InstantDB

## Data Quality

### Sample Data Quality (NYC):

- ✅ Current grades available (A/B/C)
- ✅ Inspection scores (numeric)
- ✅ Violation details (codes, descriptions)
- ✅ Inspection history (up to 10 records)
- ✅ Recent inspection dates (2024-2025)
- ⚠️ Limited geographic coverage (NYC only)

## Notes

- Most health inspection data is managed at the county/city level, not state level
- APIs are rare - most require web scraping
- Data formats vary significantly between jurisdictions
- Some jurisdictions use letter grades (A/B/C), others use numeric scores
- Update frequencies vary (daily to quarterly)
















