#!/usr/bin/env python3
import json

# Read the file
with open('Example JSON/yelp-restaurant-mapping.json', 'r') as f:
    data = json.load(f)

# Clear bad attributes (where only 'undefined' key exists)
cleared = 0
for buffet_id, buffet_data in data.items():
    yelp_data = buffet_data.get('yelp')
    if not yelp_data:
        continue
    
    details = yelp_data.get('details')
    if not details:
        continue
    
    attrs = details.get('attributes')
    if not attrs or not isinstance(attrs, dict):
        continue
    
    # Check if this is the only key and it's 'undefined'
    if len(attrs) == 1 and 'undefined' in attrs:
        details['attributes'] = {}
        cleared += 1

print(f'Cleared {cleared} records with bad attributes')

# Save
with open('Example JSON/yelp-restaurant-mapping.json', 'w') as f:
    json.dump(data, f, indent=2)

print('✅ File saved')






