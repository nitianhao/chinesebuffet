# City Dataset Enrichment for SEO Optimization

## Overview
This document outlines free and open-source APIs/data sources to enrich your cities dataset for better SEO performance.

## Current Enrichment Script
The `enrich-cities-seo.js` script adds the following data:

### 1. **Geographic Data** ✅
- **Timezone** - From TimeAPI.io (free, no key required)
- **Elevation** - From Open-Elevation API (free, no key required)
- **County** - From Nominatim/OpenStreetMap (free, no key required)
- **Postal Code** - From Nominatim reverse geocoding
- **Country Code** - From Nominatim

### 2. **Nearby Cities** ✅
- Calculates cities within 50 miles
- Includes distance and population
- Helps with internal linking and "nearby" content

### 3. **SEO Keywords** ✅
- Auto-generated keywords like:
  - "{City} {State}"
  - "things to do in {City}"
  - "{City} restaurants"
  - "{City} near {NearbyCity}"

## Additional Enrichment Options (Not Yet Implemented)

### 4. **Demographics** (Free APIs)
- **Data Commons API** (Google) - Free, no key required
  - Population density
  - Age demographics
  - Income levels
  - Education levels
  - URL: `https://api.datacommons.org/`

- **US Census Bureau API** - Free, optional API key
  - Detailed demographic data
  - Economic indicators
  - URL: `https://api.census.gov/data/`

### 5. **Points of Interest & Landmarks** (Free APIs)
- **OpenStreetMap Overpass API** - Free, no key required
  - Tourist attractions
  - Parks and recreation
  - Museums
  - Sports venues
  - URL: `https://overpass-api.de/api/interpreter`

- **Wikipedia API** - Free, no key required
  - City descriptions
  - Notable landmarks
  - Historical information
  - URL: `https://en.wikipedia.org/api/rest_v1/`

### 6. **Weather & Climate** (Free APIs)
- **Open-Meteo API** - Free, no key required
  - Average temperatures
  - Precipitation data
  - Climate classification
  - URL: `https://api.open-meteo.com/v1/`

- **WeatherAPI** - Free tier available
  - Current weather
  - Historical data
  - URL: `https://www.weatherapi.com/`

### 7. **Economic Data** (Free APIs)
- **Data Commons** - Free
  - GDP per capita
  - Employment rates
  - Major industries
  - URL: `https://api.datacommons.org/`

- **Bureau of Labor Statistics API** - Free
  - Employment statistics
  - Wage data
  - URL: `https://api.bls.gov/publicAPI/v2/`

### 8. **Transportation** (Free APIs)
- **OpenStreetMap Overpass API** - Free
  - Major highways
  - Public transit stations
  - Airports
  - Train stations

### 9. **ZIP Codes & Area Codes** (Free Data)
- **USPS ZIP Code Database** - Free
  - All ZIP codes for a city
  - Area codes from phone number data

### 10. **Metropolitan Statistical Area (MSA)** (Free Data)
- **Census Bureau** - Free
  - MSA designation
  - Metropolitan area name
  - Combined statistical area

### 11. **Search Volume Data** (Free Tools)
- **Google Trends API** (unofficial) - Free
  - Search trends for city-related keywords
  - Seasonal patterns
  - Related searches

### 12. **Social Media & Reviews** (Free APIs)
- **Foursquare Places API** - Free tier
  - Popular venues
  - Check-in data
  - Tips and reviews

### 13. **Local Business Categories** (Free APIs)
- **OpenStreetMap Overpass API** - Free
  - Restaurant density
  - Shopping centers
  - Entertainment venues
  - Healthcare facilities

### 14. **Education** (Free APIs)
- **Data Commons** - Free
  - Number of schools
  - Universities
  - Education levels

### 15. **Crime & Safety** (Free Data)
- **FBI UCR Data** - Free
  - Crime statistics
  - Safety ratings
  - Available via Data.gov

## Implementation Priority

### High Priority (SEO Impact)
1. ✅ **Timezone** - For local business hours
2. ✅ **County** - For local SEO
3. ✅ **Nearby Cities** - For internal linking
4. ✅ **SEO Keywords** - For content optimization
5. **Points of Interest** - For rich content
6. **ZIP Codes** - For local targeting
7. **MSA** - For regional SEO

### Medium Priority
8. **Demographics** - For audience targeting
9. **Weather/Climate** - For seasonal content
10. **Transportation** - For accessibility info

### Low Priority
11. **Economic Data** - For business context
12. **Crime Statistics** - For safety info
13. **Education** - For family-oriented content

## Free API Rate Limits

- **Nominatim (OpenStreetMap)**: 1 request/second (free tier)
- **TimeAPI.io**: Unlimited (free tier)
- **Open-Elevation**: Unlimited (free tier)
- **Data Commons**: Generous free tier
- **Wikipedia API**: Unlimited (with rate limiting)

## Next Steps

1. Run the current enrichment script: `node scripts/enrich-cities-seo.js`
2. Add Points of Interest enrichment (Overpass API)
3. Add ZIP codes from CSV data
4. Add MSA information from Census data
5. Add demographic data from Data Commons

## Example Usage

```bash
# Run basic SEO enrichment
node scripts/enrich-cities-seo.js

# Future: Run POI enrichment
node scripts/enrich-cities-poi.js

# Future: Run demographic enrichment
node scripts/enrich-cities-demographics.js
```
