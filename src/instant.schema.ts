// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    cities: i.entity({
      rank: i.number(),
      city: i.string().indexed(),
      state: i.string().indexed(),
      stateAbbr: i.string().indexed(),
      population: i.number(),
      slug: i.string().unique().indexed(),
    }),
    buffets: i.entity({
      name: i.string().indexed(),
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
      rating: i.number().optional(),
      reviewsCount: i.number().optional(),
      lat: i.number(),
      lng: i.number(),
      neighborhood: i.string().optional(),
      permanentlyClosed: i.boolean(),
      temporarilyClosed: i.boolean(),
      placeId: i.string().optional(),
      imagesCount: i.number().optional(),
      categoryName: i.string().optional(),
      primaryType: i.string().optional(),
      // Hours stored as JSON string (Instant DB doesn't have native array of objects)
      hours: i.string().optional(), // JSON stringified array
      categories: i.string().optional(), // JSON stringified array
      // Additional fields from Google Places JSON
      description: i.string().optional(),
      countryCode: i.string().optional(),
      fid: i.string().optional(),
      cid: i.string().optional(),
      imageCategories: i.string().optional(), // JSON stringified array
      scrapedAt: i.string().optional(),
      googleFoodUrl: i.string().optional(),
      hotelAds: i.string().optional(), // JSON stringified array
      additionalOpeningHours: i.string().optional(), // JSON stringified object
      peopleAlsoSearch: i.string().optional(), // JSON stringified array
      placesTags: i.string().optional(), // JSON stringified array
      reviewsTags: i.string().optional(), // JSON stringified array
      additionalInfo: i.string().optional(), // JSON stringified object
      gasPrices: i.string().optional(), // JSON stringified object
      url: i.string().optional(),
      searchPageUrl: i.string().optional(),
      searchString: i.string().optional(),
      language: i.string().optional(),
      rank: i.number().optional(),
      isAdvertisement: i.boolean().optional(),
      imageUrl: i.string().optional(),
      kgmid: i.string().optional(),
      subTitle: i.string().optional(),
      locatedIn: i.string().optional(),
      plusCode: i.string().optional(),
      menu: i.string().optional(), // JSON stringified object
      reviewsDistribution: i.string().optional(), // JSON stringified object
      reserveTableUrl: i.string().optional(),
      hotelStars: i.number().optional(),
      hotelDescription: i.string().optional(),
      checkInDate: i.string().optional(),
      checkOutDate: i.string().optional(),
      similarHotelsNearby: i.string().optional(), // JSON stringified array
      hotelReviewSummary: i.string().optional(), // JSON stringified object
      popularTimesLiveText: i.string().optional(),
      popularTimesLivePercent: i.number().optional(),
      popularTimesHistogram: i.string().optional(), // JSON stringified array
      openingHoursBusinessConfirmationText: i.string().optional(),
      questionsAndAnswers: i.string().optional(), // JSON stringified array
      updatesFromCustomers: i.string().optional(), // JSON stringified array
      inputPlaceId: i.string().optional(),
      userPlaceNote: i.string().optional(),
      webResults: i.string().optional(), // JSON stringified array
      tableReservationLinks: i.string().optional(), // JSON stringified array
      bookingLinks: i.string().optional(), // JSON stringified array
      orderBy: i.string().optional(),
      restaurantData: i.string().optional(), // JSON stringified object
      ownerUpdates: i.string().optional(), // JSON stringified array
      imageUrls: i.string().optional(), // JSON stringified array
      images: i.string().optional(), // JSON stringified array
      reviews: i.string().optional(), // JSON stringified array
      leadsEnrichment: i.string().optional(), // JSON stringified object
      claimThisBusiness: i.boolean().optional(),
      what_customers_are_saying_seo: i.string().optional(),
    }),
  },
  links: {
    cityBuffets: {
      forward: {
        on: "buffets",
        has: "one",
        label: "city",
        onDelete: "cascade",
      },
      reverse: {
        on: "cities",
        has: "many",
        label: "buffets",
      },
    },
  },
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
