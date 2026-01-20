#!/usr/bin/env python3
"""
Script to fill in neighborhood information from addresses using Nominatim (OpenStreetMap).
Free service, no API key required, but has rate limit of 1 request per second.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from typing import Optional, Dict, Any

# Nominatim API endpoint
NOMINATIM_API_URL = "https://nominatim.openstreetmap.org"

def extract_neighborhood_from_nominatim(result: Dict[str, Any]) -> Optional[str]:
    """
    Extract neighborhood name from Nominatim result.
    Neighborhood can appear as 'suburb', 'neighbourhood', 'city_district', 'quarter', etc.
    """
    if not result:
        return None
    
    address = result.get('address', {})
    
    # Priority order for neighborhood fields (most specific to least specific)
    neighborhood_fields = [
        'neighbourhood',      # Most specific
        'suburb',             # Common in many countries
        'city_district',      # City districts
        'quarter',            # Quarters/neighborhoods
        'residential',        # Residential areas
        'subdistrict',        # Sub-districts
        'district',           # Districts (less specific)
    ]
    
    for field in neighborhood_fields:
        if field in address:
            neighborhood = address[field]
            if neighborhood:
                return str(neighborhood)
    
    return None

def geocode_reverse_nominatim(lat: float, lng: float) -> Optional[str]:
    """Reverse geocode using lat/lng coordinates with Nominatim."""
    try:
        params = {
            'lat': str(lat),
            'lon': str(lng),
            'format': 'json',
            'addressdetails': '1',
            'zoom': '18'  # Higher zoom for more detailed results
        }
        url = f"{NOMINATIM_API_URL}/reverse?{urllib.parse.urlencode(params)}"
        
        # Set User-Agent header (required by Nominatim)
        request = urllib.request.Request(url)
        request.add_header('User-Agent', 'Neighborhood-Filler/1.0 (contact@example.com)')
        
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.loads(response.read().decode())
        
        if data and 'address' in data:
            return extract_neighborhood_from_nominatim(data)
        
        return None
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"  ⚠️  Rate limit exceeded. Waiting longer...")
            return None
        print(f"  HTTP Error in reverse geocoding: {e.code} - {e.reason}")
        return None
    except Exception as e:
        print(f"  Error in reverse geocoding: {type(e).__name__}: {e}")
        return None

def geocode_forward_nominatim(address: str) -> Optional[str]:
    """Forward geocode using address string with Nominatim."""
    try:
        params = {
            'q': address,
            'format': 'json',
            'addressdetails': '1',
            'limit': '1'  # Only need the first/best result
        }
        url = f"{NOMINATIM_API_URL}/search?{urllib.parse.urlencode(params)}"
        
        # Set User-Agent header (required by Nominatim)
        request = urllib.request.Request(url)
        request.add_header('User-Agent', 'Neighborhood-Filler/1.0 (contact@example.com)')
        
        with urllib.request.urlopen(request, timeout=10) as response:
            results = json.loads(response.read().decode())
        
        if results and len(results) > 0:
            return extract_neighborhood_from_nominatim(results[0])
        
        return None
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print(f"  ⚠️  Rate limit exceeded. Waiting longer...")
            return None
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
            neighborhood = geocode_reverse_nominatim(lat, lng)
            if neighborhood:
                return neighborhood
    
    # Fallback to forward geocoding with address
    address = entry.get('address')
    if address:
        return geocode_forward_nominatim(address)
    
    return None

def process_json_file(input_file: str, output_file: Optional[str] = None, batch_size: int = 50, delay: float = 1.1):
    """
    Process JSON file and fill in neighborhoods.
    
    Args:
        input_file: Path to input JSON file
        output_file: Path to output JSON file (default: overwrites input file)
        batch_size: Number of records to process before saving progress
        delay: Delay in seconds between API calls (Nominatim requires 1+ second)
    """
    if output_file is None:
        output_file = input_file
    
    print("="*60)
    print("Neighborhood Filler using Nominatim (OpenStreetMap)")
    print("="*60)
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
    print(f"Rate limit: 1 request/second (delay: {delay}s)")
    print(f"Estimated time: ~{needs_neighborhood * delay / 60:.1f} minutes")
    print()
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    consecutive_errors = 0
    max_consecutive_errors = 5
    
    start_time = time.time()
    
    for i, entry in enumerate(data, 1):
        # Skip if neighborhood already exists
        if entry.get('neighborhood'):
            continue
        
        address = entry.get('address', 'N/A')
        title = entry.get('title', 'Unknown')[:50]
        print(f"[{i}/{total}] Processing: {title}...")
        print(f"  Address: {address}")
        
        try:
            neighborhood = get_neighborhood(entry)
            
            if neighborhood:
                entry['neighborhood'] = neighborhood
                updated_count += 1
                consecutive_errors = 0
                print(f"  ✓ Found neighborhood: {neighborhood}")
            else:
                skipped_count += 1
                consecutive_errors = 0
                print(f"  ✗ No neighborhood found, skipping")
        except Exception as e:
            error_count += 1
            consecutive_errors += 1
            print(f"  ✗ Error: {type(e).__name__}: {e}")
            
            if consecutive_errors >= max_consecutive_errors:
                print(f"\n⚠️  Too many consecutive errors ({consecutive_errors}). Stopping.")
                break
        
        print()
        
        # Save progress every batch_size entries
        if i % batch_size == 0:
            elapsed = time.time() - start_time
            rate = i / elapsed if elapsed > 0 else 0
            remaining = (needs_neighborhood - updated_count - skipped_count) / rate if rate > 0 else 0
            
            print(f"Saving progress... ({i}/{total} processed)")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Progress saved. Updated: {updated_count}, Skipped: {skipped_count}, Errors: {error_count}")
            print(f"Rate: {rate:.2f} entries/sec | Est. remaining: {remaining/60:.1f} minutes")
            print()
        
        # Rate limiting - Nominatim requires at least 1 second between requests
        # Using 1.1 seconds to be safe
        time.sleep(delay)
    
    # Final save
    print("Saving final results...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    elapsed_total = time.time() - start_time
    
    print("\n" + "="*60)
    print("Processing complete!")
    print(f"Total entries: {total}")
    print(f"Updated with neighborhood: {updated_count}")
    print(f"Skipped (no neighborhood found): {skipped_count}")
    print(f"Errors: {error_count}")
    print(f"Time elapsed: {elapsed_total/60:.1f} minutes")
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
    batch_size = int(sys.argv[3]) if len(sys.argv) > 3 else 50
    
    # Optional delay (default 1.1 seconds for Nominatim rate limit)
    delay = float(sys.argv[4]) if len(sys.argv) > 4 else 1.1
    
    process_json_file(input_file, output_file, batch_size, delay)





















