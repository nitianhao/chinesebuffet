#!/usr/bin/env python3
import json

with open('Example JSON/yelp-restaurant-mapping.json', 'r') as f:
    data = json.load(f)

total = len(data)
has_attrs = 0
missing_attrs = 0
no_details = 0
no_yelp = 0

yelp_urls = []

for buffet_id, buffet_data in data.items():
    if 'yelp' not in buffet_data or buffet_data['yelp'] is None:
        no_yelp += 1
        continue
    
    yelp_data = buffet_data['yelp']
    
    if 'details' not in yelp_data or yelp_data['details'] is None:
        no_details += 1
        if 'url' in yelp_data and yelp_data['url']:
            yelp_urls.append(yelp_data['url'])
        continue
    
    details = yelp_data['details']
    
    if 'attributes' in details and details['attributes']:
        has_attrs += 1
    else:
        missing_attrs += 1
        if 'url' in yelp_data and yelp_data['url']:
            yelp_urls.append(yelp_data['url'])

print(f'Total records: {total}')
print(f'Records with Yelp data: {total - no_yelp}')
print(f'Records with details: {total - no_yelp - no_details}')
print(f'Records with attributes: {has_attrs}')
print(f'Records missing attributes: {missing_attrs}')
print(f'Records without details: {no_details}')
print(f'Records without Yelp: {no_yelp}')
print(f'\nTotal URLs to scrape: {len(yelp_urls)}')

# Save URLs for scraping
if yelp_urls:
    # Save all URLs
    with open('yelp-urls-to-scrape.json', 'w') as f:
        json.dump(yelp_urls, f, indent=2)
    print(f'All URLs saved to yelp-urls-to-scrape.json')
    
    # Also save as simple text file (one URL per line) for easy copy-paste
    with open('yelp-urls-to-scrape.txt', 'w') as f:
        for url in yelp_urls:
            f.write(url + '\n')
    print(f'URLs also saved to yelp-urls-to-scrape.txt (one per line)')

