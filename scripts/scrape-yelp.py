#!/usr/bin/env python3
"""
Yelp Scraper
Scrapes comprehensive data from Yelp for matched restaurants.
"""

import json
import os
import sys
import time
import argparse
from pathlib import Path
from urllib.parse import urljoin, quote_plus
import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import random

# User agents for rotation
USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

def get_headers():
    """Get random headers with User-Agent."""
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }

def scrape_yelp_business(business_url, use_selenium=False):
    """
    Scrape Yelp business page for all available data.
    
    Args:
        business_url: Yelp business URL
        use_selenium: Whether to use Selenium for JavaScript-rendered content
    
    Returns:
        Dictionary with scraped data
    """
    data = {
        'url': business_url,
        'scrapedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
        'error': None
    }
    
    try:
        if use_selenium:
            # Use Selenium for dynamic content
            options = webdriver.ChromeOptions()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument(f'user-agent={random.choice(USER_AGENTS)}')
            
            driver = webdriver.Chrome(options=options)
            driver.get(business_url)
            
            # Wait for page to load
            time.sleep(3)
            
            # Try to extract data from page source
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            driver.quit()
        else:
            # Use requests + BeautifulSoup
            response = requests.get(business_url, headers=get_headers(), timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract business name
        name_elem = soup.find('h1')
        if name_elem:
            data['name'] = name_elem.get_text(strip=True)
        
        # Extract rating and review count
        rating_elem = soup.find('div', class_=lambda x: x and 'rating' in x.lower())
        if rating_elem:
            rating_text = rating_elem.get_text(strip=True)
            # Try to extract rating number
            import re
            rating_match = re.search(r'(\d+\.?\d*)', rating_text)
            if rating_match:
                data['rating'] = float(rating_match.group(1))
        
        # Extract review count
        review_count_elem = soup.find(text=lambda t: t and 'review' in t.lower() and any(char.isdigit() for char in t))
        if review_count_elem:
            import re
            review_match = re.search(r'(\d+)', review_count_elem)
            if review_match:
                data['reviewCount'] = int(review_match.group(1))
        
        # Extract price range
        price_elem = soup.find('span', class_=lambda x: x and 'price' in x.lower())
        if price_elem:
            price_text = price_elem.get_text(strip=True)
            data['priceRange'] = price_text
        
        # Extract address
        address_elem = soup.find('address') or soup.find('div', class_=lambda x: x and 'address' in x.lower())
        if address_elem:
            data['address'] = address_elem.get_text(strip=True, separator=' ')
        
        # Extract phone
        phone_elem = soup.find('p', class_=lambda x: x and 'phone' in x.lower()) or soup.find(text=lambda t: t and re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', t))
        if phone_elem:
            if isinstance(phone_elem, str):
                import re
                phone_match = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', phone_elem)
                if phone_match:
                    data['phone'] = phone_match.group(0)
            else:
                data['phone'] = phone_elem.get_text(strip=True)
        
        # Extract website
        website_elem = soup.find('a', href=lambda x: x and x.startswith('http') and 'yelp' not in x)
        if website_elem:
            data['website'] = website_elem.get('href', '')
        
        # Extract categories
        categories = []
        category_elems = soup.find_all('a', class_=lambda x: x and 'category' in x.lower())
        for elem in category_elems:
            cat_text = elem.get_text(strip=True)
            if cat_text:
                categories.append(cat_text)
        if categories:
            data['categories'] = categories
        
        # Extract hours
        hours = {}
        hours_section = soup.find('div', class_=lambda x: x and ('hours' in x.lower() or 'schedule' in x.lower()))
        if hours_section:
            # Try to parse hours table
            hour_rows = hours_section.find_all('tr') or hours_section.find_all('div')
            for row in hour_rows:
                day_elem = row.find('span') or row.find('td')
                time_elem = row.find('span', class_=lambda x: x and 'time' in x.lower()) or row.find('td')
                if day_elem and time_elem:
                    day = day_elem.get_text(strip=True)
                    time_str = time_elem.get_text(strip=True)
                    if day and time_str:
                        hours[day] = time_str
        if hours:
            data['hours'] = hours
        
        # Extract photos (URLs)
        photos = []
        photo_elems = soup.find_all('img', src=lambda x: x and ('yelp' in x or 'biz_photos' in x))
        for img in photo_elems[:20]:  # Limit to 20 photos
            img_url = img.get('src', '')
            if img_url and img_url not in photos:
                photos.append(img_url)
        if photos:
            data['photos'] = photos
        
        # Extract attributes
        attributes = {}
        # Look for attributes section
        attrs_section = soup.find('div', class_=lambda x: x and ('attribute' in x.lower() or 'amenity' in x.lower()))
        if attrs_section:
            attr_items = attrs_section.find_all('div') or attrs_section.find_all('span')
            for item in attr_items:
                text = item.get_text(strip=True)
                if text:
                    attributes[text] = True
        if attributes:
            data['attributes'] = attributes
        
        # Extract reviews (first page only - can be extended)
        reviews = []
        reviews_section = soup.find('div', class_=lambda x: x and 'review' in x.lower())
        if reviews_section:
            review_items = reviews_section.find_all('div', class_=lambda x: x and 'review' in x.lower())[:10]  # Limit to 10 reviews
            for item in review_items:
                review = {}
                
                # Review text
                text_elem = item.find('p') or item.find('span', class_=lambda x: x and 'comment' in x.lower())
                if text_elem:
                    review['text'] = text_elem.get_text(strip=True)
                
                # Rating
                rating_elem = item.find('div', class_=lambda x: x and 'rating' in x.lower())
                if rating_elem:
                    import re
                    rating_match = re.search(r'(\d+)', rating_elem.get('aria-label', '') or rating_elem.get_text())
                    if rating_match:
                        review['rating'] = int(rating_match.group(1))
                
                # Author
                author_elem = item.find('a', class_=lambda x: x and 'user' in x.lower())
                if author_elem:
                    review['author'] = author_elem.get_text(strip=True)
                
                # Date
                date_elem = item.find('span', class_=lambda x: x and 'date' in x.lower())
                if date_elem:
                    review['date'] = date_elem.get_text(strip=True)
                
                if review.get('text'):
                    reviews.append(review)
        
        if reviews:
            data['reviews'] = reviews
        
    except Exception as e:
        data['error'] = str(e)
        print(f"  Error scraping {business_url}: {e}")
    
    return data

def scrape_yelp_from_mapping(batch_size=10, delay=3, use_selenium=False):
    """Scrape Yelp data for all restaurants in the mapping file."""
    # Load mapping
    mapping_path = Path(__file__).parent.parent / 'data' / 'restaurant-mapping.json'
    
    if not mapping_path.exists():
        print(f"Error: {mapping_path} not found. Run match-restaurants.py first.")
        return
    
    with open(mapping_path, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data' / 'yelp-data'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Filter restaurants with Yelp matches
    yelp_restaurants = [
        (buffet_id, info) for buffet_id, info in mapping.items()
        if info.get('yelp') and info['yelp'].get('url')
    ]
    
    print(f"Found {len(yelp_restaurants)} restaurants with Yelp matches")
    
    processed = 0
    for buffet_id, info in yelp_restaurants:
        yelp_info = info['yelp']
        business_url = yelp_info['url']
        output_file = output_dir / f"{buffet_id}.json"
        
        # Skip if already scraped
        if output_file.exists():
            print(f"[{processed + 1}/{len(yelp_restaurants)}] Skipping {buffet_id} (already scraped)")
            processed += 1
            continue
        
        print(f"[{processed + 1}/{len(yelp_restaurants)}] Scraping {info['buffetName']}...")
        print(f"  URL: {business_url}")
        
        data = scrape_yelp_business(business_url, use_selenium=use_selenium)
        
        # Add mapping info
        data['buffetId'] = buffet_id
        data['buffetName'] = info['buffetName']
        data['yelpId'] = yelp_info.get('id')
        data['yelpName'] = yelp_info.get('name')
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        processed += 1
        
        # Rate limiting
        if processed < len(yelp_restaurants):
            sleep_time = delay + random.uniform(0, 1)
            print(f"  Waiting {sleep_time:.1f}s...")
            time.sleep(sleep_time)
        
        # Batch processing
        if processed >= batch_size:
            print(f"\nProcessed {processed} restaurants. Taking a longer break...")
            time.sleep(delay * 2)
            break
    
    print(f"\nScraping complete! Processed {processed} restaurants.")
    print(f"Data saved to: {output_dir}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Scrape Yelp data for restaurants')
    parser.add_argument('--batch', type=int, default=10, help='Batch size (default: 10)')
    parser.add_argument('--delay', type=float, default=3, help='Delay between requests in seconds (default: 3)')
    parser.add_argument('--selenium', action='store_true', help='Use Selenium for JavaScript-rendered content')
    
    args = parser.parse_args()
    scrape_yelp_from_mapping(batch_size=args.batch, delay=args.delay, use_selenium=args.selenium)
















