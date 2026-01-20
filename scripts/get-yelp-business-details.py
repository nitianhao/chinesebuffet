#!/usr/bin/env python3
"""
Fetch detailed business information from Yelp Fusion API Business Details endpoint
This gets additional data not available in the search endpoint.
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
import requests

def get_business_details(api_key, business_id):
    """Get detailed business information from Yelp Business Details API."""
    try:
        url = f"https://api.yelp.com/v3/businesses/{business_id}"
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json"
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 401:
            return {"error": "Authentication failed"}
        elif response.status_code == 404:
            return {"error": "Business not found"}
        elif response.status_code != 200:
            return {"error": f"API error: {response.status_code}"}
        
        data = response.json()
        
        # Extract valuable fields not in search endpoint
        details = {
            'hours': data.get('hours'),  # Operating hours
            'photos': data.get('photos', []),  # Photo URLs (up to all available)
            'review_count': data.get('review_count', 0),
            'rating': data.get('rating'),
            'price': data.get('price'),
            'is_closed': data.get('is_closed', False),
            'url': data.get('url'),
            'coordinates': data.get('coordinates'),  # lat/lng
            'location': {
                'address1': data.get('location', {}).get('address1'),
                'address2': data.get('location', {}).get('address2'),
                'address3': data.get('location', {}).get('address3'),
                'city': data.get('location', {}).get('city'),
                'state': data.get('location', {}).get('state'),
                'zip_code': data.get('location', {}).get('zip_code'),
                'country': data.get('location', {}).get('country'),
                'display_address': data.get('location', {}).get('display_address', []),
                'cross_streets': data.get('location', {}).get('cross_streets'),
            },
            'phone': data.get('phone'),
            'display_phone': data.get('display_phone'),
            'photos_count': len(data.get('photos', [])),
            'transactions': data.get('transactions', []),  # delivery, pickup, restaurant_reservation
            'specialties': {
                'restaurant': data.get('specialties', {}).get('restaurant'),
            } if data.get('specialties') else None,
            'attributes': data.get('attributes'),  # Various business attributes
        }
        
        # Get review excerpts (3 reviews, 160 chars each from search, but more detail available)
        # Note: Full reviews require scraping, but we can get review excerpts
        reviews_data = data.get('reviews', [])  # If available
        if reviews_data:
            details['review_excerpts'] = [
                {
                    'text': r.get('text', '')[:160],  # First 160 chars
                    'rating': r.get('rating'),
                    'time_created': r.get('time_created'),
                    'user': {
                        'name': r.get('user', {}).get('name'),
                        'image_url': r.get('user', {}).get('image_url'),
                    }
                }
                for r in reviews_data[:3]  # First 3 reviews
            ]
        
        return details
        
    except Exception as e:
        return {"error": str(e)}

def fetch_details_for_matched_restaurants(api_key, batch_size=50, delay=0.1):
    """Fetch detailed business info for all restaurants with Yelp matches."""
    # Load mapping
    mapping_file = Path(__file__).parent.parent / 'Example JSON' / 'yelp-restaurant-mapping.json'
    
    if not mapping_file.exists():
        print(f"Error: {mapping_file} not found. Run matching script first.")
        return
    
    with open(mapping_file, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    
    print(f"Loaded {len(mapping)} restaurant mappings\n")
    
    # Filter restaurants with Yelp matches
    yelp_restaurants = [
        (buffet_id, info) for buffet_id, info in mapping.items()
        if info.get('yelp') and info['yelp'].get('id')
    ]
    
    print(f"Found {len(yelp_restaurants)} restaurants with Yelp matches\n")
    
    # Process in batches
    processed = 0
    errors = 0
    
    for idx, (buffet_id, info) in enumerate(yelp_restaurants, 1):
        yelp_info = info['yelp']
        business_id = yelp_info.get('id')
        
        # Skip if we already have detailed data
        if yelp_info.get('details'):
            continue
        
        print(f"[{idx}/{len(yelp_restaurants)}] Fetching details for: {info['buffetName']}")
        
        details = get_business_details(api_key, business_id)
        
        if 'error' in details:
            print(f"  ✗ Error: {details['error']}")
            errors += 1
        else:
            # Add details to yelp info
            yelp_info['details'] = details
            print(f"  ✓ Got details: {details.get('photos_count', 0)} photos, hours: {bool(details.get('hours'))}")
        
        processed += 1
        
        # Save after each batch
        if processed % batch_size == 0:
            with open(mapping_file, 'w', encoding='utf-8') as f:
                json.dump(mapping, f, indent=2, ensure_ascii=False)
            print(f"\n  Saved progress ({processed}/{len(yelp_restaurants)} processed)\n")
        
        # Rate limiting
        time.sleep(delay)
    
    # Final save
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
    
    print(f"\n{'='*60}")
    print(f"Details fetching complete!")
    print(f"Processed: {processed}/{len(yelp_restaurants)}")
    print(f"Errors: {errors}")
    print(f"Saved to: {mapping_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Fetch detailed Yelp business information')
    parser.add_argument('--api-key', help='Yelp Fusion API key', 
                       default=os.environ.get('YELP_API_KEY'))
    parser.add_argument('--batch', type=int, default=50, help='Save after N restaurants (default: 50)')
    parser.add_argument('--delay', type=float, default=0.1, help='Delay between requests in seconds (default: 0.1)')
    
    args = parser.parse_args()
    
    if not args.api_key:
        print("Error: Yelp API key required!")
        print("Set YELP_API_KEY environment variable or use --api-key")
        sys.exit(1)
    
    fetch_details_for_matched_restaurants(args.api_key, batch_size=args.batch, delay=args.delay)











