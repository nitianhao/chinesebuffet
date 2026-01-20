#!/usr/bin/env python3
"""
Script to enrich yelp-restaurant-mapping.json with menu_url from Unwrangle API

This script:
1. Reads yelp-restaurant-mapping.json
2. Finds records missing menu_url (up to 100)
3. Calls Unwrangle API to fetch menu_url for each
4. Updates the JSON file with retrieved menu_url values
5. Stops when credits are exhausted
"""

import json
import os
import sys
import requests
import time
from pathlib import Path
import urllib3

# Disable SSL warnings (we're disabling verification due to sandbox SSL issues)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration
UNWRANGLE_API_KEY = "1325d80868061c25ab2fb9b32852430279fba26d"
UNWRANGLE_API_URL = "https://data.unwrangle.com/api/getter/"
CREDIT_LIMIT = 100
BATCH_SIZE = 100  # Process up to 100 records

# File paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
JSON_FILE = PROJECT_ROOT / "Example JSON" / "yelp-restaurant-mapping.json"


def clean_yelp_url(url):
    """Clean Yelp URL to base URL without query parameters"""
    if not url:
        return None
    # Remove query parameters
    base_url = url.split('?')[0]
    return base_url


def find_records_missing_menu_url(data, limit=100):
    """Find records that are missing menu_url"""
    missing_records = []
    
    for buffet_id, record in data.items():
        # Check if yelp exists and has details with attributes
        if not record.get('yelp'):
            continue
        
        yelp_data = record['yelp']
        
        # Need Yelp URL to fetch menu
        yelp_url = yelp_data.get('url')
        if not yelp_url:
            continue
        
        # Check if menu_url already exists
        menu_url = None
        if yelp_data.get('details') and yelp_data['details'].get('attributes'):
            menu_url = yelp_data['details']['attributes'].get('menu_url')
        
        # Only include if menu_url is missing or empty
        if not menu_url or menu_url.strip() == "":
            missing_records.append({
                'buffet_id': buffet_id,
                'yelp_url': clean_yelp_url(yelp_url),
                'buffet_name': record.get('buffetName', 'Unknown')
            })
            
            if len(missing_records) >= limit:
                break
    
    return missing_records


def fetch_menu_url_from_unwrangle(yelp_url):
    """Fetch menu_url from Unwrangle API for a given Yelp URL"""
    try:
        # Make request to Unwrangle API
        params = {
            'platform': 'yelp_detail',
            'url': yelp_url,
            'api_key': UNWRANGLE_API_KEY
        }
        
        headers = {
            'Authorization': f'Token {UNWRANGLE_API_KEY}'
        }
        
        # Disable SSL verification due to sandbox SSL certificate issues
        response = requests.get(UNWRANGLE_API_URL, params=params, headers=headers, timeout=30, verify=False)
        
        if response.status_code == 200:
            data = response.json()
            # Extract menu_url from response
            # The structure may vary, so we'll check common paths
            menu_url = None
            
            # Try different possible paths in the response
            if isinstance(data, dict):
                # Check attributes.menu_url
                if data.get('attributes') and isinstance(data['attributes'], dict) and data['attributes'].get('menu_url'):
                    menu_url = data['attributes']['menu_url']
                # Check menu_url at root
                elif data.get('menu_url'):
                    menu_url = data['menu_url']
                # Check details.attributes.menu_url
                elif data.get('details') and isinstance(data['details'], dict) and data['details'].get('attributes') and isinstance(data['details']['attributes'], dict) and data['details']['attributes'].get('menu_url'):
                    menu_url = data['details']['attributes']['menu_url']
                # Debug: print first response structure to understand format
                # (only print once to avoid spam)
                if not hasattr(fetch_menu_url_from_unwrangle, '_debug_printed'):
                    print(f"  [DEBUG] Response keys: {list(data.keys())}")
                    if 'attributes' in data:
                        print(f"  [DEBUG] Attributes keys: {list(data['attributes'].keys()) if isinstance(data['attributes'], dict) else 'Not a dict'}")
                    fetch_menu_url_from_unwrangle._debug_printed = True
            
            return menu_url, None
        elif response.status_code == 402 or response.status_code == 403:
            # Payment required or forbidden - out of credits
            return None, "OUT_OF_CREDITS"
        elif response.status_code == 429:
            # Rate limited
            return None, "RATE_LIMITED"
        else:
            # Other error
            error_msg = f"HTTP {response.status_code}: {response.text[:200]}"
            return None, error_msg
            
    except requests.exceptions.RequestException as e:
        return None, f"Request error: {str(e)}"
    except json.JSONDecodeError as e:
        return None, f"JSON decode error: {str(e)}"
    except Exception as e:
        return None, f"Unexpected error: {str(e)}"


def update_record_menu_url(data, buffet_id, menu_url):
    """Update a record's menu_url in the data structure"""
    if buffet_id not in data:
        return False
    
    record = data[buffet_id]
    yelp_data = record.get('yelp')
    
    if not yelp_data:
        return False
    
    # Ensure details.attributes structure exists
    if 'details' not in yelp_data:
        yelp_data['details'] = {}
    if 'attributes' not in yelp_data['details']:
        yelp_data['details']['attributes'] = {}
    
    # Set menu_url
    yelp_data['details']['attributes']['menu_url'] = menu_url
    
    return True


def save_json_file(data, filepath):
    """Save JSON data to file with proper formatting"""
    # Create backup
    backup_path = str(filepath) + '.backup'
    if filepath.exists():
        import shutil
        shutil.copy2(filepath, backup_path)
        print(f"Created backup: {backup_path}")
    
    # Write JSON file
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Saved updated JSON to: {filepath}")


def main():
    print("=" * 60)
    print("Unwrangle Menu URL Enrichment Script")
    print("=" * 60)
    print(f"API Key: {UNWRANGLE_API_KEY[:20]}...")
    print(f"Credit Limit: {CREDIT_LIMIT}")
    print(f"JSON File: {JSON_FILE}")
    print()
    
    # Check if file exists
    if not JSON_FILE.exists():
        print(f"ERROR: JSON file not found: {JSON_FILE}")
        sys.exit(1)
    
    # Load JSON data
    print("Loading JSON data...")
    try:
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(f"Loaded {len(data)} records")
    except Exception as e:
        print(f"ERROR: Failed to load JSON file: {e}")
        sys.exit(1)
    
    # Find records missing menu_url
    print(f"\nFinding records missing menu_url (limit: {BATCH_SIZE})...")
    missing_records = find_records_missing_menu_url(data, limit=BATCH_SIZE)
    print(f"Found {len(missing_records)} records missing menu_url")
    
    if len(missing_records) == 0:
        print("No records need menu_url enrichment. Exiting.")
        return
    
    # Show first few records
    print("\nFirst 5 records to process:")
    for i, rec in enumerate(missing_records[:5], 1):
        print(f"  {i}. {rec['buffet_name']} - {rec['yelp_url']}")
    
    if len(missing_records) > 5:
        print(f"  ... and {len(missing_records) - 5} more")
    
    # Confirm before proceeding (skip if --yes flag is provided)
    auto_continue = '--yes' in sys.argv or '--auto' in sys.argv
    if not auto_continue:
        print(f"\nReady to process {len(missing_records)} records.")
        print("This will consume API credits. Press Enter to continue or Ctrl+C to cancel...")
        try:
            input()
        except KeyboardInterrupt:
            print("\nCancelled by user.")
            return
        except EOFError:
            print("\nNon-interactive mode detected. Auto-continuing...")
    else:
        print(f"\nReady to process {len(missing_records)} records. Auto-continuing...")
    
    # Process records
    print("\n" + "=" * 60)
    print("Processing records...")
    print("=" * 60)
    
    successful = 0
    failed = 0
    out_of_credits = False
    credits_used = 0
    
    for i, record in enumerate(missing_records, 1):
        buffet_id = record['buffet_id']
        yelp_url = record['yelp_url']
        buffet_name = record['buffet_name']
        
        print(f"\n[{i}/{len(missing_records)}] Processing: {buffet_name}")
        print(f"  Yelp URL: {yelp_url}")
        
        menu_url, error = fetch_menu_url_from_unwrangle(yelp_url)
        credits_used += 1
        
        if error == "OUT_OF_CREDITS":
            print(f"  ❌ Out of credits! Stopping.")
            out_of_credits = True
            break
        elif error:
            print(f"  ❌ Error: {error}")
            failed += 1
        elif menu_url:
            # Update the record
            if update_record_menu_url(data, buffet_id, menu_url):
                print(f"  ✅ Menu URL found: {menu_url}")
                successful += 1
            else:
                print(f"  ❌ Failed to update record")
                failed += 1
        else:
            print(f"  ⚠️  No menu_url in response")
            failed += 1
        
        # Small delay to avoid rate limiting
        if i < len(missing_records) and not out_of_credits:
            time.sleep(0.5)
    
    # Save results
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"Credits used: {credits_used}/{CREDIT_LIMIT}")
    print(f"Successful: {successful}")
    print(f"Failed: {failed}")
    print(f"Stopped due to credits: {'Yes' if out_of_credits else 'No'}")
    
    if successful > 0:
        print("\nSaving updated JSON file...")
        save_json_file(data, JSON_FILE)
        print("✅ JSON file updated successfully!")
    else:
        print("\nNo updates to save.")
    
    if out_of_credits:
        print("\n⚠️  Script stopped because credits were exhausted.")
        print(f"   Processed {credits_used} records before stopping.")


if __name__ == "__main__":
    main()

