#!/usr/bin/env python3
"""
Restaurant Matching System using Yelp Fusion API
Matches existing buffets with Yelp listings using the official Yelp API.
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
import requests
from fuzzywuzzy import fuzz

def normalize_name(name):
    """Normalize restaurant name for comparison."""
    if not name:
        return ""
    name = name.lower()
    for word in ["restaurant", "chinese", "buffet", "&", "and", "inc", "llc"]:
        name = name.replace(word, " ")
    name = " ".join(name.split())
    return name.strip()

def normalize_phone(phone):
    """Normalize phone number for comparison."""
    if not phone:
        return ""
    return "".join(filter(str.isdigit, phone))

def search_yelp_api(api_key, name, city, state, address=None, phone=None):
    """Search Yelp using Fusion API and return business data if found."""
    try:
        url = "https://api.yelp.com/v3/businesses/search"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        
        # Build search parameters
        params = {
            "term": name,
            "location": f"{city}, {state}",
            "limit": 10,  # Get top 10 results
            "categories": "restaurants"  # Focus on restaurants
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        
        if response.status_code == 401:
            print(f"    ✗ Yelp API authentication failed. Check your API key.")
            return None
        elif response.status_code != 200:
            print(f"    ✗ Yelp API error: {response.status_code}")
            return None
        
        data = response.json()
        businesses = data.get('businesses', [])
        
        if not businesses:
            return None
        
        # Find best match using fuzzy matching
        best_match = None
        best_score = 0
        
        for business in businesses:
            biz_name = business.get('name', '')
            biz_location = business.get('location', {})
            biz_city = biz_location.get('city', '')
            biz_address = ' '.join(biz_location.get('display_address', []))
            biz_phone = business.get('phone', '')
            
            # Score based on name similarity
            name_score = fuzz.ratio(normalize_name(name), normalize_name(biz_name))
            
            # Bonus points for city match
            city_match = city.lower() == biz_city.lower()
            
            # Bonus points for phone match (if available)
            phone_match = False
            if phone and biz_phone:
                phone_match = normalize_phone(phone) == normalize_phone(biz_phone)
            
            # Calculate total score
            total_score = name_score
            if city_match:
                total_score += 10
            if phone_match:
                total_score += 20
            
            if total_score > best_score and name_score > 70:  # At least 70% name match
                best_score = total_score
                best_match = {
                    'id': business.get('id'),
                    'alias': business.get('alias'),
                    'name': biz_name,
                    'url': business.get('url'),
                    'rating': business.get('rating'),
                    'reviewCount': business.get('review_count', 0),
                    'price': business.get('price'),
                    'phone': biz_phone,
                    'address': biz_address,
                    'city': biz_city,
                    'state': biz_location.get('state', ''),
                    'zipCode': biz_location.get('zip_code', ''),
                    'categories': [cat.get('title') for cat in business.get('categories', [])],
                    'matchScore': total_score,
                    'matchReason': []
                }
                
                if city_match:
                    best_match['matchReason'].append('city_match')
                if phone_match:
                    best_match['matchReason'].append('phone_match')
                if name_score >= 90:
                    best_match['matchReason'].append('exact_name')
                elif name_score >= 80:
                    best_match['matchReason'].append('high_name_similarity')
        
        return best_match
        
    except Exception as e:
        print(f"    Error searching Yelp API: {e}")
        return None

def match_restaurants_yelp_api(api_key, input_file=None):
    """Main function to match restaurants using Yelp Fusion API."""
    # Determine input file
    if input_file:
        data_path = Path(input_file)
    else:
        # Try all-buffets-for-matching.json first (full database), then fallback to buffets-by-id.json
        data_path = Path(__file__).parent.parent / 'data' / 'all-buffets-for-matching.json'
        if not data_path.exists():
            data_path = Path(__file__).parent.parent / 'data' / 'buffets-by-id.json'
    
    if not data_path.exists():
        print(f"Error: {data_path} not found")
        print("\nTo export all buffets from InstantDB, run:")
        print("  node scripts/export-all-buffets-for-matching.js")
        return
    
    print(f"Loading buffets from {data_path}")
    with open(data_path, 'r', encoding='utf-8') as f:
        buffets = json.load(f)
    
    print(f"Loaded {len(buffets)} buffets\n")
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)
    
    mapping_file = output_dir / 'restaurant-mapping.json'
    
    # Load existing mapping if it exists
    mapping = {}
    if mapping_file.exists():
        with open(mapping_file, 'r', encoding='utf-8') as f:
            mapping = json.load(f)
        print(f"Loaded {len(mapping)} existing mappings\n")
    
    # Process each buffet
    total = len(buffets)
    matched_count = 0
    yelp_matched = 0
    processed = 0
    
    for idx, (buffet_id, buffet) in enumerate(buffets.items(), 1):
        # Skip if already matched
        if buffet_id in mapping and mapping[buffet_id].get('yelp'):
            processed += 1
            if mapping[buffet_id]['yelp']:
                yelp_matched += 1
            continue
        
        name = buffet.get('name', '')
        city = buffet.get('address', {}).get('city', '')
        state = buffet.get('address', {}).get('state', '')
        address = buffet.get('address', {}).get('full', '')
        phone = buffet.get('phone', '')
        
        if not name or not city or not state:
            continue
        
        print(f"[{idx}/{total}] ({idx*100//total}%) Matching: {name}")
        print(f"  Location: {city}, {state}")
        
        if buffet_id not in mapping:
            mapping[buffet_id] = {
                'buffetId': buffet_id,
                'buffetName': name,
                'city': city,
                'state': state,
                'phone': phone,
                'yelp': None,
                'tripadvisor': None
            }
        
        # Search Yelp API
        print(f"  Searching Yelp API...")
        yelp_result = search_yelp_api(api_key, name, city, state, address, phone)
        
        if yelp_result:
            mapping[buffet_id]['yelp'] = yelp_result
            yelp_matched += 1
            matched_count += 1
            print(f"  ✓ Found Yelp: {yelp_result['name']} (score: {yelp_result['matchScore']})")
            print(f"    Match reasons: {', '.join(yelp_result['matchReason'])}")
        else:
            print(f"  ✗ Yelp: Not found")
        
        processed += 1
        
        # Save after each match (for resume capability)
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
        
        # Progress update every 10 restaurants
        if idx % 10 == 0:
            print(f"\n{'='*60}")
            print(f"Progress Update:")
            print(f"  Processed: {processed}/{total} ({processed*100//total}%)")
            print(f"  Yelp matches: {yelp_matched} ({yelp_matched*100//processed if processed > 0 else 0}%)")
            remaining = total - processed
            estimated_minutes = (remaining * 1) // 60  # ~1 second per request (with API rate limits)
            print(f"  Estimated time remaining: ~{estimated_minutes} minutes")
            print(f"{'='*60}\n")
        
        # Rate limiting: Yelp API allows 5,000 calls/day
        # For large datasets, we need to be mindful of the daily limit
        time.sleep(0.2)  # Small delay to be respectful (0.2s = ~300 requests/minute)
    
    print(f"\n{'='*60}")
    print(f"Matching complete!")
    print(f"Total buffets: {total}")
    print(f"Processed: {processed}")
    print(f"Yelp matches: {yelp_matched} ({yelp_matched*100//processed if processed > 0 else 0}%)")
    print(f"Mapping saved to: {mapping_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Match restaurants using Yelp Fusion API')
    parser.add_argument('--api-key', help='Yelp Fusion API key', 
                       default=os.environ.get('YELP_API_KEY'))
    parser.add_argument('--input', help='Input JSON file path (default: data/all-buffets-for-matching.json or data/buffets-by-id.json)')
    
    args = parser.parse_args()
    
    api_key = args.api_key
    
    if not api_key:
        print("Error: Yelp API key required!")
        print("\nTo get a Yelp API key:")
        print("1. Go to https://www.yelp.com/developers")
        print("2. Sign up / Log in")
        print("3. Create an app to get your API key")
        print("\nThen either:")
        print("  - Set environment variable: export YELP_API_KEY=your_key_here")
        print("  - Or pass as argument: --api-key your_key_here")
        sys.exit(1)
    
    match_restaurants_yelp_api(api_key, args.input)

