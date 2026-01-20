#!/usr/bin/env python3
"""
Restaurant Matching System
Matches existing buffets with Yelp and TripAdvisor listings using fuzzy matching on name, location, and phone.
"""

import json
import os
import sys
from pathlib import Path
from urllib.parse import quote_plus
import requests
from bs4 import BeautifulSoup
from fuzzywuzzy import fuzz, process
import time

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

def normalize_name(name):
    """Normalize restaurant name for comparison."""
    if not name:
        return ""
    # Remove common suffixes and normalize
    name = name.lower()
    # Remove common words that might differ
    for word in ["restaurant", "chinese", "buffet", "&", "and"]:
        name = name.replace(word, " ")
    # Remove extra spaces
    name = " ".join(name.split())
    return name.strip()

def normalize_phone(phone):
    """Normalize phone number for comparison."""
    if not phone:
        return ""
    # Remove all non-digit characters
    return "".join(filter(str.isdigit, phone))

def search_yelp(name, city, state):
    """Search Yelp for a restaurant and return business ID if found."""
    try:
        search_query = f"{name} {city} {state}"
        url = f"https://www.yelp.com/search?find_desc={quote_plus(search_query)}&find_loc={quote_plus(f'{city}, {state}')}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://www.yelp.com/',
        }
        
        session = requests.Session()
        session.headers.update(headers)
        
        # First visit the homepage to get cookies
        try:
            session.get('https://www.yelp.com/', timeout=10)
        except:
            pass
        
        response = session.get(url, timeout=15, allow_redirects=True)
        
        if response.status_code == 403:
            print(f"    Yelp blocked request (403). This is normal - Yelp has strict anti-scraping measures.")
            return None
            
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for business links - Yelp uses /biz/ URLs
        business_links = soup.find_all('a', href=True)
        best_match = None
        best_score = 0
        
        for link in business_links:
            href = link.get('href', '')
            if '/biz/' in href:
                # Extract full business URL
                biz_url_part = href.split('/biz/')[1].split('?')[0]
                biz_name = link.get_text(strip=True)
                
                # Check if name matches reasonably well
                name_score = fuzz.ratio(normalize_name(name), normalize_name(biz_name))
                
                if name_score > 70 and name_score > best_score:
                    best_score = name_score
                    best_match = {
                        'id': biz_url_part,  # Use full URL part as ID (e.g., "business-name-city")
                        'name': biz_name,
                        'url': f"https://www.yelp.com/biz/{biz_url_part}"
                    }
        
        time.sleep(2)  # Rate limiting
        return best_match
    except Exception as e:
        print(f"  Error searching Yelp: {e}")
        return None

def search_tripadvisor(name, city, state):
    """Search TripAdvisor for a restaurant and return location ID if found."""
    try:
        search_query = f"{name} {city} {state}"
        url = f"https://www.tripadvisor.com/Search?q={quote_plus(search_query)}"
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0',
            'Referer': 'https://www.tripadvisor.com/',
        }
        
        session = requests.Session()
        session.headers.update(headers)
        
        # First visit the homepage to get cookies
        try:
            session.get('https://www.tripadvisor.com/', timeout=10)
        except:
            pass
        
        response = session.get(url, timeout=15, allow_redirects=True)
        
        if response.status_code == 403:
            print(f"    TripAdvisor blocked request (403). This is normal - TripAdvisor has strict anti-scraping measures.")
            return None
            
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Look for restaurant links - TripAdvisor uses specific patterns
        restaurant_links = soup.find_all('a', href=True)
        for link in restaurant_links:
            href = link.get('href', '')
            # TripAdvisor restaurant URLs look like /Restaurant_Review-g...
            if '/Restaurant_Review-' in href:
                # Extract location ID (g number)
                parts = href.split('-')
                if len(parts) > 1:
                    loc_id = parts[1]
                    rest_name = link.get_text(strip=True)
                    
                    # Check if name matches reasonably well
                    if fuzz.ratio(normalize_name(name), normalize_name(rest_name)) > 70:
                        return {
                            'id': loc_id,
                            'name': rest_name,
                            'url': f"https://www.tripadvisor.com{href}"
                        }
        
        time.sleep(2)  # Rate limiting
        return None
    except Exception as e:
        print(f"  Error searching TripAdvisor: {e}")
        return None

def match_restaurants():
    """Main function to match restaurants."""
    # Load existing buffets
    data_path = Path(__file__).parent.parent / 'data' / 'buffets-by-id.json'
    
    if not data_path.exists():
        print(f"Error: {data_path} not found")
        return
    
    print(f"Loading buffets from {data_path}")
    with open(data_path, 'r', encoding='utf-8') as f:
        buffets = json.load(f)
    
    print(f"Loaded {len(buffets)} buffets")
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)
    
    mapping_file = output_dir / 'restaurant-mapping.json'
    
    # Load existing mapping if it exists
    mapping = {}
    if mapping_file.exists():
        with open(mapping_file, 'r', encoding='utf-8') as f:
            mapping = json.load(f)
        print(f"Loaded {len(mapping)} existing mappings")
    
    # Process each buffet
    total = len(buffets)
    matched_count = 0
    yelp_matched = 0
    ta_matched = 0
    
    for idx, (buffet_id, buffet) in enumerate(buffets.items(), 1):
        # Skip if already matched
        if buffet_id in mapping and mapping[buffet_id].get('yelp') and mapping[buffet_id].get('tripadvisor'):
            continue
        
        name = buffet.get('name', '')
        city = buffet.get('address', {}).get('city', '')
        state = buffet.get('address', {}).get('state', '')
        phone = buffet.get('phone', '')
        
        if not name or not city or not state:
            continue
        
        print(f"\n[{idx}/{total}] Matching: {name} ({city}, {state})")
        
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
        
        # Search Yelp if not already matched
        if not mapping[buffet_id].get('yelp'):
            print(f"  Searching Yelp...")
            yelp_result = search_yelp(name, city, state)
            if yelp_result:
                mapping[buffet_id]['yelp'] = yelp_result
                yelp_matched += 1
                print(f"  ✓ Found Yelp: {yelp_result['name']}")
            else:
                print(f"  ✗ Yelp: Not found")
        
        # Search TripAdvisor if not already matched
        if not mapping[buffet_id].get('tripadvisor'):
            print(f"  Searching TripAdvisor...")
            ta_result = search_tripadvisor(name, city, state)
            if ta_result:
                mapping[buffet_id]['tripadvisor'] = ta_result
                ta_matched += 1
                print(f"  ✓ Found TripAdvisor: {ta_result['name']}")
            else:
                print(f"  ✗ TripAdvisor: Not found")
        
        # Save after each match (for resume capability)
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=2, ensure_ascii=False)
        
        if mapping[buffet_id].get('yelp') or mapping[buffet_id].get('tripadvisor'):
            matched_count += 1
        
        # Progress update every 10 restaurants
        if idx % 10 == 0:
            print(f"\nProgress: {idx}/{total} processed, {matched_count} matched ({yelp_matched} Yelp, {ta_matched} TripAdvisor)")
    
    print(f"\n{'='*60}")
    print(f"Matching complete!")
    print(f"Total buffets: {total}")
    print(f"Matched: {matched_count}")
    print(f"Yelp matches: {yelp_matched}")
    print(f"TripAdvisor matches: {ta_matched}")
    print(f"Mapping saved to: {mapping_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    match_restaurants()

