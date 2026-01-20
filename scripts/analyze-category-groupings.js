// Script to analyze categories and suggest high-level groupings
const fs = require('fs');
const path = require('path');

// Read categories
const categoriesFile = path.join(__dirname, '../poi-categories-list.txt');
const categories = fs.readFileSync(categoriesFile, 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

console.log(`Analyzing ${categories.length} categories...\n`);

// Define high-level category mappings
const categoryMappings = {
  // Food & Dining
  'Food & Dining': [
    /^restaurant/, /^fast_food/, /^cafe/, /^bar/, /^pub/, /^food_court/, /^ice_cream/, /^bakery/, /^deli/, /^butcher/,
    /^confectionery/, /^coffee/, /^tea/, /^alcohol/, /^biergarten/, /^wine/, /^catering/, /^food/, /^snack/,
    /^beverages/, /^donut/, /^pasta/, /^pastry/, /^seafood/, /^sushi/, /^chocolate/, /^cheese/, /^caviar/,
    /^specialty_food/, /^health_food/, /^frozen_food/, /^dry_food/, /^grocery/, /^convenience/, /^supermarket/,
    /^greengrocer/, /^ghost_kitchen/, /^food_sharing/, /^juice/, /^juice_bar/, /^canteen/, /^dessert/,
    /^ice/, /^nuts/, /^edible_seeds/, /^spices/, /^honey/, /^olive_oil/, /^dairy/, /^poultry/, /^meat/,
    /^restaurant;/, /^cafe;/, /^bakery;/, /^ice_cream;/,
  ],
  
  // Retail & Shopping
  'Retail & Shopping': [
    /^shop$/, /^store$/, /^retail/, /^convenience$/, /^supermarket$/, /^grocery$/, /^department_store/,
    /^variety_store/, /^clothes/, /^shoes/, /^jewelry/, /^books/, /^toys/, /^electronics/, /^computer/,
    /^mobile_phone/, /^hardware/, /^stationery/, /^cosmetics/, /^perfumery/, /^gift/, /^tobacco/,
    /^cannabis/, /^dispensary/, /^convenience_store/, /^second_hand/, /^antiques/, /^collector/,
    /^collectables/, /^vintage_clothing/, /^fashion/, /^fashion_accessories/, /^beauty_supplies/, /^beauty_supply/,
    /^pet$/, /^bicycle$/, /^sports$/, /^hobby/, /^music$/, /^video$/, /^games$/, /^video_games/,
    /^musical_instrument/, /^baby_goods/, /^home_goods_store/, /^kitchenware/, /^cookware/, /^bedding/,
    /^carpet/, /^curtain/, /^fabric/, /^wool/, /^leather/, /^frames?$/, /^art_supply/, /^art_suplies/,
    /^arts_supplies/, /^craft/, /^paint$/, /^lighting/, /^appliance/, /^furniture$/, /^houseware/,
    /^household/, /^household_linen/, /^window_blind/, /^tiles/, /^flooring/, /^floor_covering/,
    /^electrical/, /^hardware_store/, /^tools/, /^tool_library/, /^electrical/, /^batteries/, /^battery/,
    /^garden_centre/, /^garden/, /^plants/, /^plant$/, /^boutique/, /^haberdashery/, /^cheese$/, /^wine$/, /^beer$/,
    /^chocolate$/, /^coffee$/, /^tea$/, /^ice_cream$/, /^pet_grooming/, /^pet_care/, /^optometrist/, /^optician$/,
    /^sunglasses/, /^watches/, /^clock/, /^photo$/, /^camera/, /^binoculars/, /^trophy/, /^kites/, /^toys$/,
    /^books$/, /^comics/, /^magazine/, /^newspaper/, /^newsagent/, /^pawnbroker/, /^gold_buyer/, /^umbrella/,
    /^bag$/, /^handbags/, /^wallet/, /^socks/, /^wigs/, /^costume/, /^uniform/, /^t-shirts/, /^knives/,
    /^candles/, /^soap/, /^christmas/, /^seasonal/, /^discount/, /^wholesale/, /^online/, /^marketplace/,
  ],
  
  // Healthcare & Medical
  'Healthcare & Medical': [
    /^hospital/, /^clinic/, /^doctors?/, /^dentist/, /^pharmacy/, /^chemist/, /^veterinary/,
    /^medical/, /^health/, /^healthcare/, /^midwife/, /^nurse/, /^nursing/, /^physiotherapist/,
    /^massage/, /^chiropractor/, /^podiatrist/, /^audiologist/, /^optometrist/, /^optician/, /^psychotherapist/,
    /^psychiatrist/, /^psychologist/, /^counselling/, /^counseling/, /^mental_health/, /^rehabilitation/,
    /^hospice/, /^nursing_home/, /^blood_bank/, /^blood_donation/, /^plasma_center/, /^laboratory/,
    /^medical_supply/, /^health_food/, /^hearing_aids/, /^prosthetics/, /^dialysis/, /^medical_detox/,
    /^home_health_care/, /^homecare/, /^senior_care/, /^maternity/, /^mens_health/, /^weight_loss/,
    /^nutrition/, /^nutrition_counselling/, /^nutrition_supplements/, /^alternative$/, /^herbalist/,
    /^herbal_medicine/, /^traditional_chinese_medicine/, /^chinese_medicine/, /^chiropodist/,
    /^physiatrist/, /^speech_therapist/, /^occupational_therapist/, /^psychic$/, /^tarot/, /^fortune_teller/,
    /^tanning_salon/, /^nail_salon/, /^nails/, /^beauty$/, /^spa/, /^sauna/, /^hot_tub/, /^whirlpool/,
    /^fitness_centre/, /^fitness/, /^fitness_station/, /^gym/, /^Gym/, /^Personal Trainer/, /^personal_trainer/,
    /^personal_training/, /^yoga/, /^pilates/, /^physician/, /^foot_clinic/, /^podiatrist/, /^eyeglass_repair/,
    /^dental_oral_maxillo_facial_surgery/, /^dentures/, /^urgent_care/, /^clinic_urgent_care/,
  ],
  
  // Personal Care & Beauty
  'Personal Care & Beauty': [
    /^hairdresser/, /^barber/, /^beauty$/, /^beauty_supplies/, /^beauty_supply/, /^cosmetics/,
    /^nail_salon/, /^nails/, /^massage/, /^tanning_salon/, /^spa/, /^sauna/, /^hot_tub/, /^whirlpool/,
    /^perfumery/, /^tattoo/, /^tattoo_removal/, /^piercing/, /^wigs/, /^electrologist/,
  ],
  
  // Education
  'Education': [
    /^school/, /^university/, /^college/, /^kindergarten/, /^language_school/, /^driving_school/,
    /^music_school/, /^dancing_school/, /^art_school/, /^acting_school/, /^flight_school/, /^ski_school/,
    /^swimming_school/, /^first_aid_school/, /^trade_school/, /^prep_school/, /^educational_institution/,
    /^education/, /^tutoring/, /^tutor/, /^training$/, /^lessons/, /^library/, /^archive/, /^archives/,
  ],
  
  // Transportation & Automotive
  'Transportation & Automotive': [
    /^parking/, /^car/, /^motorcycle/, /^bicycle$/, /^fuel/, /^charging_station/, /^car_wash/,
    /^car_repair/, /^car_rental/, /^car_sharing/, /^car_parts/, /^motorcycle_repair/, /^motorcycle_rental/,
    /^bicycle_rental/, /^bicycle_repair/, /^bicycle_repair_station/, /^bicycle_parking/, /^motorcycle_parking/,
    /^scooter/, /^scooter_rental/, /^scooter_share/, /^taxi/, /^bus_station/, /^ferry_terminal/,
    /^parking_space/, /^parking_entrance/, /^parking_exit/, /^loading_dock/, /^tyres/, /^car_audio/,
    /^car_bodyshop/, /^car_detail/, /^towing/, /^truck/, /^trucking_company/, /^logistics/, /^courier/,
    /^shipping/, /^shipping_service/, /^transport/, /^public_transport/, /^limousine/, /^limousine_service/,
    /^shuttle/, /^tourist_bus/, /^vehicle_inspection/, /^weighbridge/, /^compressed_air/, /^moped parking/,
    /^skateboard$/, /^scooter_parking/, /^skateboard_parking/, /^e-bike/, /^e_scooter/, /^atv/,
  ],
  
  // Recreation & Entertainment
  'Recreation & Entertainment': [
    /^park/, /^playground/, /^picnic/, /^camp/, /^beach/, /^swimming_pool/, /^swimming_area/,
    /^ice_rink/, /^golf/, /^bowling/, /^billiards/, /^minia[tg]ure_golf/, /^escape_game/, /^trampoline_park/,
    /^indoor_play/, /^water_park/, /^theme_park/, /^amusement_arcade/, /^arcade/, /^cinema/, /^theatre/,
    /^museum/, /^gallery$/, /^artwork/, /^arts_centre/, /^nightclub/, /^karaoke/, /^karaoke_box/,
    /^club$/, /^concert_hall/, /^music_venue/, /^comedy/, /^magic/, /^magician/, /^escape_game/,
    /^paintball/, /^indoor_golf/, /^disc_golf/, /^disc_golf_course/, /^scuba_diving/, /^water_sports/,
    /^surf/, /^fishing/, /^hunting/, /^dog_park/, /^pitch$/, /^sports_centre/, /^sports_hall/, /^sports$/,
    /^stadium/, /^track$/, /^parking$/, /^viewpoint/, /^wildlife_hide/, /^bird_hide/, /^picnic_table/,
    /^bbq/, /^firepit/, /^fireplace/, /^lounger/, /^bench$/, /^hammock/, /^swings/, /^fitness_station/,
    /^bicycle_rental/, /^scooter_rental/, /^ski_rental/, /^boat_rental/, /^caravan/, /^caravan_site/,
    /^trailer_park/, /^camp_pitch/, /^camp_site/, /^camping/, /^chalet/, /^water_park/, /^nature_reserve/,
    /^traffic_park/, /^shooting_ground/, /^motorsports/, /^golf_course/, /^wilderness_hut/, /^refuge/,
    /^picnic_site/, /^picnic area/, /^fireworks/, /^pyrotechnics/, /^paint_and_sip/, /^bingo/, /^lottery/,
  ],
  
  // Accommodation & Lodging
  'Accommodation & Lodging': [
    /^hotel/, /^motel/, /^hostel/, /^guest_house/, /^apartment$/, /^apartments/, /^resort/, /^beach_resort/,
    /^bed/, /^camp_site/, /^caravan_site/, /^chalet/, /^wilderness_hut/, /^refuge/, /^monastery/,
  ],
  
  // Professional Services
  'Professional Services': [
    /^lawyer/, /^accountant/, /^architect/, /^engineer/, /^surveyor/, /^consulting/, /^financial_advisor/,
    /^insurance/, /^realty/, /^estate_agent/, /^property_management/, /^advertising/, /^advertising_agency/,
    /^graphic_design/, /^web_design/, /^web_development/, /^it$/, /^it_services/, /^software/, /^software_company/,
    /^telecommunication/, /^telecommunications/, /^security/, /^detective/, /^private_investigator/,
    /^process_server/, /^notary/, /^tax_advisor/, /^tax_preparation/, /^bail_bond/, /^bail_bond_agent/,
    /^employment_agency/, /^recruiting/, /^recruitment/, /^translator/, /^Interpreter/, /^travel_agency/,
    /^travel_agent/, /^counseling/, /^counselling/, /^consulting/, /^management$/, /^company$/, /^office$/,
    /^coworking/, /^coworking_space/, /^commercial_kitchen/, /^logistics/, /^moving_company/, /^shipping/,
    /^courier/, /^cleaning/, /^pest_control/, /^exterminator/, /^kind_pest_control/, /^locksmith/,
    /^window_tinting/, /^window_blind/, /^security$/, /^detective/, /^lawyer/, /^bailbond/,
  ],
  
  // Financial Services
  'Financial Services': [
    /^bank/, /^atm/, /^insurance/, /^insurance_agent/, /^financial/, /^financial_advisor/, /^accountant/,
    /^tax_advisor/, /^tax_preparation/, /^mortgage/, /^mortgage_lender/, /^money_lender/, /^money_transfer/,
    /^bureau_de_change/, /^check_cashing/, /^cheque_cashing/, /^payment_terminal/, /^payment_centre/,
    /^investment/, /^stock_broker/, /^credit_card_company/, /^pawnbroker/, /^gold_buyer/,
  ],
  
  // Government & Public Services
  'Government & Public Services': [
    /^government/, /^townhall/, /^courthouse/, /^police/, /^fire_station/, /^post_office/, /^post_box/,
    /^post_depot/, /^letter_box/, /^library$/, /^community_centre/, /^social_centre/, /^social_facility/,
    /^polling_station/, /^diplomatic/, /^military/, /^military_recruitment/, /^military_surplus/,
    /^border_control/, /^ranger_station/, /^reception_desk/, /^public_building/, /^public_transport/,
    /^public_transport_tickets/, /^public_art_gallery/, /^public_bookcase/, /^public_bath/, /^public_representative/,
    /^toilets/, /^drinking_water/, /^waste_basket/, /^waste_disposal/, /^waste_transfer_station/, /^recycling/,
    /^water/, /^water_utility/, /^water_point/, /^water_tap/, /^watering_place/, /^compost/, /^grit_bin/,
  ],
  
  // Arts & Culture
  'Arts & Culture': [
    /^art$/, /^artwork/, /^gallery$/, /^museum/, /^arts_centre/, /^theatre/, /^cinema/, /^concert_hall/,
    /^music_venue/, /^library$/, /^archive/, /^archives/, /^monument/, /^memorial/, /^sculpture/,
    /^art_school/, /^music_school/, /^dancing_school/, /^acting_school/, /^photo_studio/, /^studio$/,
    /^piano/, /^music$/, /^video$/, /^film/, /^cinema/, /^theatre/, /^arts_supplies/, /^art_supply/,
    /^art_suplies/, /^paint$/, /^pottery/, /^photography/, /^frame/, /^framing/, /^art;frame/, /^frame;art/,
    /^planetarium/, /^public_art_gallery/,
  ],
  
  // Home & Garden
  'Home & Garden': [
    /^garden/, /^garden_centre/, /^hardware/, /^hardware_store/, /^furniture$/, /^houseware/, /^household/,
    /^kitchenware/, /^appliance/, /^bathroom_furnishing/, /^bedding/, /^carpet/, /^curtain/, /^fabric/,
    /^flooring/, /^floor_covering/, /^tiles/, /^paint$/, /^lighting/, /^tools/, /^tool_library/,
    /^electrical/, /^plumbing/, /^plumbers/, /^hvac/, /^Heating And Ventilation/, /^cleaning_supplies/,
    /^garden_furniture/, /^garden_machinery/, /^plants/, /^plant$/, /^houseplant/, /^compost/, /^irrigation/,
    /^landscaping/, /^landscaper/, /^construction/, /^construction_company/, /^construction_company_office/,
    /^building_contractor/, /^general_contractor/, /^masonry_contractor/, /^building_materials/, /^building_supply/,
    /^garage_door_supplier/, /^water_filter_supplier/, /^water_softener_supplier/, /^pool_contractor/, /^pool_supplies/,
    /^pest_control/, /^exterminator/, /^kind_pest_control/, /^cleaning$/, /^carpet_cleaning/, /^carpet_washing/,
    /^upholstery/, /^repair$/, /^window_blind/, /^awning/, /^doors$/, /^glass/, /^glaziery/, /^locksmith/,
  ],
  
  // Religious & Spiritual
  'Religious & Spiritual': [
    /^place_of_worship/, /^church/, /^monastery/, /^religion/, /^grave_yard/, /^grave$/, /^crematorium/,
    /^funeral_directors/, /^funeral_hall/, /^peace_pole/, /^memorial/,
  ],
  
  // Sports & Fitness
  'Sports & Fitness': [
    /^sports/, /^fitness/, /^gym/, /^Gym/, /^sports_centre/, /^sports_hall/, /^stadium/, /^golf/, /^golf_course/,
    /^bowling/, /^bowling_alley/, /^swimming_pool/, /^ice_rink/, /^fitness_centre/, /^fitness_station/, /^golf_cart/,
    /^Personal Trainer/, /^personal_trainer/, /^personal_training/, /^yoga/, /^pilates/, /^martial_arts/, /^dojo/,
    /^pitch$/, /^track$/, /^playground/, /^sports;/, /^fitness_equipment/, /^bicycle$/, /^surf/, /^scuba_diving/,
    /^water_sports/, /^fishing/, /^hunting/, /^shooting_ground/, /^motorsports/, /^atv/, /^paintball/,
    /^disc_golf/, /^disc_golf_course/, /^miniature_golf/, /^billiards/, /^bowling_supply_shop/, /^skate$/, /^skateboard$/,
  ],
  
  // Utilities & Infrastructure
  'Utilities & Infrastructure': [
    /^fuel$/, /^charging_station/, /^water/, /^water_utility/, /^water_point/, /^water_tap/, /^watering_place/,
    /^gas$/, /^gas_utility/, /^electricity/, /^energy/, /^energy_supplier/, /^sub_station/, /^compressed_air/,
    /^street_lamp/, /^waste_basket/, /^waste_disposal/, /^waste_transfer_station/, /^recycling/, /^recycling;waste_basket/,
    /^compost/, /^grit_bin/, /^vending_machine/, /^vending_machine;waste_basket/, /^waste_basket;vending_machine/,
    /^waste_basket;recycling/, /^toilets/, /^drinking_water/, /^shower/, /^public_bath/, /^hand_sanitizing/,
    /^handwashing/, /^foot_shower/, /^locker/, /^lockers/, /^luggage_locker/, /^left_luggage/, /^cloakroom/,
    /^dressing_room/, /^change_machine/, /^ticket_validator/, /^turn_stile/, /^weighbridge/, /^loading_dock/,
    /^parcel_locker/, /^library_dropoff/, /^public_bookcase/, /^give_box/, /^food_sharing/, /^donation_dropoff_location/,
    /^donations_dropoff/, /^Donation Center/, /^trolley_bay/, /^scooter_parking/, /^skateboard_parking/, /^moped parking/,
  ],
  
  // Communications & Technology
  'Communications & Technology': [
    /^mobile_phone/, /^telephone/, /^phone$/, /^telecommunication/, /^internet_cafe/, /^internet_provider/, /^internet_marketing/,
    /^isp/, /^cable_tv/, /^cable_television/, /^television/, /^radio_broadcasting_studio/, /^computer/, /^computer_software/,
    /^software/, /^software_company/, /^it$/, /^it_services/, /^technology/, /^device_charging_station/, /^wifi/,
    /^mailroom/, /^post_office/, /^post_box/, /^post_depot/, /^letter_box/, /^postal_relay_box/, /^relay_box/,
    /^parcel_locker/, /^po_box/, /^dropbox/, /^postal/, /^bureau_de_change/, /^money_transfer/,
  ],
  
  // Social & Community
  'Social & Community': [
    /^community_centre/, /^social_centre/, /^social_facility/, /^social_service/, /^social_services/, /^social_club/,
    /^association/, /^ngo/, /^charity/, /^fraternity/, /^sorority/, /^union/, /^labor_union/, /^trade_union/,
    /^cooperative/, /^foundation/, /^nonprofit/, /^non_profit/, /^foster_care_services/, /^senior_care/, /^childcare/,
    /^dog_day_care/, /^animal_boarding/, /^animal_shelter/, /^blood_donation/, /^plasma_center/, /^food_sharing/,
    /^donation_dropoff_location/, /^donations_dropoff/, /^Donation Center/, /^public_bookcase/, /^give_box/,
    /^mediation_centre/, /^counselling/, /^counseling/, /^immigration_services/, /^refuge/, /^social_centre/,
  ],
  
  // Industrial & Manufacturing
  'Industrial & Manufacturing': [
    /^industrial/, /^manufacturer/, /^warehouse/, /^storage$/, /^storage_rental/, /^construction/, /^construction_company/,
    /^industrial_equipment/, /^heavy_equipment/, /^power_equipment/, /^garden_machinery/, /^building_materials/,
    /^building_supply/, /^wholesale/, /^logistics/, /^moving_company/, /^moving_storage/, /^boat_storage/,
    /^scrap_yard/, /^junk_yard/, /^ship_recycling/, /^compost/, /^recycling/, /^waste_transfer_station/,
    /^fuel$/, /^gas$/, /^energy/, /^energy_supplier/, /^solar/, /^Solar_Company/, /^solar_energy_company/,
    /^water_utility/, /^gas_utility/, /^electricity/, /^sub_station/, /^industrial_design_company/,
  ],
};

// Helper function to categorize a single category
function categorize(category) {
  for (const [highLevel, patterns] of Object.entries(categoryMappings)) {
    for (const pattern of patterns) {
      if (pattern.test(category)) {
        return highLevel;
      }
    }
  }
  return 'Other'; // Default for uncategorized
}

// Categorize all categories
const categorized = {};
categories.forEach(cat => {
  const highLevel = categorize(cat);
  if (!categorized[highLevel]) {
    categorized[highLevel] = [];
  }
  categorized[highLevel].push(cat);
});

// Sort categories within each group
Object.keys(categorized).forEach(key => {
  categorized[key].sort();
});

// Display results
console.log('=== CATEGORY GROUPINGS ===\n');
const sortedGroups = Object.entries(categorized)
  .sort((a, b) => b[1].length - a[1].length); // Sort by count descending

sortedGroups.forEach(([group, items]) => {
  console.log(`${group}: ${items.length} categories`);
});

console.log('\n=== DETAILED BREAKDOWN ===\n');
sortedGroups.forEach(([group, items]) => {
  console.log(`\n${group} (${items.length}):`);
  if (items.length <= 30) {
    items.forEach(item => console.log(`  - ${item}`));
  } else {
    items.slice(0, 10).forEach(item => console.log(`  - ${item}`));
    console.log(`  ... and ${items.length - 10} more`);
  }
});

// Output summary file
const summaryFile = path.join(__dirname, '../poi-categories-groupings.txt');
const summaryLines = [
  'HIGH-LEVEL CATEGORY GROUPINGS',
  '==============================',
  '',
  ...sortedGroups.map(([group, items]) => {
    return `${group} (${items.length} categories)`;
  }),
  '',
  'TOTAL CATEGORIES: ' + categories.length,
  'HIGH-LEVEL GROUPS: ' + sortedGroups.length,
];

fs.writeFileSync(summaryFile, summaryLines.join('\n'));
console.log(`\n✓ Summary saved to: ${summaryFile}`);
