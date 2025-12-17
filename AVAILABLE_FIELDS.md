# Available Fields for Buffet Detail Page Enrichment

Based on the Google Places JSON data structure, here are all available fields that can be used to enrich the buffet detail page:

## 📝 **Description & Content**
- **`description`** (string) - Full description of the restaurant
- **`subTitle`** (string) - Subtitle/tagline
- **`categoryName`** (string) - Primary category (e.g., "Chinese restaurant")
- **`categories`** (array) - Array of category strings

## 💰 **Pricing & Reservations**
- **`price`** (string) - Price range (e.g., "$10–20") ✅ *Already used*
- **`reserveTableUrl`** (string) - URL for table reservations
- **`tableReservationLinks`** (array) - Array of reservation link objects
- **`bookingLinks`** (array) - Array of booking link objects

## 📊 **Reviews & Ratings**
- **`reviewsDistribution`** (object) - Star rating breakdown:
  - `oneStar`, `twoStar`, `threeStar`, `fourStar`, `fiveStar` counts
- **`reviewsTags`** (array) - Popular review tags (e.g., "spicy", "kung pao")
- **`reviewsCount`** (number) ✅ *Already used*
- **`totalScore`** (number) ✅ *Already used as rating*

## ⏰ **Hours & Availability**
- **`openingHours`** (array) ✅ *Already used*
- **`additionalOpeningHours`** (object) - Additional hours info
- **`openingHoursBusinessConfirmationText`** (string) - Business hours confirmation
- **`popularTimesLiveText`** (string) - Current busy status (e.g., "Usually busy")
- **`popularTimesLivePercent`** (number) - Current busy percentage
- **`popularTimesHistogram`** (array) - Hourly popularity data for each day

## 🍽️ **Restaurant Data**
- **`restaurantData`** (object) - Restaurant-specific data:
  - `tableReservationProvider`
  - Other restaurant metadata
- **`menu`** (object) - Menu information
- **`additionalInfo`** (object) - Service options and additional details:
  - Service options (Delivery, Takeout, Dine-in)
  - Accessibility features
  - Offerings (Alcohol, Beer, etc.)
  - Dining options
  - Amenities
  - Atmosphere
  - Crowd
  - Planning
  - Payments

## ❓ **Q&A & Updates**
- **`questionsAndAnswers`** (array) - Customer questions and answers
- **`ownerUpdates`** (array) - Updates from the business owner
- **`updatesFromCustomers`** (array) - Updates posted by customers

## 🔗 **Links & URLs**
- **`url`** (string) - Google Maps URL
- **`googleFoodUrl`** (string) - Google Food ordering URL
- **`searchPageUrl`** (string) - Google search page URL
- **`webResults`** (array) - Web search results related to the restaurant

## 📍 **Location Enhancements**
- **`plusCode`** (string) - Google Plus Code (e.g., "XX39+6P Salem, Oregon")
- **`locatedIn`** (string) - Building/area where restaurant is located
- **`neighborhood`** (string) ✅ *Already used*

## 🔍 **Discovery & Recommendations**
- **`peopleAlsoSearch`** (array) - Related restaurants people also search for
- **`placesTags`** (array) - Place tags/categories

## 📸 **Images** (Already Implemented)
- **`imageUrls`** (array) ✅ *Already used*
- **`imageUrl`** (string) - Primary image URL
- **`imageCategories`** (array) - Categories of images (Menu, Food, Vibe, etc.)
- **`imagesCount`** (number) ✅ *Already used*

## 🏢 **Business Information**
- **`placeId`** (string) ✅ *Already used*
- **`kgmid`** (string) - Google Knowledge Graph ID
- **`fid`** (string) - Feature ID
- **`cid`** (string) - Customer ID
- **`countryCode`** (string) - Country code (e.g., "US")
- **`plusCode`** (string) - Plus code for location

## 📱 **Ordering & Services**
- **`orderBy`** (array) - Online ordering options
- **`googleFoodUrl`** (string) - Google Food delivery URL

## 🎯 **Recommended Fields to Add Next**

### High Priority (Most Useful):
1. **`description`** - Rich text description
2. **`reviewsDistribution`** - Visual star rating breakdown
3. **`popularTimesHistogram`** - "When is it busy?" chart
4. **`additionalInfo`** - Service options (delivery, takeout, dine-in)
5. **`questionsAndAnswers`** - FAQ section
6. **`peopleAlsoSearch`** - "People also search for" recommendations

### Medium Priority:
7. **`reviewsTags`** - Popular keywords from reviews
8. **`menu`** - Menu information
9. **`reserveTableUrl`** / **`tableReservationLinks`** - Reservation options
10. **`ownerUpdates`** - Business updates/announcements
11. **`popularTimesLiveText`** / **`popularTimesLivePercent`** - Current busy status

### Lower Priority:
12. **`webResults`** - Related web links
13. **`plusCode`** - Alternative location code
14. **`subTitle`** - Additional tagline
15. **`locatedIn`** - Building information
