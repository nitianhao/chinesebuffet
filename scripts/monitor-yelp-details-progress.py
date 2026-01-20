#!/usr/bin/env python3
"""
Monitor progress of Yelp details fetching
"""

import json
import sys
from pathlib import Path

def check_progress():
    mapping_file = Path(__file__).parent.parent / 'Example JSON' / 'yelp-restaurant-mapping.json'
    
    if not mapping_file.exists():
        print(f"Error: {mapping_file} not found")
        return None
    
    with open(mapping_file, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    
    yelp_restaurants = [
        (buffet_id, info) for buffet_id, info in mapping.items()
        if info.get('yelp') and info['yelp'].get('id')
    ]
    
    has_details = sum(1 for _, info in yelp_restaurants if info['yelp'].get('details'))
    has_attributes = sum(1 for _, info in yelp_restaurants 
                        if info['yelp'].get('details') and 
                        info['yelp']['details'].get('attributes') and
                        isinstance(info['yelp']['details']['attributes'], dict) and
                        len(info['yelp']['details']['attributes']) > 0)
    
    total = len(yelp_restaurants)
    remaining = total - has_details
    
    return {
        'total': total,
        'has_details': has_details,
        'has_attributes': has_attributes,
        'remaining': remaining,
        'pct_complete': (has_details / total * 100) if total > 0 else 0
    }

if __name__ == '__main__':
    progress = check_progress()
    
    if progress is None:
        sys.exit(1)
    
    print('=' * 60)
    print('YELP DETAILS FETCHING PROGRESS')
    print('=' * 60)
    print(f'Total Yelp matches: {progress["total"]:,}')
    print(f'Records with details: {progress["has_details"]:,} ({progress["pct_complete"]:.1f}%)')
    print(f'Records with attributes: {progress["has_attributes"]:,}')
    print(f'Remaining to process: {progress["remaining"]:,}')
    print('=' * 60)
    
    if progress['remaining'] == 0:
        print('✓ All detailed data fetched!')
        sys.exit(0)
    else:
        print('⏳ Still processing...')
        sys.exit(1)






