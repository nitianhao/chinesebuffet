// Script to label all poiRecords with high-level category groups
// Run with: node scripts/label-poi-groups.js
// 
// IMPORTANT: Sync the schema in InstantDB dashboard first to add the 'group' field

const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local if it exists
try {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return;
      }
      const match = trimmed.match(/^([^=:#\s]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
} catch (error) {
  console.warn('Warning: Could not load .env.local:', error.message);
}

// Category to Group mapping
const categoryToGroup = {
  // Food & Dining
  'restaurant': 'Food & Dining',
  'fast_food': 'Food & Dining',
  'cafe': 'Food & Dining',
  'bar': 'Food & Dining',
  'pub': 'Food & Dining',
  'food_court': 'Food & Dining',
  'ice_cream': 'Food & Dining',
  'bakery': 'Food & Dining',
  'deli': 'Food & Dining',
  'butcher': 'Food & Dining',
  'confectionery': 'Food & Dining',
  'coffee': 'Food & Dining',
  'tea': 'Food & Dining',
  'alcohol': 'Food & Dining',
  'biergarten': 'Food & Dining',
  'wine': 'Food & Dining',
  'catering': 'Food & Dining',
  'food': 'Food & Dining',
  'snack': 'Food & Dining',
  'beverages': 'Food & Dining',
  'donut': 'Food & Dining',
  'pasta': 'Food & Dining',
  'pastry': 'Food & Dining',
  'seafood': 'Food & Dining',
  'sushi': 'Food & Dining',
  'chocolate': 'Food & Dining',
  'cheese': 'Food & Dining',
  'caviar': 'Food & Dining',
  'specialty_food': 'Food & Dining',
  'health_food': 'Food & Dining',
  'frozen_food': 'Food & Dining',
  'dry_food': 'Food & Dining',
  'juice': 'Food & Dining',
  'juice_bar': 'Food & Dining',
  'canteen': 'Food & Dining',
  'dessert': 'Food & Dining',
  'spices': 'Food & Dining',
  'honey': 'Food & Dining',
  'olive_oil': 'Food & Dining',
  'dairy': 'Food & Dining',
  'nuts': 'Food & Dining',
  'edible_seeds': 'Food & Dining',
  'ghost_kitchen': 'Food & Dining',
  'food_sharing': 'Food & Dining',
  'grocery': 'Food & Dining',
  'convenience': 'Food & Dining',
  'supermarket': 'Food & Dining',
  'greengrocer': 'Food & Dining',
  'convenience_store': 'Food & Dining',
  
  // Retail & Shopping
  'shop': 'Retail & Shopping',
  'store': 'Retail & Shopping',
  'retail': 'Retail & Shopping',
  'department_store': 'Retail & Shopping',
  'variety_store': 'Retail & Shopping',
  'clothes': 'Retail & Shopping',
  'shoes': 'Retail & Shopping',
  'jewelry': 'Retail & Shopping',
  'books': 'Retail & Shopping',
  'toys': 'Retail & Shopping',
  'electronics': 'Retail & Shopping',
  'computer': 'Retail & Shopping',
  'mobile_phone': 'Retail & Shopping',
  'hardware': 'Retail & Shopping',
  'stationery': 'Retail & Shopping',
  'cosmetics': 'Retail & Shopping',
  'perfumery': 'Retail & Shopping',
  'gift': 'Retail & Shopping',
  'tobacco': 'Retail & Shopping',
  'cannabis': 'Retail & Shopping',
  'dispensary': 'Retail & Shopping',
  'second_hand': 'Retail & Shopping',
  'antiques': 'Retail & Shopping',
  'collector': 'Retail & Shopping',
  'vintage_clothing': 'Retail & Shopping',
  'fashion': 'Retail & Shopping',
  'fashion_accessories': 'Retail & Shopping',
  'beauty_supplies': 'Retail & Shopping',
  'pet': 'Retail & Shopping',
  'bicycle': 'Retail & Shopping',
  'sports': 'Retail & Shopping',
  'hobby': 'Retail & Shopping',
  'music': 'Retail & Shopping',
  'video': 'Retail & Shopping',
  'games': 'Retail & Shopping',
  'video_games': 'Retail & Shopping',
  'musical_instrument': 'Retail & Shopping',
  'baby_goods': 'Retail & Shopping',
  'home_goods_store': 'Retail & Shopping',
  'kitchenware': 'Retail & Shopping',
  'cookware': 'Retail & Shopping',
  'bedding': 'Retail & Shopping',
  'carpet': 'Retail & Shopping',
  'curtain': 'Retail & Shopping',
  'fabric': 'Retail & Shopping',
  'flooring': 'Retail & Shopping',
  'tiles': 'Retail & Shopping',
  'paint': 'Retail & Shopping',
  'lighting': 'Retail & Shopping',
  'appliance': 'Retail & Shopping',
  'furniture': 'Retail & Shopping',
  'houseware': 'Retail & Shopping',
  'household': 'Retail & Shopping',
  'hardware_store': 'Retail & Shopping',
  'garden_centre': 'Retail & Shopping',
  'boutique': 'Retail & Shopping',
  'kiosk': 'Retail & Shopping',
  'mall': 'Retail & Shopping',
  'market': 'Retail & Shopping',
  'marketplace': 'Retail & Shopping',
  
  // Healthcare & Medical Services
  'hospital': 'Healthcare & Medical Services',
  'clinic': 'Healthcare & Medical Services',
  'doctors': 'Healthcare & Medical Services',
  'doctor': 'Healthcare & Medical Services',
  'dentist': 'Healthcare & Medical Services',
  'pharmacy': 'Healthcare & Medical Services',
  'chemist': 'Healthcare & Medical Services',
  'veterinary': 'Healthcare & Medical Services',
  'medical': 'Healthcare & Medical Services',
  'health': 'Healthcare & Medical Services',
  'healthcare': 'Healthcare & Medical Services',
  'midwife': 'Healthcare & Medical Services',
  'nurse': 'Healthcare & Medical Services',
  'nursing': 'Healthcare & Medical Services',
  'physiotherapist': 'Healthcare & Medical Services',
  'massage': 'Healthcare & Medical Services',
  'chiropractor': 'Healthcare & Medical Services',
  'podiatrist': 'Healthcare & Medical Services',
  'audiologist': 'Healthcare & Medical Services',
  'optometrist': 'Healthcare & Medical Services',
  'optician': 'Healthcare & Medical Services',
  'psychotherapist': 'Healthcare & Medical Services',
  'psychiatrist': 'Healthcare & Medical Services',
  'psychologist': 'Healthcare & Medical Services',
  'counselling': 'Healthcare & Medical Services',
  'counseling': 'Healthcare & Medical Services',
  'mental_health': 'Healthcare & Medical Services',
  'rehabilitation': 'Healthcare & Medical Services',
  'hospice': 'Healthcare & Medical Services',
  'nursing_home': 'Healthcare & Medical Services',
  'blood_bank': 'Healthcare & Medical Services',
  'blood_donation': 'Healthcare & Medical Services',
  'plasma_center': 'Healthcare & Medical Services',
  'medical_supply': 'Healthcare & Medical Services',
  'hearing_aids': 'Healthcare & Medical Services',
  'prosthetics': 'Healthcare & Medical Services',
  'dialysis': 'Healthcare & Medical Services',
  'home_health_care': 'Healthcare & Medical Services',
  'homecare': 'Healthcare & Medical Services',
  'senior_care': 'Healthcare & Medical Services',
  'maternity': 'Healthcare & Medical Services',
  'weight_loss': 'Healthcare & Medical Services',
  'nutrition_counselling': 'Healthcare & Medical Services',
  'nutrition_supplements': 'Healthcare & Medical Services',
  'alternative': 'Healthcare & Medical Services',
  'herbalist': 'Healthcare & Medical Services',
  'herbal_medicine': 'Healthcare & Medical Services',
  'chinese_medicine': 'Healthcare & Medical Services',
  'traditional_chinese_medicine': 'Healthcare & Medical Services',
  'chiropodist': 'Healthcare & Medical Services',
  'physiatrist': 'Healthcare & Medical Services',
  'speech_therapist': 'Healthcare & Medical Services',
  'occupational_therapist': 'Healthcare & Medical Services',
  'urgent_care': 'Healthcare & Medical Services',
  'physician': 'Healthcare & Medical Services',
  'foot_clinic': 'Healthcare & Medical Services',
  'dental_oral_maxillo_facial_surgery': 'Healthcare & Medical Services',
  'dentures': 'Healthcare & Medical Services',
  
  // Personal Care & Beauty
  'hairdresser': 'Personal Care & Beauty',
  'barber': 'Personal Care & Beauty',
  'beauty': 'Personal Care & Beauty',
  'nail_salon': 'Personal Care & Beauty',
  'nails': 'Personal Care & Beauty',
  'spa': 'Personal Care & Beauty',
  'sauna': 'Personal Care & Beauty',
  'hot_tub': 'Personal Care & Beauty',
  'whirlpool': 'Personal Care & Beauty',
  'tanning_salon': 'Personal Care & Beauty',
  'tattoo': 'Personal Care & Beauty',
  'tattoo_removal': 'Personal Care & Beauty',
  'piercing': 'Personal Care & Beauty',
  'electrologist': 'Personal Care & Beauty',
  
  // Transportation & Automotive
  'parking': 'Transportation & Automotive',
  'car': 'Transportation & Automotive',
  'motorcycle': 'Transportation & Automotive',
  'fuel': 'Transportation & Automotive',
  'charging_station': 'Transportation & Automotive',
  'car_wash': 'Transportation & Automotive',
  'car_repair': 'Transportation & Automotive',
  'car_rental': 'Transportation & Automotive',
  'car_sharing': 'Transportation & Automotive',
  'car_parts': 'Transportation & Automotive',
  'motorcycle_repair': 'Transportation & Automotive',
  'motorcycle_rental': 'Transportation & Automotive',
  'bicycle_rental': 'Transportation & Automotive',
  'bicycle_repair': 'Transportation & Automotive',
  'bicycle_repair_station': 'Transportation & Automotive',
  'bicycle_parking': 'Transportation & Automotive',
  'motorcycle_parking': 'Transportation & Automotive',
  'scooter': 'Transportation & Automotive',
  'scooter_rental': 'Transportation & Automotive',
  'scooter_share': 'Transportation & Automotive',
  'taxi': 'Transportation & Automotive',
  'bus_station': 'Transportation & Automotive',
  'ferry_terminal': 'Transportation & Automotive',
  'parking_space': 'Transportation & Automotive',
  'parking_entrance': 'Transportation & Automotive',
  'parking_exit': 'Transportation & Automotive',
  'tyres': 'Transportation & Automotive',
  'car_audio': 'Transportation & Automotive',
  'car_bodyshop': 'Transportation & Automotive',
  'car_detail': 'Transportation & Automotive',
  'towing': 'Transportation & Automotive',
  'truck': 'Transportation & Automotive',
  'vehicle_inspection': 'Transportation & Automotive',
  'weighbridge': 'Transportation & Automotive',
  'compressed_air': 'Transportation & Automotive',
  'limousine': 'Transportation & Automotive',
  'limousine_service': 'Transportation & Automotive',
  'shuttle': 'Transportation & Automotive',
  'tourist_bus': 'Transportation & Automotive',
  'atv': 'Transportation & Automotive',
  'e-bike': 'Transportation & Automotive',
  'e_scooter': 'Transportation & Automotive',
  'skateboard': 'Transportation & Automotive',
  'scooter_parking': 'Transportation & Automotive',
  'skateboard_parking': 'Transportation & Automotive',
  
  // Recreation & Entertainment
  'park': 'Recreation & Entertainment',
  'playground': 'Recreation & Entertainment',
  'picnic': 'Recreation & Entertainment',
  'camp': 'Recreation & Entertainment',
  'beach': 'Recreation & Entertainment',
  'swimming_pool': 'Recreation & Entertainment',
  'swimming_area': 'Recreation & Entertainment',
  'ice_rink': 'Recreation & Entertainment',
  'golf': 'Recreation & Entertainment',
  'bowling': 'Recreation & Entertainment',
  'billiards': 'Recreation & Entertainment',
  'amusement_arcade': 'Recreation & Entertainment',
  'arcade': 'Recreation & Entertainment',
  'cinema': 'Recreation & Entertainment',
  'theatre': 'Recreation & Entertainment',
  'museum': 'Recreation & Entertainment',
  'gallery': 'Recreation & Entertainment',
  'artwork': 'Recreation & Entertainment',
  'arts_centre': 'Recreation & Entertainment',
  'nightclub': 'Recreation & Entertainment',
  'karaoke': 'Recreation & Entertainment',
  'karaoke_box': 'Recreation & Entertainment',
  'club': 'Recreation & Entertainment',
  'concert_hall': 'Recreation & Entertainment',
  'music_venue': 'Recreation & Entertainment',
  'comedy': 'Recreation & Entertainment',
  'magic': 'Recreation & Entertainment',
  'magician': 'Recreation & Entertainment',
  'escape_game': 'Recreation & Entertainment',
  'paintball': 'Recreation & Entertainment',
  'indoor_golf': 'Recreation & Entertainment',
  'disc_golf': 'Recreation & Entertainment',
  'scuba_diving': 'Recreation & Entertainment',
  'water_sports': 'Recreation & Entertainment',
  'surf': 'Recreation & Entertainment',
  'fishing': 'Recreation & Entertainment',
  'hunting': 'Recreation & Entertainment',
  'dog_park': 'Recreation & Entertainment',
  'pitch': 'Recreation & Entertainment',
  'sports_centre': 'Recreation & Entertainment',
  'sports_hall': 'Recreation & Entertainment',
  'stadium': 'Recreation & Entertainment',
  'track': 'Recreation & Entertainment',
  'viewpoint': 'Recreation & Entertainment',
  'wildlife_hide': 'Recreation & Entertainment',
  'bird_hide': 'Recreation & Entertainment',
  'picnic_table': 'Recreation & Entertainment',
  'bbq': 'Recreation & Entertainment',
  'firepit': 'Recreation & Entertainment',
  'fireplace': 'Recreation & Entertainment',
  'bench': 'Recreation & Entertainment',
  'hammock': 'Recreation & Entertainment',
  'swings': 'Recreation & Entertainment',
  'camp_pitch': 'Recreation & Entertainment',
  'camp_site': 'Recreation & Entertainment',
  'camping': 'Recreation & Entertainment',
  'chalet': 'Recreation & Entertainment',
  'water_park': 'Recreation & Entertainment',
  'nature_reserve': 'Recreation & Entertainment',
  'theme_park': 'Recreation & Entertainment',
  'zoo': 'Recreation & Entertainment',
  'aquarium': 'Recreation & Entertainment',
  'attraction': 'Recreation & Entertainment',
  'fireworks': 'Recreation & Entertainment',
  'pyrotechnics': 'Recreation & Entertainment',
  'paint_and_sip': 'Recreation & Entertainment',
  'lottery': 'Recreation & Entertainment',
  'gambling': 'Recreation & Entertainment',
  'casino': 'Recreation & Entertainment',
  'biergarten': 'Recreation & Entertainment',
  'outdoor_seating': 'Recreation & Entertainment',
  
  // Education & Learning
  'school': 'Education & Learning',
  'university': 'Education & Learning',
  'college': 'Education & Learning',
  'kindergarten': 'Education & Learning',
  'language_school': 'Education & Learning',
  'driving_school': 'Education & Learning',
  'music_school': 'Education & Learning',
  'dancing_school': 'Education & Learning',
  'art_school': 'Education & Learning',
  'acting_school': 'Education & Learning',
  'flight_school': 'Education & Learning',
  'ski_school': 'Education & Learning',
  'swimming_school': 'Education & Learning',
  'first_aid_school': 'Education & Learning',
  'trade_school': 'Education & Learning',
  'prep_school': 'Education & Learning',
  'educational_institution': 'Education & Learning',
  'education': 'Education & Learning',
  'tutoring': 'Education & Learning',
  'tutor': 'Education & Learning',
  'training': 'Education & Learning',
  'lessons': 'Education & Learning',
  'library': 'Education & Learning',
  'archive': 'Education & Learning',
  'archives': 'Education & Learning',
  
  // Professional & Business Services
  'lawyer': 'Professional & Business Services',
  'accountant': 'Professional & Business Services',
  'architect': 'Professional & Business Services',
  'engineer': 'Professional & Business Services',
  'surveyor': 'Professional & Business Services',
  'consulting': 'Professional & Business Services',
  'financial_advisor': 'Professional & Business Services',
  'insurance': 'Professional & Business Services',
  'realty': 'Professional & Business Services',
  'estate_agent': 'Professional & Business Services',
  'property_management': 'Professional & Business Services',
  'advertising': 'Professional & Business Services',
  'advertising_agency': 'Professional & Business Services',
  'graphic_design': 'Professional & Business Services',
  'web_design': 'Professional & Business Services',
  'web_development': 'Professional & Business Services',
  'it': 'Professional & Business Services',
  'it_services': 'Professional & Business Services',
  'software': 'Professional & Business Services',
  'software_company': 'Professional & Business Services',
  'telecommunication': 'Professional & Business Services',
  'security': 'Professional & Business Services',
  'detective': 'Professional & Business Services',
  'private_investigator': 'Professional & Business Services',
  'process_server': 'Professional & Business Services',
  'notary': 'Professional & Business Services',
  'tax_advisor': 'Professional & Business Services',
  'tax_preparation': 'Professional & Business Services',
  'bail_bond': 'Professional & Business Services',
  'bail_bond_agent': 'Professional & Business Services',
  'bailbond': 'Professional & Business Services',
  'employment_agency': 'Professional & Business Services',
  'recruiting': 'Professional & Business Services',
  'recruitment': 'Professional & Business Services',
  'translator': 'Professional & Business Services',
  'Interpreter': 'Professional & Business Services',
  'travel_agency': 'Professional & Business Services',
  'travel_agent': 'Professional & Business Services',
  'management': 'Professional & Business Services',
  'company': 'Professional & Business Services',
  'office': 'Professional & Business Services',
  'coworking': 'Professional & Business Services',
  'coworking_space': 'Professional & Business Services',
  'commercial_kitchen': 'Professional & Business Services',
  'logistics': 'Professional & Business Services',
  'moving_company': 'Professional & Business Services',
  'shipping': 'Professional & Business Services',
  'courier': 'Professional & Business Services',
  'cleaning': 'Professional & Business Services',
  'pest_control': 'Professional & Business Services',
  'exterminator': 'Professional & Business Services',
  'locksmith': 'Professional & Business Services',
  
  // Financial Services
  'bank': 'Financial Services',
  'atm': 'Financial Services',
  'insurance': 'Financial Services',
  'insurance_agent': 'Financial Services',
  'financial': 'Financial Services',
  'financial_advice': 'Financial Services',
  'financial_services': 'Financial Services',
  'investment': 'Financial Services',
  'money_lender': 'Financial Services',
  'money_transfer': 'Financial Services',
  'bureau_de_change': 'Financial Services',
  'check_cashing': 'Financial Services',
  'cheque_cashing': 'Financial Services',
  'payment_terminal': 'Financial Services',
  'payment_centre': 'Financial Services',
  'mortgage': 'Financial Services',
  'mortgage_lender': 'Financial Services',
  'stock_broker': 'Financial Services',
  'pawnbroker': 'Financial Services',
  'gold_buyer': 'Financial Services',
  'credit_card_company': 'Financial Services',
  
  // Accommodation & Lodging
  'hotel': 'Accommodation & Lodging',
  'motel': 'Accommodation & Lodging',
  'hostel': 'Accommodation & Lodging',
  'guest_house': 'Accommodation & Lodging',
  'apartment': 'Accommodation & Lodging',
  'apartments': 'Accommodation & Lodging',
  'resort': 'Accommodation & Lodging',
  'bed': 'Accommodation & Lodging',
  'monastery': 'Accommodation & Lodging',
  
  // Government & Public Services
  'government': 'Government & Public Services',
  'townhall': 'Government & Public Services',
  'courthouse': 'Government & Public Services',
  'police': 'Government & Public Services',
  'fire_station': 'Government & Public Services',
  'post_office': 'Government & Public Services',
  'post_box': 'Government & Public Services',
  'post_depot': 'Government & Public Services',
  'letter_box': 'Government & Public Services',
  'library': 'Government & Public Services',
  'community_centre': 'Government & Public Services',
  'social_centre': 'Government & Public Services',
  'social_facility': 'Government & Public Services',
  'polling_station': 'Government & Public Services',
  'diplomatic': 'Government & Public Services',
  'military': 'Government & Public Services',
  'military_recruitment': 'Government & Public Services',
  'border_control': 'Government & Public Services',
  'ranger_station': 'Government & Public Services',
  'public_building': 'Government & Public Services',
  'toilets': 'Government & Public Services',
  'drinking_water': 'Government & Public Services',
  'waste_basket': 'Government & Public Services',
  'waste_disposal': 'Government & Public Services',
  'waste_transfer_station': 'Government & Public Services',
  'recycling': 'Government & Public Services',
  'water': 'Government & Public Services',
  'water_utility': 'Government & Public Services',
  'compost': 'Government & Public Services',
  'grit_bin': 'Government & Public Services',
  
  // Utilities & Infrastructure
  'fuel': 'Utilities & Infrastructure',
  'charging_station': 'Utilities & Infrastructure',
  'water': 'Utilities & Infrastructure',
  'water_point': 'Utilities & Infrastructure',
  'water_tap': 'Utilities & Infrastructure',
  'gas': 'Utilities & Infrastructure',
  'gas_utility': 'Utilities & Infrastructure',
  'electricity': 'Utilities & Infrastructure',
  'energy': 'Utilities & Infrastructure',
  'energy_supplier': 'Utilities & Infrastructure',
  'sub_station': 'Utilities & Infrastructure',
  'street_lamp': 'Utilities & Infrastructure',
  'vending_machine': 'Utilities & Infrastructure',
  'device_charging_station': 'Utilities & Infrastructure',
  'locker': 'Utilities & Infrastructure',
  'lockers': 'Utilities & Infrastructure',
  'left_luggage': 'Utilities & Infrastructure',
  'cloakroom': 'Utilities & Infrastructure',
  'dressing_room': 'Utilities & Infrastructure',
  'shower': 'Utilities & Infrastructure',
  'hand_sanitizing': 'Utilities & Infrastructure',
  'handwashing': 'Utilities & Infrastructure',
  'foot_shower': 'Utilities & Infrastructure',
  'parcel_locker': 'Utilities & Infrastructure',
  'trolley_bay': 'Utilities & Infrastructure',
  'ticket_validator': 'Utilities & Infrastructure',
  'turn_stile': 'Utilities & Infrastructure',
  'weighbridge': 'Utilities & Infrastructure',
  'change_machine': 'Utilities & Infrastructure',
  
  // Arts & Culture
  'art': 'Arts & Culture',
  'artwork': 'Arts & Culture',
  'gallery': 'Arts & Culture',
  'museum': 'Arts & Culture',
  'arts_centre': 'Arts & Culture',
  'theatre': 'Arts & Culture',
  'cinema': 'Arts & Culture',
  'concert_hall': 'Arts & Culture',
  'music_venue': 'Arts & Culture',
  'library': 'Arts & Culture',
  'archive': 'Arts & Culture',
  'planetarium': 'Arts & Culture',
  
  // Sports & Fitness
  'fitness_centre': 'Sports & Fitness',
  'fitness': 'Sports & Fitness',
  'fitness_station': 'Sports & Fitness',
  'gym': 'Sports & Fitness',
  'Gym': 'Sports & Fitness',
  'Personal Trainer': 'Sports & Fitness',
  'personal_trainer': 'Sports & Fitness',
  'personal_training': 'Sports & Fitness',
  'yoga': 'Sports & Fitness',
  'pilates': 'Sports & Fitness',
  'sports_centre': 'Sports & Fitness',
  'sports_hall': 'Sports & Fitness',
  'sports': 'Sports & Fitness',
  'stadium': 'Sports & Fitness',
  'golf': 'Sports & Fitness',
  'golf_course': 'Sports & Fitness',
  'martial_arts': 'Sports & Fitness',
  'dojo': 'Sports & Fitness',
  
  // Home Improvement & Garden
  'garden': 'Home Improvement & Garden',
  'garden_centre': 'Home Improvement & Garden',
  'hardware': 'Home Improvement & Garden',
  'hardware_store': 'Home Improvement & Garden',
  'furniture': 'Home Improvement & Garden',
  'kitchenware': 'Home Improvement & Garden',
  'appliance': 'Home Improvement & Garden',
  'bathroom_furnishing': 'Home Improvement & Garden',
  'construction': 'Home Improvement & Garden',
  'construction_company': 'Home Improvement & Garden',
  'building_contractor': 'Home Improvement & Garden',
  'general_contractor': 'Home Improvement & Garden',
  'masonry_contractor': 'Home Improvement & Garden',
  'building_materials': 'Home Improvement & Garden',
  'building_supply': 'Home Improvement & Garden',
  'plumbing': 'Home Improvement & Garden',
  'plumbers': 'Home Improvement & Garden',
  'hvac': 'Home Improvement & Garden',
  'landscaper': 'Home Improvement & Garden',
  'landscaping': 'Home Improvement & Garden',
  'plants': 'Home Improvement & Garden',
  'plant': 'Home Improvement & Garden',
  'pool_contractor': 'Home Improvement & Garden',
  'pool_supplies': 'Home Improvement & Garden',
  'garage_door_supplier': 'Home Improvement & Garden',
  'water_filter_supplier': 'Home Improvement & Garden',
  'water_softener_supplier': 'Home Improvement & Garden',
  
  // Religious & Spiritual
  'place_of_worship': 'Religious & Spiritual',
  'church': 'Religious & Spiritual',
  'monastery': 'Religious & Spiritual',
  'religion': 'Religious & Spiritual',
  'grave_yard': 'Religious & Spiritual',
  'grave': 'Religious & Spiritual',
  'crematorium': 'Religious & Spiritual',
  'funeral_directors': 'Religious & Spiritual',
  'funeral_hall': 'Religious & Spiritual',
  'peace_pole': 'Religious & Spiritual',
  
  // Social & Community Services
  'community_centre': 'Social & Community Services',
  'social_centre': 'Social & Community Services',
  'social_facility': 'Social & Community Services',
  'social_service': 'Social & Community Services',
  'social_services': 'Social & Community Services',
  'social_club': 'Social & Community Services',
  'association': 'Social & Community Services',
  'ngo': 'Social & Community Services',
  'charity': 'Social & Community Services',
  'fraternity': 'Social & Community Services',
  'sorority': 'Social & Community Services',
  'union': 'Social & Community Services',
  'labor_union': 'Social & Community Services',
  'trade_union': 'Social & Community Services',
  'cooperative': 'Social & Community Services',
  'foundation': 'Social & Community Services',
  'nonprofit': 'Social & Community Services',
  'non_profit': 'Social & Community Services',
  'foster_care_services': 'Social & Community Services',
  'senior_care': 'Social & Community Services',
  'childcare': 'Social & Community Services',
  'blood_donation': 'Social & Community Services',
  'food_sharing': 'Social & Community Services',
  'donation_dropoff_location': 'Social & Community Services',
  'Donation Center': 'Social & Community Services',
  'public_bookcase': 'Social & Community Services',
  'give_box': 'Social & Community Services',
  
  // Communications & Technology
  'mobile_phone': 'Communications & Technology',
  'telephone': 'Communications & Technology',
  'phone': 'Communications & Technology',
  'telecommunication': 'Communications & Technology',
  'internet_cafe': 'Communications & Technology',
  'internet_provider': 'Communications & Technology',
  'internet_marketing': 'Communications & Technology',
  'isp': 'Communications & Technology',
  'cable_tv': 'Communications & Technology',
  'cable_television': 'Communications & Technology',
  'television': 'Communications & Technology',
  'radio_broadcasting_studio': 'Communications & Technology',
  'computer': 'Communications & Technology',
  'computer_software': 'Communications & Technology',
  'software': 'Communications & Technology',
  'technology': 'Communications & Technology',
  'mailroom': 'Communications & Technology',
  
  // Industrial & Manufacturing
  'industrial': 'Industrial & Manufacturing',
  'manufacturer': 'Industrial & Manufacturing',
  'warehouse': 'Industrial & Manufacturing',
  'storage': 'Industrial & Manufacturing',
  'storage_rental': 'Industrial & Manufacturing',
  'construction_company': 'Industrial & Manufacturing',
  'industrial_equipment': 'Industrial & Manufacturing',
  'heavy_equipment': 'Industrial & Manufacturing',
  'power_equipment': 'Industrial & Manufacturing',
  'garden_machinery': 'Industrial & Manufacturing',
  'junk_yard': 'Industrial & Manufacturing',
  'ship_recycling': 'Industrial & Manufacturing',
  'wholesale': 'Industrial & Manufacturing',
  'moving_storage': 'Industrial & Manufacturing',
  'boat_storage': 'Industrial & Manufacturing',
  'solar': 'Industrial & Manufacturing',
  'solar_energy_company': 'Industrial & Manufacturing',
  
  // Repair & Maintenance Services
  'repair': 'Repair & Maintenance Services',
  'car_repair': 'Repair & Maintenance Services',
  'motorcycle_repair': 'Repair & Maintenance Services',
  'bicycle_repair': 'Repair & Maintenance Services',
  'bicycle_repair_station': 'Repair & Maintenance Services',
  'electronics_repair': 'Repair & Maintenance Services',
  'watch_repair': 'Repair & Maintenance Services',
  'watchmaker': 'Repair & Maintenance Services',
  'shoe_repair': 'Repair & Maintenance Services',
  'camera_repair': 'Repair & Maintenance Services',
  'eyeglass_repair': 'Repair & Maintenance Services',
  'tailor': 'Repair & Maintenance Services',
  'sewing': 'Repair & Maintenance Services',
  'seamstress': 'Repair & Maintenance Services',
  'cleaning': 'Repair & Maintenance Services',
  'carpet_cleaning': 'Repair & Maintenance Services',
  'carpet_washing': 'Repair & Maintenance Services',
  'window_tinting': 'Repair & Maintenance Services',
  
  // Pet Care & Veterinary
  'veterinary': 'Pet Care & Veterinary',
  'veterinary_pharmacy': 'Pet Care & Veterinary',
  'pet': 'Pet Care & Veterinary',
  'pet_care': 'Pet Care & Veterinary',
  'pet_grooming': 'Pet Care & Veterinary',
  'animal_boarding': 'Pet Care & Veterinary',
  'animal_shelter': 'Pet Care & Veterinary',
  'animal_training': 'Pet Care & Veterinary',
  'dog_day_care': 'Pet Care & Veterinary',
  'dog_training': 'Pet Care & Veterinary',
  'dog_wash': 'Pet Care & Veterinary',
  'pet_relief_area': 'Pet Care & Veterinary',
  
  // Agricultural & Farming
  'farm': 'Agricultural & Farming',
  'farming': 'Agricultural & Farming',
  'agrarian': 'Agricultural & Farming',
  'livestock': 'Agricultural & Farming',
  'hydroponics': 'Agricultural & Farming',
  
  // Travel & Tourism Services
  'travel_agency': 'Travel & Tourism Services',
  'travel_agent': 'Travel & Tourism Services',
  'tourist_bus': 'Travel & Tourism Services',
  'sightseeing': 'Travel & Tourism Services',
  'attraction': 'Travel & Tourism Services',
  'information': 'Travel & Tourism Services',
  'guide': 'Travel & Tourism Services',
  
  // Miscellaneous Services (default fallback)
};

// Helper function to get group from category
function getGroupFromCategory(category) {
  if (!category) return 'Miscellaneous Services';
  
  // Handle compound categories (e.g., "restaurant;karaoke")
  const primaryCategory = category.split(';')[0].trim();
  
  // Check exact match first
  if (categoryToGroup[category]) {
    return categoryToGroup[category];
  }
  
  // Check primary category
  if (categoryToGroup[primaryCategory]) {
    return categoryToGroup[primaryCategory];
  }
  
  // Check for partial matches with common prefixes
  for (const [cat, group] of Object.entries(categoryToGroup)) {
    if (category.startsWith(cat) || primaryCategory.startsWith(cat)) {
      return group;
    }
  }
  
  return 'Miscellaneous Services';
}

async function labelPOIGroups() {
  console.log('📋 Labeling poiRecords with category groups...\n');

  if (!process.env.INSTANT_ADMIN_TOKEN) {
    console.error('Error: INSTANT_ADMIN_TOKEN environment variable is required');
    console.error('Get your admin token from: https://instantdb.com/dash');
    process.exit(1);
  }

  try {
    // Import schema - try TypeScript first, then fallback to compiled JS
    let schema;
    try {
      schema = require('../src/instant.schema.ts');
    } catch (e) {
      schema = null;
    }

    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema?.default || schema || {},
    });

    console.log('Fetching poiRecords in batches...');
    
    // Fetch poiRecords in batches
    const batchSize = 1000;
    let allRecords = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const result = await db.query({
        poiRecords: {
          $: {
            limit: batchSize,
            offset: offset,
          }
        }
      });

      const records = result.poiRecords || [];
      allRecords = allRecords.concat(records);
      
      console.log(`  Fetched ${records.length} records (total: ${allRecords.length})...`);
      
      if (records.length < batchSize) {
        hasMore = false;
      } else {
        offset += batchSize;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✓ Total poiRecords fetched: ${allRecords.length}\n`);

    // Filter records that need updating (skip already labeled)
    const recordsToUpdate = [];
    const groupCounts = {};
    let alreadyLabeled = 0;

    for (const record of allRecords) {
      const category = record.category;
      const currentGroup = record.group;
      
      // Skip records that already have a group label
      if (currentGroup && currentGroup.trim() !== '') {
        alreadyLabeled++;
        continue;
      }
      
      const targetGroup = getGroupFromCategory(category);
      recordsToUpdate.push({ record, targetGroup });
      
      if (!groupCounts[targetGroup]) {
        groupCounts[targetGroup] = 0;
      }
      groupCounts[targetGroup]++;
    }

    console.log(`Records needing group labels: ${recordsToUpdate.length}`);
    console.log(`Records already labeled: ${alreadyLabeled}\n`);

    if (recordsToUpdate.length === 0) {
      console.log('✓ All records are already labeled!');
      return;
    }

    console.log('Group distribution for new labels:');
    Object.entries(groupCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([group, count]) => {
        console.log(`  ${group}: ${count} records`);
      });
    console.log('');

    // Update records in batches
    console.log('Updating records...');
    let updated = 0;
    const updateBatchSize = 100;

    for (let i = 0; i < recordsToUpdate.length; i += updateBatchSize) {
      const batch = recordsToUpdate.slice(i, i + updateBatchSize);
      
      for (const { record, targetGroup } of batch) {
        try {
          await db.transact([
            db.tx.poiRecords[record.id].update({ group: targetGroup })
          ]);
          updated++;
          
          if (updated % 100 === 0) {
            console.log(`  Updated ${updated}/${recordsToUpdate.length} records...`);
          }
        } catch (error) {
          console.error(`Error updating record ${record.id}:`, error.message);
        }
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`\n✓ Successfully labeled ${updated} records with category groups!`);

    // Final summary
    console.log('\n=== Final Summary ===');
    console.log(`Total records processed: ${allRecords.length}`);
    console.log(`Records updated: ${updated}`);
    console.log(`Records already labeled: ${alreadyLabeled}`);
    console.log(`Records remaining unlabeled: ${recordsToUpdate.length - updated}`);
    
  } catch (error) {
    console.error('❌ Error labeling poiRecords:', error);
    if (error.message && error.message.includes('schema')) {
      console.error('\n💡 Tip: Make sure you have synced the schema in InstantDB dashboard');
      console.error('   The "group" field must exist in the poiRecords entity.');
    }
    throw error;
  }
}

labelPOIGroups()
  .then(() => {
    console.log('\n✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Failed:', error.message);
    process.exit(1);
  });
