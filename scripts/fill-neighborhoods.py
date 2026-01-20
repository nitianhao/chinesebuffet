#!/usr/bin/env python3
"""
Script to fill in neighborhood information from addresses using Google Geocoding API.
Uses reverse geocoding with lat/lng coordinates when available, otherwise forward geocoding with address.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional, Dict, Any

# Load environment variables from .env.local if it exists
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env.local')
if os.path.exists(env_path):
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip().strip('"').strip("'")

API_KEY = os.getenv('GOOGLE_MAPS_API_KEY')
if not API_KEY:
    print("Error: GOOGLE_MAPS_API_KEY not found in environment variables")
    sys.exit(1)

GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json"

def extract_neighborhood_from_geocode(geocode_result: Dict[str, Any]) -> Optional[str]:
    """
    Extract neighborhood name from Google Geocoding API result.
    Neighborhood can appear as 'neighborhood', 'sublocality', or 'sublocality_level_1' in address_components.
    """
    if not geocode_result or 'results' not in geocode_result or not geocode_result['results']:
        return None
    
    # Get the first result (most relevant)
    result = geocode_result['results'][0]
    address_components = result.get('address_components', [])
    
    # Look for neighborhood in different component types
    neighborhood_types = ['neighborhood', 'sublocality_level_1', 'sublocality']
    
    for component in address_components:
        types = component.get('types', [])
        for neighborhood_type in neighborhood_types:
            if neighborhood_type in types:
                # Return the long_name (full name) or short_name as fallback
                return component.get('long_name') or component.get('short_name')
    
    return None

def geocode_reverse(lat: float, lng: float) -> Optional[str]:
    """Reverse geocode using lat/lng coordinates."""
    try:
        params = {
            'latlng': f"{lat},{lng}",
            'key': API_KEY
        }
        url = f"{GEOCODING_API_URL}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        status = data.get('status')
        if status == 'OK':
            return extract_neighborhood_from_geocode(data)
        elif status == 'OVER_QUERY_LIMIT':
            print(f"  ⚠️  API quota exceeded (status: {status})")
            return None
        elif status == 'ZERO_RESULTS':
            return None
        else:
            print(f"  ⚠️  Geocoding API returned status: {status}")
            return None
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error in reverse geocoding: {e.code} - {e.reason}")
        return None
    except Exception as e:
        print(f"  Error in reverse geocoding: {type(e).__name__}: {e}")
        return None

def geocode_forward(address: str) -> Optional[str]:
    """Forward geocode using address string."""
    try:
        params = {
            'address': address,
            'key': API_KEY
        }
        url = f"{GEOCODING_API_URL}?{urllib.parse.urlencode(params)}"
        with urllib.request.urlopen(url, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        status = data.get('status')
        if status == 'OK':
            return extract_neighborhood_from_geocode(data)
        elif status == 'OVER_QUERY_LIMIT':
            print(f"  ⚠️  API quota exceeded (status: {status})")
            return None
        elif status == 'ZERO_RESULTS':
            return None
        else:
            print(f"  ⚠️  Geocoding API returned status: {status}")
            return None
    except urllib.error.HTTPError as e:
        print(f"  HTTP Error in forward geocoding: {e.code} - {e.reason}")
        return None
    except Exception as e:
        print(f"  Error in forward geocoding: {type(e).__name__}: {e}")
        return None

def get_neighborhood(entry: Dict[str, Any]) -> Optional[str]:
    """
    Get neighborhood for an entry, trying reverse geocoding first, then forward geocoding.
    """
    # Try reverse geocoding with coordinates first (more accurate)
    location = entry.get('location')
    if location and isinstance(location, dict):
        lat = location.get('lat')
        lng = location.get('lng')
        if lat and lng:
            neighborhood = geocode_reverse(lat, lng)
            if neighborhood:
                return neighborhood
    
    # Fallback to forward geocoding with address
    address = entry.get('address')
    if address:
        return geocode_forward(address)
    
    return None

def process_json_file(input_file: str, output_file: Optional[str] = None, batch_size: int = 100, delay: float = 0.1):
    """
    Process JSON file and fill in neighborhoods.
    
    Args:
        input_file: Path to input JSON file
        output_file: Path to output JSON file (default: overwrites input file)
        batch_size: Number of records to process before saving progress
        delay: Delay in seconds between API calls to avoid rate limits
    """
    if output_file is None:
        output_file = input_file
    
    print(f"Loading JSON file: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    if not isinstance(data, list):
        print("Error: JSON file should contain an array of objects")
        return
    
    total = len(data)
    print(f"Total entries: {total}")
    
    # Count entries that need neighborhood
    needs_neighborhood = sum(1 for entry in data if not entry.get('neighborhood'))
    print(f"Entries needing neighborhood: {needs_neighborhood}")
    print()
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    for i, entry in enumerate(data, 1):
        # Skip if neighborhood already exists
        if entry.get('neighborhood'):
            continue
        
        address = entry.get('address', 'N/A')
        print(f"[{i}/{total}] Processing: {entry.get('title', 'Unknown')[:50]}...")
        print(f"  Address: {address}")
        
        neighborhood = get_neighborhood(entry)
        
        if neighborhood:
            entry['neighborhood'] = neighborhood
            updated_count += 1
            print(f"  ✓ Found neighborhood: {neighborhood}")
        else:
            skipped_count += 1
            print(f"  ✗ No neighborhood found, skipping")
        
        print()
        
        # Save progress every batch_size entries
        if i % batch_size == 0:
            print(f"Saving progress... ({i}/{total} processed)")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Progress saved. Updated: {updated_count}, Skipped: {skipped_count}, Errors: {error_count}")
            print()
        
        # Rate limiting - delay between API calls
        time.sleep(delay)
    
    # Final save
    print("Saving final results...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print("\n" + "="*60)
    print("Processing complete!")
    print(f"Total entries: {total}")
    print(f"Updated with neighborhood: {updated_count}")
    print(f"Skipped (no neighborhood found): {skipped_count}")
    print(f"Errors: {error_count}")
    print(f"Output saved to: {output_file}")
    print("="*60)

if __name__ == "__main__":
    input_file = "Example JSON/allcities.json"
    
    # Allow command line argument for input file
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    
    # Optional output file
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Optional batch size
    batch_size = int(sys.argv[3]) if len(sys.argv) > 3 else 100
    
    # Optional delay
    delay = float(sys.argv[4]) if len(sys.argv) > 4 else 0.1
    
    process_json_file(input_file, output_file, batch_size, delay)





















