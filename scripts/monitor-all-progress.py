#!/usr/bin/env python3
"""
Monitor both matching and detailed data fetching progress
"""

import json
from pathlib import Path

def check_progress():
    mapping_file = Path('data/restaurant-mapping.json')
    input_file = Path('data/all-buffets-for-matching.json')
    
    if not input_file.exists():
        print("Error: Input file not found")
        return
    
    with open(input_file, 'r') as f:
        all_buffets = json.load(f)
    
    total_restaurants = len(all_buffets)
    
    if mapping_file.exists():
        with open(mapping_file, 'r') as f:
            mapping = json.load(f)
        
        processed = len(mapping)
        yelp_matched = sum(1 for v in mapping.values() if v.get('yelp'))
        yelp_with_details = sum(1 for v in mapping.values() if v.get('yelp') and v['yelp'].get('details'))
        remaining = total_restaurants - processed
        api_calls_used = processed
        api_calls_remaining = max(0, 5000 - processed)
        
        print(f"{'='*70}")
        print(f"Yelp Data Enrichment Progress")
        print(f"{'='*70}")
        print(f"Total restaurants: {total_restaurants:,}")
        print(f"")
        print(f"MATCHING:")
        print(f"  Processed: {processed:,} ({processed*100//total_restaurants}%)")
        print(f"  Yelp matches: {yelp_matched:,} ({yelp_matched*100//processed if processed > 0 else 0}%)")
        print(f"  Remaining: {remaining:,}")
        print(f"")
        print(f"DETAILED DATA:")
        print(f"  Yelp matches with details: {yelp_with_details:,} / {yelp_matched:,}")
        if yelp_matched > 0:
            print(f"  Details complete: {yelp_with_details*100//yelp_matched}%")
        print(f"")
        print(f"API Usage:")
        print(f"  Used today: ~{api_calls_used:,} / 5,000")
        print(f"  Remaining: ~{api_calls_remaining:,}")
        
        if remaining <= 0:
            print(f"\n{'='*70}")
            print("✓ ALL RESTAURANTS PROCESSED!")
            print(f"{'='*70}")
            return True
        elif processed >= 5000:
            print(f"\n{'='*70}")
            print("⚠ REACHED DAILY API LIMIT")
            print(f"  Processed {processed:,} restaurants today")
            print(f"  {remaining:,} remaining - resume tomorrow")
            print(f"{'='*70}")
            return True
        else:
            estimated_minutes = (remaining * 0.2) / 60
            print(f"\n⏳ Estimated time remaining: ~{estimated_minutes:.1f} minutes")
            print(f"{'='*70}")
            return False
    else:
        print("No mapping file found - process hasn't started yet")
        return False

if __name__ == '__main__':
    import sys
    done = check_progress()
    sys.exit(0 if done else 1)
















