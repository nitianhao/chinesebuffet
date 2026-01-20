#!/usr/bin/env python3
"""
Quick script to check how many restaurants need matching and estimate API usage
"""

import json
import sys
from pathlib import Path

def check_matching_status():
    # Check input file
    input_file = Path(__file__).parent.parent / 'data' / 'all-buffets-for-matching.json'
    if not input_file.exists():
        input_file = Path(__file__).parent.parent / 'data' / 'buffets-by-id.json'
    
    if not input_file.exists():
        print(f"Error: No input file found. Expected:")
        print(f"  - data/all-buffets-for-matching.json (full database)")
        print(f"  - data/buffets-by-id.json (processed subset)")
        return
    
    print(f"Loading from: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        buffets = json.load(f)
    
    total = len(buffets)
    print(f"\nTotal restaurants in file: {total:,}")
    
    # Check existing mapping
    mapping_file = Path(__file__).parent.parent / 'data' / 'restaurant-mapping.json'
    mapping = {}
    if mapping_file.exists():
        with open(mapping_file, 'r', encoding='utf-8') as f:
            mapping = json.load(f)
        
        matched = sum(1 for v in mapping.values() if v.get('yelp'))
        print(f"Already matched: {matched:,}")
        print(f"Remaining: {total - matched:,}")
    else:
        print("No existing mapping file found")
        matched = 0
    
    # Calculate API usage
    remaining = total - matched
    daily_limit = 5000
    
    print(f"\n{'='*60}")
    print("Yelp API Usage Estimate:")
    print(f"{'='*60}")
    print(f"Daily API limit (free tier): {daily_limit:,} calls")
    print(f"Remaining restaurants to match: {remaining:,}")
    
    if remaining > 0:
        days_needed = (remaining + daily_limit - 1) // daily_limit  # Ceiling division
        print(f"\nEstimated days needed: {days_needed}")
        print(f"  Day 1: {min(daily_limit, remaining):,} restaurants")
        if days_needed > 1:
            for day in range(2, days_needed + 1):
                day_remaining = remaining - (day - 1) * daily_limit
                if day_remaining > 0:
                    print(f"  Day {day}: {min(daily_limit, day_remaining):,} restaurants")
        
        # Time estimate (assuming 0.2s per request)
        time_per_request = 0.2
        total_seconds = remaining * time_per_request
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        print(f"\nEstimated total time: ~{hours}h {minutes}m (if running continuously)")
        print(f"  Per day: ~{min(daily_limit, remaining) * time_per_request / 60:.1f} minutes")
    
    print(f"{'='*60}")

if __name__ == '__main__':
    check_matching_status()
















