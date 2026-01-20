#!/usr/bin/env python3
"""
Monitor the Yelp matching progress and notify when done for today
"""

import json
import time
import sys
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
        matched = sum(1 for v in mapping.values() if v.get('yelp'))
        remaining = total_restaurants - processed
        api_calls_used = processed
        api_calls_remaining = max(0, 5000 - processed)
        
        print(f"{'='*60}")
        print(f"Yelp Matching Progress")
        print(f"{'='*60}")
        print(f"Total restaurants: {total_restaurants:,}")
        print(f"Processed: {processed:,} ({processed*100//total_restaurants}%)")
        print(f"Matched: {matched:,} ({matched*100//processed if processed > 0 else 0}%)")
        print(f"Remaining: {remaining:,}")
        print(f"")
        print(f"API Usage:")
        print(f"  Used today: ~{api_calls_used:,} / 5,000")
        print(f"  Remaining: ~{api_calls_remaining:,}")
        
        if remaining <= 0:
            print(f"\n{'='*60}")
            print("✓ ALL RESTAURANTS PROCESSED!")
            print(f"{'='*60}")
            return True
        elif processed >= 5000:
            print(f"\n{'='*60}")
            print("⚠ REACHED DAILY API LIMIT")
            print(f"  Processed {processed:,} restaurants today")
            print(f"  {remaining:,} remaining - resume tomorrow")
            print(f"{'='*60}")
            return True
        else:
            estimated_minutes = (remaining * 0.2) / 60
            print(f"\n⏳ Estimated time remaining: ~{estimated_minutes:.1f} minutes")
            print(f"{'='*60}")
            return False
    else:
        print("No mapping file found - matching hasn't started yet")
        return False

if __name__ == '__main__':
    done = check_progress()
    sys.exit(0 if done else 1)
















