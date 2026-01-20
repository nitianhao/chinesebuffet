# Buffet Detail Page - Parameters Displayed

## Always Displayed (Required)

1. **Header/Navigation**
   - `buffet.name` - Main title (H1)
   - `city.city` - City name in breadcrumbs
   - `city.state` - State name in breadcrumbs
   - `buffet.address.city` - Used in metadata description
   - `buffet.address.state` - Used in metadata description

2. **Location Section** (Always shown)
   - `buffet.location.lat` - Map center and markers
   - `buffet.location.lng` - Map center and markers
   - `buffet.address` - Full address (via `formatAddress()`)
   - `buffet.id` - For map markers
   - `buffet.rating` - For map markers
   - `buffet.slug` - For map markers

## Conditionally Displayed (Only if data exists)

### Hero Section Badges
3. `buffet.rating` - Star rating badge (if > 0)
4. `buffet.reviewsCount` - Review count in parentheses (if > 0)
5. `buffet.price` - Price badge (e.g., "$$")
6. `buffet.neighborhood` - Neighborhood badge
7. `buffet.categoryName` - Category badge

### Description Section
8. `buffet.subTitle` - Subtitle/quote (if exists)
9. Generated description via `generateExpandedDescription(buffet)` - Always shown

### Customer Insights
10. `buffet.what_customers_are_saying_seo` - "What Our Customers Say" section

### Images
11. `buffet.imageUrls[]` - Image gallery (if array has items)
   - Each image URL in the array

### Contact & Hours Section

#### Address Card (Always shown)
12. `buffet.address` - Full formatted address
13. `buffet.locatedIn` - "Located in" text (if exists)
14. `buffet.plusCode` - Google Plus Code (if exists)

#### Contact Fields (Conditional)
15. `buffet.phone` - Phone number (if exists)
16. `buffet.phoneUnformatted` - Used for tel: link
17. `buffet.email` - Email address (if exists)
18. `buffet.website` - Website URL (if exists)

#### Reservations (Conditional)
19. `buffet.reserveTableUrl` - Primary reservation URL (if exists)
20. `buffet.tableReservationLinks[]` - Array of reservation links
   - `link.name` - Link label
   - `link.url` - Link URL

#### Order Online (Conditional)
21. `buffet.orderBy[]` - Array of ordering platforms
   - `order.name` - Platform name
   - `order.orderUrl` - Order URL
22. `buffet.googleFoodUrl` - Google Food ordering link (if exists)

#### Related Links (Conditional)
23. `buffet.webResults[]` - External links array
   - `result.title` - Link title
   - `result.url` - Link URL

#### Hours (Conditional)
24. `buffet.hours[]` - Operating hours array
   - `hour.day` - Day of week
   - `hour.hours` - Hours string

### Popular Times
25. `buffet.popularTimesHistogram` - Busy times data (if exists)
26. `buffet.popularTimesLiveText` - Current busy status text
27. `buffet.popularTimesLivePercent` - Current busy percentage

### Service Options
28. `buffet.additionalInfo` - Service options/amenities data

### Owner Updates
29. `buffet.ownerUpdates[]` - Business updates array (if exists)

### Questions & Answers
30. `buffet.questionsAndAnswers[]` - Q&A array (if exists and is array)

### Menu
31. `buffet.menu` - Menu data (if exists)

### Reviews Section

#### Rating Distribution
32. `buffet.reviewsDistribution` - Rating breakdown (if exists)
33. `buffet.reviewsCount` - Total reviews count (if > 0)

#### Detailed Ratings
34. `buffet.reviews[]` - Reviews array (if exists)
   - Used by `DetailedRatings` component

#### Reviews List
35. `buffet.reviews[]` - Reviews array (if exists)
   - Used by `Reviews` component

### Nearby Buffets
36. Nearby buffets (computed from `getNearbyBuffets()`)
   - Each nearby buffet shows: `name`, `address`, `phone`, `price`, `hours`, `rating`, `slug`, `citySlug`, and calculated `distance`

## Summary

**Total Parameters Referenced: 36+**

**Always Displayed:** 9 parameters
**Conditionally Displayed:** 27+ parameters (depending on data availability)

## Notes

- The page uses conditional rendering (`&&` checks) for most optional fields
- Some fields like `reviews` are used in multiple components (DetailedRatings, Reviews)
- The `generateExpandedDescription()` function likely uses multiple buffet fields internally
- Nearby buffets are dynamically calculated based on location
- Map markers include both the current buffet and nearby buffets


















