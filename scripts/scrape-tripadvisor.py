#!/usr/bin/env python3
"""
TripAdvisor Scraper
Scrapes comprehensive data from TripAdvisor for matched restaurants.
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
import re

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
        'Referer': 'https://www.tripadvisor.com/',
    }

def scrape_tripadvisor_restaurant(restaurant_url, use_selenium=True):
    """
    Scrape TripAdvisor restaurant page for all available data.
    
    Args:
        restaurant_url: TripAdvisor restaurant URL
        use_selenium: Whether to use Selenium (recommended for TripAdvisor)
    
    Returns:
        Dictionary with scraped data
    """
    data = {
        'url': restaurant_url,
        'scrapedAt': time.strftime('%Y-%m-%d %H:%M:%S'),
        'error': None
    }
    
    try:
        if use_selenium:
            # TripAdvisor heavily uses JavaScript, so Selenium is recommended
            options = webdriver.ChromeOptions()
            options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_experimental_option("excludeSwitches", ["enable-automation"])
            options.add_experimental_option('useAutomationExtension', False)
            options.add_argument(f'user-agent={random.choice(USER_AGENTS)}')
            
            driver = webdriver.Chrome(options=options)
            driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
                'source': '''
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined
                    })
                '''
            })
            
            driver.get(restaurant_url)
            
            # Wait for page to load
            time.sleep(5)
            
            # Try to scroll to load more content
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(2)
            
            soup = BeautifulSoup(driver.page_source, 'html.parser')
            driver.quit()
        else:
            # Try with requests first (may not work for all content)
            response = requests.get(restaurant_url, headers=get_headers(), timeout=15)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
        
        # Extract restaurant name
        name_elem = soup.find('h1', class_=lambda x: x and ('heading' in x.lower() or 'title' in x.lower()))
        if not name_elem:
            name_elem = soup.find('h1')
        if name_elem:
            data['name'] = name_elem.get_text(strip=True)
        
        # Extract rating
        rating_elem = soup.find('span', class_=lambda x: x and 'rating' in x.lower())
        if rating_elem:
            rating_class = rating_elem.get('class', [])
            # TripAdvisor uses classes like "ui_bubble_rating bubble_50" for 5.0 rating
            for cls in rating_class:
                if 'bubble_' in cls:
                    rating_num = cls.split('_')[-1]
                    try:
                        data['rating'] = float(rating_num) / 10.0
                        break
                    except:
                        pass
        
        # Extract review count
        review_count_text = soup.find(text=re.compile(r'\d+\s+review', re.I))
        if review_count_text:
            review_match = re.search(r'(\d+)', review_count_text)
            if review_match:
                data['reviewCount'] = int(review_match.group(1))
        
        # Extract price range
        price_elem = soup.find(text=re.compile(r'\$\$?\$?\$?', re.I))
        if price_elem:
            data['priceRange'] = price_elem.strip()
        
        # Extract address
        address_elem = soup.find('span', class_=lambda x: x and 'address' in x.lower()) or soup.find('address')
        if address_elem:
            data['address'] = address_elem.get_text(strip=True, separator=', ')
        
        # Extract phone
        phone_elem = soup.find(text=re.compile(r'\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', re.I))
        if phone_elem:
            phone_match = re.search(r'\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', phone_elem)
            if phone_match:
                data['phone'] = phone_match.group(0)
        
        # Extract website
        website_elem = soup.find('a', href=lambda x: x and x.startswith('http') and 'tripadvisor' not in x and 'javascript' not in x)
        if website_elem:
            href = website_elem.get('href', '')
            if href.startswith('http'):
                data['website'] = href
        
        # Extract cuisine types
        cuisines = []
        cuisine_elems = soup.find_all('a', href=lambda x: x and '/Restaurants-' in x)
        for elem in cuisine_elems:
            cuisine_text = elem.get_text(strip=True)
            if cuisine_text and len(cuisine_text) < 50:  # Filter out long texts
                cuisines.append(cuisine_text)
        if cuisines:
            data['cuisines'] = list(set(cuisines))  # Remove duplicates
        
        # Extract hours
        hours = {}
        hours_section = soup.find('div', class_=lambda x: x and ('hours' in x.lower() or 'schedule' in x.lower()))
        if hours_section:
            hour_rows = hours_section.find_all('div') or hours_section.find_all('tr')
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
        photo_elems = soup.find_all('img', src=lambda x: x and ('tripadvisor' in x or 'media' in x))
        for img in photo_elems[:30]:  # Limit to 30 photos
            img_url = img.get('src', '') or img.get('data-src', '')
            if img_url and img_url.startswith('http') and img_url not in photos:
                photos.append(img_url)
        if photos:
            data['photos'] = photos
        
        # Extract features
        features = []
        features_section = soup.find('div', class_=lambda x: x and ('feature' in x.lower() or 'amenity' in x.lower() or 'detail' in x.lower()))
        if features_section:
            feature_items = features_section.find_all('div') or features_section.find_all('span')
            for item in feature_items:
                text = item.get_text(strip=True)
                if text and len(text) < 100:
                    features.append(text)
        if features:
            data['features'] = list(set(features))
        
        # Extract popular dishes/mentions
        dishes = []
        dishes_section = soup.find('div', class_=lambda x: x and ('dish' in x.lower() or 'mention' in x.lower()))
        if dishes_section:
            dish_items = dishes_section.find_all('span') or dishes_section.find_all('div')
            for item in dish_items:
                text = item.get_text(strip=True)
                if text and len(text) < 50:
                    dishes.append(text)
        if dishes:
            data['popularDishes'] = list(set(dishes))[:10]  # Limit to 10
        
        # Extract reviews (first page)
        reviews = []
        reviews_section = soup.find('div', class_=lambda x: x and 'review' in x.lower())
        if reviews_section:
            review_items = reviews_section.find_all('div', class_=lambda x: x and 'review' in x.lower())[:10]
            for item in review_items:
                review = {}
                
                # Review text
                text_elem = item.find('p', class_=lambda x: x and 'partial' in x.lower()) or item.find('q')
                if text_elem:
                    review['text'] = text_elem.get_text(strip=True)
                
                # Rating
                rating_elem = item.find('span', class_=lambda x: x and 'bubble' in x.lower())
                if rating_elem:
                    rating_class = rating_elem.get('class', [])
                    for cls in rating_class:
                        if 'bubble_' in cls:
                            rating_num = cls.split('_')[-1]
                            try:
                                review['rating'] = float(rating_num) / 10.0
                                break
                            except:
                                pass
                
                # Author
                author_elem = item.find('div', class_=lambda x: x and 'username' in x.lower())
                if author_elem:
                    review['author'] = author_elem.get_text(strip=True)
                
                # Date
                date_elem = item.find('span', class_=lambda x: x and 'ratingDate' in x.lower())
                if date_elem:
                    review['date'] = date_elem.get_text(strip=True)
                
                # Title
                title_elem = item.find('span', class_=lambda x: x and 'noQuotes' in x.lower())
                if title_elem:
                    review['title'] = title_elem.get_text(strip=True)
                
                if review.get('text') or review.get('title'):
                    reviews.append(review)
        
        if reviews:
            data['reviews'] = reviews
        
        # Extract ranking/awards
        ranking_elem = soup.find(text=re.compile(r'#\d+', re.I))
        if ranking_elem:
            rank_match = re.search(r'#(\d+)', ranking_elem)
            if rank_match:
                data['ranking'] = int(rank_match.group(1))
        
    except Exception as e:
        data['error'] = str(e)
        print(f"  Error scraping {restaurant_url}: {e}")
        import traceback
        traceback.print_exc()
    
    return data

def scrape_tripadvisor_from_mapping(batch_size=10, delay=3, use_selenium=True):
    """Scrape TripAdvisor data for all restaurants in the mapping file."""
    # Load mapping
    mapping_path = Path(__file__).parent.parent / 'data' / 'restaurant-mapping.json'
    
    if not mapping_path.exists():
        print(f"Error: {mapping_path} not found. Run match-restaurants.py first.")
        return
    
    with open(mapping_path, 'r', encoding='utf-8') as f:
        mapping = json.load(f)
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data' / 'tripadvisor-data'
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Filter restaurants with TripAdvisor matches
    ta_restaurants = [
        (buffet_id, info) for buffet_id, info in mapping.items()
        if info.get('tripadvisor') and info['tripadvisor'].get('url')
    ]
    
    print(f"Found {len(ta_restaurants)} restaurants with TripAdvisor matches")
    
    processed = 0
    for buffet_id, info in ta_restaurants:
        ta_info = info['tripadvisor']
        restaurant_url = ta_info['url']
        output_file = output_dir / f"{buffet_id}.json"
        
        # Skip if already scraped
        if output_file.exists():
            print(f"[{processed + 1}/{len(ta_restaurants)}] Skipping {buffet_id} (already scraped)")
            processed += 1
            continue
        
        print(f"[{processed + 1}/{len(ta_restaurants)}] Scraping {info['buffetName']}...")
        print(f"  URL: {restaurant_url}")
        
        data = scrape_tripadvisor_restaurant(restaurant_url, use_selenium=use_selenium)
        
        # Add mapping info
        data['buffetId'] = buffet_id
        data['buffetName'] = info['buffetName']
        data['tripadvisorId'] = ta_info.get('id')
        data['tripadvisorName'] = ta_info.get('name')
        
        # Save to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        processed += 1
        
        # Rate limiting
        if processed < len(ta_restaurants):
            sleep_time = delay + random.uniform(1, 2)
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
    parser = argparse.ArgumentParser(description='Scrape TripAdvisor data for restaurants')
    parser.add_argument('--batch', type=int, default=10, help='Batch size (default: 10)')
    parser.add_argument('--delay', type=float, default=3, help='Delay between requests in seconds (default: 3)')
    parser.add_argument('--no-selenium', action='store_true', help='Do not use Selenium (not recommended)')
    
    args = parser.parse_args()
    scrape_tripadvisor_from_mapping(batch_size=args.batch, delay=args.delay, use_selenium=not args.no_selenium)
















