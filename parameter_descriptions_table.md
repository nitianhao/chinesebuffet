# Database Parameters with Actual Values - Descriptions for SEO & Data Enrichment

| Parameter Name | Description | Data Type | SEO/Enrichment Use Case |
|----------------|-------------|-----------|-------------------------|
| name | Restaurant business name | String | Primary title, H1 tag, schema.org name property |
| slug | URL-friendly identifier for restaurant pages | String | URL structure, internal linking, canonical URLs |
| placeId | Google Places unique identifier | String | Google Maps integration, place verification, API calls |
| street | Street address line | String | Local SEO, address schema, location accuracy |
| cityName | City where restaurant is located | String | Local SEO, city-based filtering, geographic targeting |
| state | Full state name | String | Local SEO, geographic targeting, location schema |
| stateAbbr | State abbreviation (e.g., CA, NY) | String | URL structure, compact display, geographic filters |
| postalCode | ZIP or postal code | String | Local SEO, precise location targeting, address validation |
| address | Complete formatted address string | String | Schema.org address, display, location verification |
| lat | Latitude coordinate | Number | Map display, distance calculations, geographic search |
| lng | Longitude coordinate | Number | Map display, distance calculations, geographic search |
| neighborhood | Neighborhood or district name | String | Hyperlocal SEO, neighborhood-based content, local targeting |
| plusCode | Google Plus Code for location | String | Alternative location identifier, precise location sharing |
| countryCode | ISO country code (e.g., US) | String | International SEO, country-based filtering, schema markup |
| phone | Formatted phone number | String | Contact schema, click-to-call, local business info |
| phoneUnformatted | Raw phone number without formatting | String | Data processing, international format, API integration |
| website | Restaurant website URL | String | External link, authority signal, business verification |
| permanentlyClosed | Boolean indicating permanent closure | Boolean | Content freshness, avoid showing closed businesses |
| temporarilyClosed | Boolean indicating temporary closure | Boolean | Status updates, temporary closure messaging |
| rating | Average customer rating (typically 1-5) | Number | Star ratings display, schema.org aggregateRating, trust signals |
| reviewsCount | Total number of customer reviews | Number | Social proof, review schema, credibility indicator |
| reviewsDistribution | Breakdown of star ratings (1-5 stars with counts) | JSON Object | Detailed rating visualization, review analysis, trust metrics |
| reviewsTags | Popular keywords/topics from reviews | JSON Array | Content ideas, keyword research, customer sentiment analysis |
| reviews | Full review objects with author, text, rating, date | JSON Array | Review display, user-generated content, rich snippets |
| price | Price range indicator (e.g., "$10–20") | String | Price schema, filtering, budget-based search |
| categoryName | Primary business category | String | Category schema, classification, taxonomy |
| categories | Array of all business categories | JSON Array | Multiple category tags, broader classification, filtering |
| primaryType | Primary business type identifier | String | Business type classification, schema.org type |
| placesTags | Google Places tags/categories | JSON Array | Additional categorization, tag-based filtering |
| hours | Operating hours by day of week | JSON Array | Hours schema, availability display, "open now" features |
| additionalOpeningHours | Special hours (happy hours, holiday hours) | JSON Object | Extended hours info, special event scheduling |
| openingHoursBusinessConfirmationText | Text confirming current business hours | String | Real-time status, hours verification message |
| popularTimesHistogram | Hourly popularity data showing busy times by day | JSON Object | "When is it busy?" feature, peak time recommendations |
| imagesCount | Total number of images available | Number | Image gallery size, visual content indicator |
| imageUrl | Primary/featured image URL | String | Featured image, Open Graph image, social sharing |
| imageUrls | Array of all image URLs | JSON Array | Image gallery, visual content, rich media |
| images | Full image objects with metadata | JSON Array | Image optimization, alt text, image schema |
| imageCategories | Categories of images (Menu, Food, Interior, etc.) | JSON Array | Organized image galleries, content categorization |
| description | Full text description of the restaurant | String | Meta description, page content, rich snippets |
| menu | Menu URL or menu data object | String/Object | Menu display, food schema, menu integration |
| restaurantData | Restaurant-specific metadata object | JSON Object | Extended restaurant information, custom data |
| additionalInfo | Comprehensive service options and amenities | JSON Object | Service options (delivery, takeout, dine-in), amenities, accessibility, payment methods, atmosphere details |
| orderBy | Online ordering platform options | JSON Array | Ordering integration, delivery options, conversion paths |
| questionsAndAnswers | Customer questions and business answers | JSON Array | FAQ section, Q&A schema, content enrichment |
| ownerUpdates | Updates and announcements from business owner | JSON Array | Fresh content, business updates, news section |
| updatesFromCustomers | Updates posted by customers | JSON Array | Community content, user contributions, social proof |
| url | Google Maps URL for the location | String | Map integration, directions, external link |
| searchPageUrl | Google search results page URL | String | Source tracking, search context |
| searchString | Search query used to find this business | String | Search intent analysis, keyword research |
| webResults | Related web search results and links | JSON Array | External links, related content, authority signals |
| peopleAlsoSearch | Related restaurants people also search for | JSON Array | Related businesses, recommendations, internal linking opportunities |
| fid | Google Feature ID | String | Technical identifier, API integration |
| cid | Google Customer ID | String | Technical identifier, tracking |
| kgmid | Google Knowledge Graph ID | String | Knowledge Graph integration, entity recognition |
| scrapedAt | Timestamp when data was collected | String | Data freshness, update tracking |
| language | Language code (e.g., "en") | String | Internationalization, language targeting |
| rank | Ranking or position in search results | Number | Performance tracking, search visibility |
| isAdvertisement | Boolean indicating if result is an ad | Boolean | Ad vs organic distinction, transparency |
| claimThisBusiness | Boolean indicating if business can be claimed | Boolean | Business verification status, ownership info |

