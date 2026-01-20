#!/usr/bin/env python3
"""
Script to fill in neighborhood information from addresses using free geocoding services.
Uses multiple fallback methods:
1. Nominatim (OpenStreetMap) - primary
2. Address string parsing - fallback
3. Retry logic for failed requests
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
import re
from typing import Optional, Dict, Any

# Nominatim API endpoint
NOMINATIM_API_URL = "https://nominatim.openstreetmap.org"

def extract_neighborhood_from_nominatim(result: Dict[str, Any]) -> Optional[str]:
    """Extract neighborhood name from Nominatim result."""
    if not result:
        return None
    
    address = result.get('address', {})
    
    # Priority order for neighborhood fields
    neighborhood_fields = [
        'neighbourhood',
        'suburb',
        'city_district',
        'quarter',
        'residential',
        'subdistrict',
        'district',
    ]
    
    for field in neighborhood_fields:
        if field in address:
            neighborhood = address[field]
            if neighborhood:
                return str(neighborhood)
    
    return None

def geocode_reverse_nominatim(lat: float, lng: float, retries: int = 3) -> Optional[str]:
    """Reverse geocode using lat/lng coordinates with Nominatim."""
    for attempt in range(retries):
        try:
            params = {
                'lat': str(lat),
                'lon': str(lng),
                'format': 'json',
                'addressdetails': '1',
                'zoom': '18'
            }
            url = f"{NOMINATIM_API_URL}/reverse?{urllib.parse.urlencode(params)}"
            
            request = urllib.request.Request(url)
            request.add_header('User-Agent', 'Neighborhood-Filler/1.0')
            
            with urllib.request.urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode())
            
            if data and 'address' in data:
                return extract_neighborhood_from_nominatim(data)
            
            return None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 2  # Exponential backoff
                print(f"  ⚠️  Rate limit (429). Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            elif e.code == 503:
                wait_time = (attempt + 1) * 2
                print(f"  ⚠️  Service unavailable (503). Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            elif e.code == 403:
                print(f"  ⚠️  Forbidden (403). Skipping Nominatim for this entry.")
                return None
            else:
                if attempt < retries - 1:
                    time.sleep(1)
                    continue
                print(f"  HTTP Error: {e.code} - {e.reason}")
                return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return None
    
    return None

def geocode_forward_nominatim(address: str, retries: int = 3) -> Optional[str]:
    """Forward geocode using address string with Nominatim."""
    for attempt in range(retries):
        try:
            params = {
                'q': address,
                'format': 'json',
                'addressdetails': '1',
                'limit': '1'
            }
            url = f"{NOMINATIM_API_URL}/search?{urllib.parse.urlencode(params)}"
            
            request = urllib.request.Request(url)
            request.add_header('User-Agent', 'Neighborhood-Filler/1.0')
            
            with urllib.request.urlopen(request, timeout=15) as response:
                results = json.loads(response.read().decode())
            
            if results and len(results) > 0:
                return extract_neighborhood_from_nominatim(results[0])
            
            return None
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait_time = (attempt + 1) * 2
                print(f"  ⚠️  Rate limit (429). Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            elif e.code == 503:
                wait_time = (attempt + 1) * 2
                print(f"  ⚠️  Service unavailable (503). Waiting {wait_time}s...")
                time.sleep(wait_time)
                continue
            elif e.code == 403:
                print(f"  ⚠️  Forbidden (403). Skipping Nominatim for this entry.")
                return None
            else:
                if attempt < retries - 1:
                    time.sleep(1)
                    continue
                print(f"  HTTP Error: {e.code} - {e.reason}")
                return None
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(1)
                continue
            return None
    
    return None

def parse_neighborhood_from_address(address: str, city: str = None) -> Optional[str]:
    """
    Try to extract neighborhood from address string.
    Some addresses contain neighborhood names before the city.
    Example: "123 Main St, SoHo, New York, NY 10001"
    """
    if not address:
        return None
    
    # Remove common suffixes
    address_clean = address.replace(', USA', '').strip()
    
    # Split by commas
    parts = [p.strip() for p in address_clean.split(',')]
    
    # If we have at least 3 parts: street, [neighborhood?], city, state, zip
    # The neighborhood would typically be between street and city
    if len(parts) >= 3:
        # Check if there's a potential neighborhood between street and city
        # This is a heuristic - neighborhoods are often short capitalized words/phrases
        potential_neighborhood = parts[1] if len(parts) > 1 else None
        
        if potential_neighborhood:
            # Skip if it looks like a state abbreviation or zip code
            if re.match(r'^[A-Z]{2}$', potential_neighborhood) or re.match(r'^\d{5}', potential_neighborhood):
                return None
            
            # Skip if it's clearly a city name (matches the city field)
            if city and potential_neighborhood.lower() == city.lower():
                return None
            
            # If it's a short capitalized phrase, it might be a neighborhood
            if len(potential_neighborhood.split()) <= 3 and potential_neighborhood[0].isupper():
                # Common neighborhood indicators
                neighborhood_indicators = ['Heights', 'Park', 'Square', 'Village', 'Hills', 'Beach', 'Bay', 'North', 'South', 'East', 'West', 'Central']
                if any(indicator in potential_neighborhood for indicator in neighborhood_indicators):
                    return potential_neighborhood
                
                # If it's a single capitalized word (not a number), might be neighborhood
                if len(potential_neighborhood.split()) == 1 and potential_neighborhood.isalpha():
                    return potential_neighborhood
    
    return None

def get_neighborhood(entry: Dict[str, Any]) -> Optional[str]:
    """
    Get neighborhood for an entry using multiple methods.
    """
    # Method 1: Try reverse geocoding with coordinates (most accurate)
    location = entry.get('location')
    if location and isinstance(location, dict):
        lat = location.get('lat')
        lng = location.get('lng')
        if lat and lng:
            neighborhood = geocode_reverse_nominatim(lat, lng)
            if neighborhood:
                return neighborhood
    
    # Method 2: Try forward geocoding with address
    address = entry.get('address')
    if address:
        neighborhood = geocode_forward_nominatim(address)
        if neighborhood:
            return neighborhood
        
        # Method 3: Try parsing neighborhood from address string
        city = entry.get('city')
        neighborhood = parse_neighborhood_from_address(address, city)
        if neighborhood:
            return neighborhood
    
    return None

def process_json_file(input_file: str, output_file: Optional[str] = None, batch_size: int = 50, delay: float = 1.2):
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
    
    # If output is same as input, create a backup first
    if output_file == input_file:
        backup_file = input_file + '.backup'
        print(f"Creating backup: {backup_file}")
        import shutil
        shutil.copy2(input_file, backup_file)
        print("Backup created.")
    
    print("="*60)
    print("Neighborhood Filler (Free Services)")
    print("Using: Nominatim + Address Parsing")
    print("="*60)
    print(f"Loading JSON file: {input_file}")
    
    # Try loading with error recovery
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"⚠️  JSON parsing error: {e.msg} at line {e.lineno}, column {e.colno}")
        print("Attempting to load with error recovery...")
        # Try reading the file and fixing common issues
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Handle "Extra data" error - might be duplicate content
        if "Extra data" in str(e):
            print("  Detected 'Extra data' error - trying to find valid JSON boundary...")
            # Try to find where valid JSON ends
            try:
                # Use the position from the error
                if hasattr(e, 'pos') and e.pos:
                    test_content = content[:e.pos]
                    data = json.loads(test_content)
                    print(f"  ✓ Successfully loaded JSON up to position {e.pos} ({len(data)} entries)")
                else:
                    # Try parsing up to the error line
                    lines = content.split('\n')
                    if e.lineno and e.lineno <= len(lines):
                        test_content = '\n'.join(lines[:e.lineno-1])
                        # Find the last complete entry
                        # Remove incomplete last entry
                        test_content = test_content.rstrip().rstrip(',')
                        # Close brackets
                        open_braces = test_content.count('{') - test_content.count('}')
                        open_brackets = test_content.count('[') - test_content.count(']')
                        test_content += '\n' + ('}' * max(0, open_braces)) + (']' * max(0, open_brackets))
                        data = json.loads(test_content)
                        print(f"  ✓ Successfully loaded JSON up to line {e.lineno-1} ({len(data)} entries)")
            except Exception as e2:
                print(f"  ✗ Recovery failed: {e2}")
                raise Exception("JSON file appears corrupted. Please check the file integrity.")
        else:
            # Try to fix trailing commas and other common issues
            try:
                import re
                # Remove trailing commas
                fixed = re.sub(r',\s*([}\]])', r'\1', content)
                data = json.loads(fixed)
                print(f"  ✓ Fixed and loaded JSON ({len(data)} entries)")
            except:
                raise Exception("JSON file appears corrupted. Please check the file integrity.")
    
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
    max_consecutive_errors = 10
    
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
        except KeyboardInterrupt:
            print("\n\n⚠️  Interrupted by user. Saving progress...")
            break
        except Exception as e:
            error_count += 1
            consecutive_errors += 1
            print(f"  ✗ Error: {type(e).__name__}: {e}")
            
            if consecutive_errors >= max_consecutive_errors:
                print(f"\n⚠️  Too many consecutive errors ({consecutive_errors}).")
                print("   This might indicate service issues. Continuing anyway...")
                consecutive_errors = 0  # Reset and continue
        
        print()
        
        # Save progress every batch_size entries
        if i % batch_size == 0:
            elapsed = time.time() - start_time
            processed = updated_count + skipped_count
            rate = processed / elapsed if elapsed > 0 else 0
            remaining = (needs_neighborhood - processed) * delay / 60 if rate > 0 else 0
            
            print(f"Saving progress... ({i}/{total} processed)")
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"Progress saved. Updated: {updated_count}, Skipped: {skipped_count}, Errors: {error_count}")
            if rate > 0:
                print(f"Rate: {rate:.2f} entries/sec | Est. remaining: {remaining:.1f} minutes")
            print()
        
        # Rate limiting - Nominatim requires at least 1 second between requests
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
    
    # Optional delay (default 1.2 seconds for Nominatim rate limit)
    delay = float(sys.argv[4]) if len(sys.argv) > 4 else 1.2
    
    process_json_file(input_file, output_file, batch_size, delay)





















