// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    "$files": i.entity({
      "path": i.string().unique().indexed(),
      "url": i.string().optional(),
    }),
    "$users": i.entity({
      "email": i.string().unique().indexed().optional(),
      "imageURL": i.string().optional(),
      "type": i.string().optional(),
    }),
    cities: i.entity({
      rank: i.number(),
      city: i.string().indexed(),
      state: i.string().indexed(),
      stateAbbr: i.string().indexed(),
      population: i.number(),
      slug: i.string().unique().indexed(),
      searchName: i.string().indexed().optional(), // Normalized "city stateabbr" for search
      // SEO enrichment fields
      timezone: i.string().optional(),
      elevation: i.number().optional(),
      county: i.string().optional(),
      postalCode: i.string().optional(),
      countryCode: i.string().optional(),
      nearbyCities: i.string().optional(), // JSON stringified array
      seoKeywords: i.string().optional(), // JSON stringified array
      // Phase 1 SEO enrichment fields
      msaName: i.string().optional(), // Metropolitan Statistical Area name
      msaCode: i.string().optional(), // MSA FIPS code
      csaName: i.string().optional(), // Combined Statistical Area name
      zipCodes: i.string().optional(), // JSON stringified array of ZIP codes
      primaryZipCode: i.string().optional(), // Most common ZIP code in city
      totalRestaurants: i.number().optional(), // Total restaurants in city (from OSM)
      chineseRestaurants: i.number().optional(), // Chinese restaurants count (from OSM)
      restaurantDensity: i.number().optional(), // Restaurants per 10,000 population
      restaurantDistricts: i.string().optional(), // JSON array of restaurant district names
      // Phase 2 SEO enrichment fields
      wikipediaSummary: i.string().optional(), // First paragraph from Wikipedia
      wikipediaUrl: i.string().optional(), // URL to Wikipedia page
      notableFacts: i.string().optional(), // JSON array of notable facts about the city
      topAttractions: i.string().optional(), // JSON array: [{name, category, distance}]
      shoppingCenters: i.string().optional(), // JSON array of shopping center names
      universities: i.string().optional(), // JSON array of university/college names
      majorHotels: i.string().optional(), // JSON array of major hotel names
    }),
    buffets: i.entity({
      name: i.string().indexed(),
      searchName: i.string().indexed().optional(),
      slug: i.string().indexed(),
      street: i.string(),
      cityName: i.string().indexed(), // City name as string (for filtering)
      state: i.string().indexed(),
      stateAbbr: i.string(),
      postalCode: i.string(),
      address: i.string(), // Full address
      phone: i.string().optional(),
      phoneUnformatted: i.string().optional(),
      website: i.string().optional(),
      price: i.string().optional(),
      rating: i.number().indexed().optional(), // OPTIMIZATION: Index rating for sorting queries
      reviewsCount: i.number().optional(),
      lat: i.number(),
      lng: i.number(),
      neighborhood: i.string().optional(), // Primary neighborhood (backward compatible)
      neighborhoodContext: i.string().optional(), // JSON stringified enriched location context (neighborhoods, districts, county, metro_area)
      permanentlyClosed: i.boolean(),
      temporarilyClosed: i.boolean(),
      placeId: i.string().indexed().optional(), // OPTIMIZATION: Index placeId for menu/review lookups
      imagesCount: i.number().optional(),
      categoryName: i.string().optional(),
      primaryType: i.string().optional(),
      // Hours stored as JSON string (Instant DB doesn't have native array of objects)
      hours: i.string().optional(), // JSON stringified array
      categories: i.string().optional(), // JSON stringified array
      // Additional fields from Google Places JSON
      description: i.string().optional(),
      description2: i.string().optional(), // SEO-generated description v2
      countryCode: i.string().optional(),
      imageCategories: i.string().optional(), // JSON stringified array
      scrapedAt: i.string().optional(),
      peopleAlsoSearch: i.string().optional(), // JSON stringified array
      reviewsTags: i.string().optional(), // JSON stringified array
      url: i.string().optional(),
      plusCode: i.string().optional(),
      menu: i.string().optional(), // JSON stringified object
      reviewsDistribution: i.string().optional(), // JSON stringified object
      popularTimesHistogram: i.string().optional(), // JSON stringified array
      questionsAndAnswers: i.string().optional(), // JSON stringified array
      webResults: i.string().optional(), // JSON stringified array
      orderBy: i.string().optional(),
      images: i.string().optional(), // JSON stringified array
      reviews: i.string().optional(), // JSON stringified array
      iconInfo: i.string().optional(), // JSON stringified object
      addressFormats: i.string().optional(), // JSON stringified object
      adrFormatAddress: i.string().optional(), // HTML formatted address string
      secondaryOpeningHours: i.string().optional(), // JSON stringified object
      googleMapsLinks: i.string().optional(), // JSON stringified object
      priceRange: i.string().optional(), // JSON stringified object
      what_customers_are_saying_seo: i.string().optional(),
      // Yelp data
      yelpData: i.string().optional(), // JSON stringified object
      // Review summaries from Apify
      reviewSummaryParagraph1: i.string().optional(),
      reviewSummaryParagraph2: i.string().optional(),
      // Overpass API POI data (JSON string - will be migrated to overpassPOIs table)
      overpassPOIs: i.string().optional(), // JSON stringified object with nearby POIs
      // Nearby POI categories (JSON stringified arrays)
      accommodationLodging: i.string().optional(),
      agriculturalFarming: i.string().optional(),
      artsCulture: i.string().optional(),
      communicationsTechnology: i.string().optional(),
      educationLearning: i.string().optional(),
      financialServices: i.string().optional(),
      foodDining: i.string().optional(),
      governmentPublicServices: i.string().optional(),
      healthcareMedicalServices: i.string().optional(),
      homeImprovementGarden: i.string().optional(),
      industrialManufacturing: i.string().optional(),
      miscellaneousServices: i.string().optional(),
      personalCareBeauty: i.string().optional(),
      petCareVeterinary: i.string().optional(),
      professionalBusinessServices: i.string().optional(),
      recreationEntertainment: i.string().optional(),
      sportsFitness: i.string().optional(),
      travelTourismServices: i.string().optional(),
      repairMaintenance: i.string().optional(),
      religiousSpiritual: i.string().optional(),
      socialCommunityServices: i.string().optional(),
      utilitiesInfrastructure: i.string().optional(),
      retailShopping: i.string().optional(),
      transportationAutomotive: i.string().optional(),
    }),
    reviews: i.entity({
      reviewerId: i.string().optional(),
      reviewerUrl: i.string().optional(),
      name: i.string(),
      reviewerNumberOfReviews: i.number().optional(),
      isLocalGuide: i.boolean().optional(),
      reviewerPhotoUrl: i.string().optional(),
      text: i.string(),
      textTranslated: i.string().optional(),
      publishAt: i.string().indexed(),
      publishedAtDate: i.string().optional().indexed(),
      likesCount: i.number().optional(),
      reviewId: i.string().optional(),
      reviewUrl: i.string().optional(),
      reviewOrigin: i.string().optional(),
      stars: i.number().indexed(),
      rating: i.number().optional(),
      responseFromOwnerDate: i.string().optional(),
      responseFromOwnerText: i.string().optional(),
      reviewImageUrls: i.string().optional(), // JSON stringified array
      reviewContext: i.string().optional(), // JSON stringified object
      reviewDetailedRating: i.string().optional(), // JSON stringified object
      visitedIn: i.string().optional(),
      originalLanguage: i.string().optional(),
      translatedLanguage: i.string().optional(),
      // Legacy fields for backward compatibility
      author: i.string().optional(),
      time: i.string().optional(),
      relativeTime: i.string().optional(),
    }),
    menus: i.entity({
      placeId: i.string().indexed(), // Link to buffet via placeId
      sourceUrl: i.string(), // Original menu URL
      contentType: i.string(), // HTML, PDF, or IMAGE
      rawText: i.string().optional(), // Extracted raw text
      structuredData: i.string(), // JSON stringified structured menu
      categories: i.string().optional(), // JSON stringified array of menu categories
      items: i.string().optional(), // JSON stringified array of menu items
      scrapedAt: i.string(), // Timestamp
      status: i.string(), // SUCCESS, FAILED, PENDING
      errorMessage: i.string().optional(), // Error details if failed
    }),
    menuItems: i.entity({
      categoryName: i.string().indexed(), // Menu category (e.g., "Appetizers", "Main Courses")
      name: i.string().indexed(), // Item name
      description: i.string().optional(), // Item description
      price: i.string().optional(), // Price as string (e.g., "$15.95")
      priceNumber: i.number().optional(), // Price as number for sorting/filtering
      itemOrder: i.number().optional(), // Order within category for sorting
    }),
    poiRecords: i.entity({
      osmId: i.number().indexed(), // OSM element ID
      type: i.string().indexed(), // Element type: 'node', 'way', or 'relation'
      name: i.string().optional().indexed(), // POI name
      category: i.string().optional().indexed(), // Category (amenity/shop/tourism type)
      group: i.string().optional().indexed(), // High-level category group (e.g., 'Food & Dining', 'Retail & Shopping')
      distance: i.number().indexed(), // Distance in meters from the buffet
      distanceFt: i.number().optional().indexed(), // Distance in feet from the buffet
      lat: i.number().indexed(), // Latitude
      lon: i.number().indexed(), // Longitude
      tags: i.string().optional(), // JSON stringified object with all OSM tags
      order: i.number().optional(), // Order/rank of this POI (for sorting by distance)
    }),
    structuredData: i.entity({
      // Basic fields - you can add more specific fields after syncing
      data: i.string(), // JSON stringified structured data
      type: i.string().optional().indexed(), // Type/category of structured data
      group: i.string().optional().indexed(), // Group/category for organizing structured data
      createdAt: i.string().optional(), // Timestamp when created
      updatedAt: i.string().optional(), // Timestamp when last updated
    }),
    directoryRollups: i.entity({
      // Precomputed aggregations for hub pages (states, cities, neighborhoods)
      type: i.string().indexed(), // "states" | "cities" | "cityNeighborhoods"
      key: i.string().optional().indexed(), // null for global, cityStateSlug for cityNeighborhoods
      data: i.string(), // JSON stringified array of rollup rows
      updatedAt: i.string().indexed(), // ISO timestamp of last rebuild
      buffetCount: i.number().optional(), // Total buffets in this rollup (for quick sanity check)
    }),
  },
  links: {
    "$usersLinkedPrimaryUser": {
      "forward": {
        "on": "$users",
        "has": "one",
        "label": "linkedPrimaryUser",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "$users",
        "has": "many",
        "label": "linkedGuestUsers"
      }
    },
    "buffetsCity": {
      "forward": {
        "on": "buffets",
        "has": "one",
        "label": "city",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "cities",
        "has": "many",
        "label": "buffets"
      }
    },
    "buffetReviews": {
      "forward": {
        "on": "reviews",
        "has": "one",
        "label": "buffet",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "buffets",
        "has": "many",
        "label": "reviewRecords"
      }
    },
    "menuMenuItems": {
      "forward": {
        "on": "menuItems",
        "has": "one",
        "label": "menu",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "menus",
        "has": "many",
        "label": "menuItems"
      }
    },
    "buffetPOIRecords": {
      "forward": {
        "on": "poiRecords",
        "has": "one",
        "label": "buffet",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "buffets",
        "has": "many",
        "label": "poiRecords"
      }
    },
    "buffetStructuredData": {
      "forward": {
        "on": "structuredData",
        "has": "one",
        "label": "buffet",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "buffets",
        "has": "many",
        "label": "structuredData"
      }
    }
  },
  rooms: {}
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
