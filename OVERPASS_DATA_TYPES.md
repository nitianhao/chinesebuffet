# Overpass API - Complete Data Types Reference

This document provides a comprehensive list of all data types and information that can be retrieved from the Overpass API integration.

## 📍 Available Functions & Data Types

### 1. **Neighborhood Information** (`getNeighborhoodInfo`)
Retrieves administrative and geographic information for a location:

**Returns:**
- `neighborhood` - Neighborhood/district name (admin level 10)
- `city` - City name (admin level 8)
- `county` - County name (admin level 6)
- `state` - State/province name (admin level 4)
- `postcode` - Postal/ZIP code

**Example:**
```typescript
{
  neighborhood: "Mission District",
  city: "San Francisco",
  county: "San Francisco County",
  state: "California",
  postcode: "94110"
}
```

---

### 2. **Administrative Boundaries** (`getAdministrativeBoundaries`)
Gets all administrative boundaries (political divisions) for a location:

**Returns:**
- `id` - OSM element ID
- `type` - Element type (way/relation)
- `name` - Boundary name
- `adminLevel` - Administrative level (see levels below)
- `boundaryType` - Always "administrative"
- `lat/lon` - Coordinates
- `geometry` - Full boundary geometry (array of coordinates)
- `tags` - All OSM tags for the boundary

**Administrative Levels:**
- **Level 2**: Country
- **Level 4**: State/Province
- **Level 6**: County/Region
- **Level 8**: City/Town
- **Level 10**: Neighborhood/District
- **Level 12**: Sub-neighborhood

---

### 3. **Nearby Points of Interest (POIs)** (`findNearbyPOIs`)
Finds any points of interest within a radius:

**Returns (per POI):**
- `id` - OSM element ID
- `type` - Element type (node/way/relation)
- `name` - POI name
- `category` - Category (amenity/shop/tourism type)
- `distance` - Distance in meters
- `lat/lon` - Coordinates
- `tags` - All OSM tags (see tag categories below)

**Supported Categories:**
- Any amenity type (restaurant, cafe, park, etc.)
- Shop types
- Tourism types
- Leisure types

---

### 4. **Nearby Restaurants** (`findNearbyRestaurants`)
Finds restaurants, cafes, and food courts:

**Returns:** Same as NearbyPOIs, filtered for:
- `restaurant` - Full-service restaurants
- `fast_food` - Fast food establishments
- `cafe` - Cafes and coffee shops
- `food_court` - Food courts

**Additional Data Available in Tags:**
- `cuisine` - Type of cuisine (e.g., "chinese", "italian", "mexican")
- `diet:*` - Dietary options (vegetarian, vegan, halal, kosher)
- `opening_hours` - Business hours
- `phone` - Phone number
- `website` - Website URL
- `addr:*` - Address components
- `wheelchair` - Wheelchair accessibility
- `outdoor_seating` - Has outdoor seating
- `takeaway` - Offers takeaway
- `delivery` - Offers delivery

---

### 5. **Chinese Restaurants** (`findChineseRestaurants`)
Specifically finds Chinese restaurants:

**Returns:** Same as NearbyPOIs, filtered for:
- Restaurants with `cuisine=chinese` tag

**Additional Data Available:**
- All restaurant tags (see above)
- `cuisine` - Will be "chinese" or variations
- `name:zh` - Chinese name (if available)

---

### 6. **Location Details** (`getLocationDetails`)
Comprehensive location information:

**Returns:**
```typescript
{
  address: {
    houseNumber: "123",
    street: "Main Street",
    city: "San Francisco",
    state: "California",
    postcode: "94110",
    country: "US"
  },
  boundaries: AdministrativeBoundary[],
  nearbyPOIs: NearbyPOI[]
}
```

---

### 7. **Search Places by Name** (`searchPlacesByName`)
Searches for places matching a name pattern:

**Returns:** Same as NearbyPOIs
- Case-insensitive name matching
- Can find any OSM element with matching name

---

## 🏷️ OpenStreetMap Tag Categories

The Overpass API can retrieve data tagged with any OSM tag. Here are the main categories:

### **Amenities** (`amenity=*`)
- **Food & Drink:**
  - `restaurant`, `fast_food`, `cafe`, `bar`, `pub`, `biergarten`, `food_court`
  - `ice_cream`, `bakery`, `butcher`, `marketplace`
  
- **Transportation:**
  - `fuel`, `parking`, `parking_space`, `charging_station`
  - `bicycle_rental`, `car_rental`, `taxi`
  
- **Accommodation:**
  - `hotel`, `motel`, `hostel`, `guesthouse`, `apartment`
  
- **Education:**
  - `school`, `university`, `college`, `kindergarten`, `library`
  
- **Healthcare:**
  - `hospital`, `clinic`, `pharmacy`, `dentist`, `veterinary`
  
- **Entertainment:**
  - `cinema`, `theatre`, `nightclub`, `casino`, `arts_centre`
  
- **Public Services:**
  - `police`, `fire_station`, `post_office`, `courthouse`, `townhall`
  
- **Recreation:**
  - `park`, `playground`, `sports_centre`, `swimming_pool`, `gym`
  
- **Religious:**
  - `place_of_worship`, `church`, `mosque`, `temple`, `synagogue`
  
- **Other:**
  - `bank`, `atm`, `toilets`, `drinking_water`, `bench`, `waste_basket`

### **Shops** (`shop=*`)
- `supermarket`, `convenience`, `mall`, `department_store`
- `bakery`, `butcher`, `seafood`, `cheese`, `wine`
- `clothes`, `shoes`, `jewelry`, `electronics`, `mobile_phone`
- `bicycle`, `car`, `car_repair`, `hairdresser`, `beauty`
- `florist`, `gift`, `book`, `music`, `art`, `pet`

### **Tourism** (`tourism=*`)
- `attraction`, `museum`, `gallery`, `zoo`, `aquarium`
- `theme_park`, `viewpoint`, `information`, `hotel`
- `hostel`, `camp_site`, `caravan_site`, `picnic_site`

### **Leisure** (`leisure=*`)
- `park`, `playground`, `sports_centre`, `stadium`, `pitch`
- `swimming_pool`, `fitness_centre`, `golf_course`, `marina`
- `beach_resort`, `dance`, `hackerspace`, `escape_game`

### **Highway Types** (`highway=*`)
- `motorway`, `trunk`, `primary`, `secondary`, `tertiary`
- `residential`, `service`, `footway`, `cycleway`, `path`
- `bus_stop`, `traffic_signals`, `crossing`

### **Building Types** (`building=*`)
- `residential`, `commercial`, `retail`, `industrial`
- `school`, `hospital`, `hotel`, `warehouse`
- `house`, `apartments`, `office`, `restaurant`

### **Landuse** (`landuse=*`)
- `residential`, `commercial`, `industrial`, `retail`
- `farmland`, `forest`, `meadow`, `recreation_ground`
- `cemetery`, `military`, `port`

---

## 📊 Address Data (`addr:*` tags)

When querying address information, you can get:

- `addr:housenumber` - House/building number
- `addr:street` - Street name
- `addr:city` - City name
- `addr:state` - State/province
- `addr:postcode` - Postal code
- `addr:country` - Country code
- `addr:full` - Full formatted address
- `addr:housename` - Building name
- `addr:unit` - Apartment/unit number
- `addr:suburb` - Suburb/neighborhood
- `addr:district` - District name
- `addr:province` - Province name

---

## 🍽️ Restaurant-Specific Tags

For restaurants and food establishments:

### **Cuisine Types** (`cuisine=*`)
- `chinese`, `italian`, `mexican`, `japanese`, `thai`
- `indian`, `french`, `american`, `greek`, `korean`
- `vietnamese`, `mediterranean`, `seafood`, `pizza`
- `burger`, `sushi`, `bbq`, `steak_house`, `buffet`

### **Dietary Options** (`diet:*`)
- `diet:vegetarian` - Vegetarian options
- `diet:vegan` - Vegan options
- `diet:halal` - Halal certified
- `diet:kosher` - Kosher certified
- `diet:gluten_free` - Gluten-free options

### **Service Options**
- `takeaway` - Takeout available
- `delivery` - Delivery available
- `drive_through` - Drive-through available
- `outdoor_seating` - Outdoor seating
- `indoor_seating` - Indoor seating
- `reservation` - Reservations accepted

### **Payment & Accessibility**
- `payment:*` - Payment methods (cash, credit_card, etc.)
- `wheelchair` - Wheelchair accessible (yes/no/limited)
- `wheelchair:description` - Accessibility details

### **Hours & Contact**
- `opening_hours` - Business hours (e.g., "Mo-Fr 09:00-17:00")
- `phone` - Phone number
- `website` - Website URL
- `email` - Email address
- `contact:*` - Additional contact methods

---

## 🗺️ Geographic Data

### **Coordinates**
- Latitude/Longitude for any element
- Center point for ways and relations
- Full geometry (array of coordinates) for boundaries

### **Distance Calculations**
- Distance in meters from a reference point
- Sorted by proximity

### **Boundary Geometry**
- Complete polygon coordinates for administrative boundaries
- Can be used for map rendering or area calculations

---

## 🔍 Custom Query Capabilities

Using `queryOverpass()` directly, you can query for ANY OpenStreetMap data:

### **Query by Tags**
- Any combination of tags
- Regular expressions for tag values
- Case-insensitive matching

### **Spatial Queries**
- `around` - Find elements within radius
- `bbox` - Find elements in bounding box
- `is_in` - Find containing boundaries

### **Element Types**
- `node` - Points
- `way` - Lines and polygons
- `relation` - Complex structures

### **Output Formats**
- `out meta` - Include metadata (version, timestamp)
- `out center` - Include center coordinates
- `out geom` - Include full geometry
- `out tags` - Include all tags

---

## 📝 Complete Tag Reference

Every OSM element can have hundreds of tags. Common useful tags include:

**Identification:**
- `name`, `name:en`, `name:zh`, `name:es` - Names in various languages
- `alt_name`, `old_name` - Alternative names
- `ref` - Reference number/code

**Contact:**
- `phone`, `fax`, `email`, `website`
- `contact:phone`, `contact:email`, `contact:website`

**Social Media:**
- `contact:facebook`, `contact:twitter`, `contact:instagram`
- `contact:youtube`, `contact:linkedin`

**Business Info:**
- `operator` - Business operator name
- `brand` - Brand name
- `branch` - Branch identifier
- `level` - Floor level
- `capacity` - Capacity (for venues)

**Quality/Status:**
- `check_date` - Last verification date
- `source` - Data source
- `note` - General notes
- `fixme` - Needs fixing

---

## 🎯 Use Cases for Your Project

1. **Enrich Neighborhood Data** - Fill missing neighborhood fields
2. **Find Competitors** - Identify nearby Chinese restaurants
3. **Validate Addresses** - Verify and correct address data
4. **Get Administrative Info** - City, county, state boundaries
5. **Discover Nearby Amenities** - Parks, parking, public transport
6. **Cuisine Verification** - Verify restaurant cuisine types
7. **Accessibility Info** - Wheelchair access, parking availability
8. **Contact Information** - Phone, website, social media
9. **Business Hours** - Opening hours from OSM
10. **Postal Codes** - Get accurate ZIP/postal codes

---

## ⚙️ Configuration Options

All functions support:
- **Radius** - Search radius in meters (default varies by function)
- **Limit** - Maximum number of results (default varies)
- **Admin Levels** - Which administrative levels to retrieve
- **Categories** - Which POI categories to search
- **Custom Endpoint** - Use different Overpass API instance
- **Timeout** - Query timeout in seconds (default: 25)

---

## 📚 Additional Resources

- [Overpass API Documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Overpass QL Language Guide](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL)
- [OSM Tag Info](https://taginfo.openstreetmap.org/)
- [OSM Wiki - Map Features](https://wiki.openstreetmap.org/wiki/Map_Features)






