#!/usr/bin/env python3
"""
Restaurant Matching System (Selenium Version)
Uses Selenium to match existing buffets with Yelp and TripAdvisor listings.
This version works better with sites that block simple HTTP requests.
"""

import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote_plus
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from fuzzywuzzy import fuzz
import random

def normalize_name(name):
    """Normalize restaurant name for comparison."""
    if not name:
        return ""
    name = name.lower()
    for word in ["restaurant", "chinese", "buffet", "&", "and"]:
        name = name.replace(word, " ")
    name = " ".join(name.split())
    return name.strip()

def search_yelp_selenium(driver, name, city, state):
    """Search Yelp for a restaurant using Selenium and return business URL if found."""
    try:
        search_query = f"{name} {city} {state}"
        url = f"https://www.yelp.com/search?find_desc={quote_plus(search_query)}&find_loc={quote_plus(f'{city}, {state}')}"
        
        print(f"    Loading Yelp search page...")
        driver.get(url)
        print(f"    Waiting for page to load...")
        time.sleep(4)  # Wait for page to load (increased from 3)
        
        # Look for business links
        try:
            # Yelp uses various selectors - try common ones
            business_links = driver.find_elements(By.CSS_SELECTOR, 'a[href*="/biz/"]')
            
            best_match = None
            best_score = 0
            
            for link in business_links[:10]:  # Check first 10 results
                try:
                    href = link.get_attribute('href')
                    link_text = link.text.strip()
                    
                    if href and '/biz/' in href and link_text:
                        name_score = fuzz.ratio(normalize_name(name), normalize_name(link_text))
                        
                        if name_score > 70 and name_score > best_score:
                            best_score = name_score
                            biz_url_part = href.split('/biz/')[1].split('?')[0]
                            best_match = {
                                'id': biz_url_part,
                                'name': link_text,
                                'url': href.split('?')[0]  # Remove query params
                            }
                except:
                    continue
            
            return best_match
        except Exception as e:
            print(f"    Error parsing Yelp results: {e}")
            return None
            
    except Exception as e:
        print(f"    Error searching Yelp: {e}")
        return None

def search_tripadvisor_selenium(driver, name, city, state):
    """Search TripAdvisor for a restaurant using Selenium and return location URL if found."""
    try:
        search_query = f"{name} {city} {state}"
        url = f"https://www.tripadvisor.com/Search?q={quote_plus(search_query)}"
        
        print(f"    Loading TripAdvisor search page...")
        driver.get(url)
        print(f"    Waiting for page to load...")
        time.sleep(5)  # Wait for page to load (TripAdvisor can be slower, increased from 4)
        
        # Look for restaurant links
        try:
            # TripAdvisor uses various selectors
            restaurant_links = driver.find_elements(By.CSS_SELECTOR, 'a[href*="/Restaurant_Review-"]')
            
            best_match = None
            best_score = 0
            
            for link in restaurant_links[:10]:  # Check first 10 results
                try:
                    href = link.get_attribute('href')
                    link_text = link.text.strip()
                    
                    if href and '/Restaurant_Review-' in href and link_text:
                        name_score = fuzz.ratio(normalize_name(name), normalize_name(link_text))
                        
                        if name_score > 70 and name_score > best_score:
                            best_score = name_score
                            # Extract location ID from URL
                            parts = href.split('-')
                            if len(parts) > 1:
                                loc_id = parts[1]
                                best_match = {
                                    'id': loc_id,
                                    'name': link_text,
                                    'url': href.split('?')[0]  # Remove query params
                                }
                except:
                    continue
            
            return best_match
        except Exception as e:
            print(f"    Error parsing TripAdvisor results: {e}")
            return None
            
    except Exception as e:
        print(f"    Error searching TripAdvisor: {e}")
        return None

def match_restaurants_selenium():
    """Main function to match restaurants using Selenium."""
    # Load existing buffets
    data_path = Path(__file__).parent.parent / 'data' / 'buffets-by-id.json'
    
    if not data_path.exists():
        print(f"Error: {data_path} not found")
        return
    
    print(f"Loading buffets from {data_path}")
    with open(data_path, 'r', encoding='utf-8') as f:
        buffets = json.load(f)
    
    print(f"Loaded {len(buffets)} buffets")
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)
    
    mapping_file = output_dir / 'restaurant-mapping.json'
    
    # Load existing mapping if it exists
    mapping = {}
    if mapping_file.exists():
        with open(mapping_file, 'r', encoding='utf-8') as f:
            mapping = json.load(f)
        print(f"Loaded {len(mapping)} existing mappings")
    
    # Setup Selenium WebDriver
    print("\nInitializing Selenium WebDriver...")
    print("This may take a moment to download ChromeDriver if needed...")
    
    options = webdriver.ChromeOptions()
    # Commented out headless for debugging - uncomment when working
    # options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument('user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    driver = None
    try:
        # Try using webdriver-manager first (auto-downloads ChromeDriver)
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            from selenium.webdriver.chrome.service import Service
            print("Using webdriver-manager to auto-download ChromeDriver...")
            service = Service(ChromeDriverManager().install())
            driver = webdriver.Chrome(service=service, options=options)
            print("✓ ChromeDriver loaded via webdriver-manager")
        except ImportError:
            print("webdriver-manager not available, trying direct ChromeDriver...")
            driver = webdriver.Chrome(options=options)
            print("✓ ChromeDriver loaded directly")
        except Exception as e:
            print(f"Error with webdriver-manager: {e}")
            print("Trying direct ChromeDriver...")
            driver = webdriver.Chrome(options=options)
            print("✓ ChromeDriver loaded")
        
        # Set up stealth mode
        driver.execute_cdp_cmd('Page.addScriptToEvaluateOnNewDocument', {
            'source': '''
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined
                })
            '''
        })
        print("WebDriver initialized successfully\n")
    except Exception as e:
        print(f"\n✗ Error initializing WebDriver: {e}")
        print("\nTroubleshooting:")
        print("1. Make sure Chrome browser is installed")
        print("2. Install webdriver-manager: pip3 install webdriver-manager")
        print("3. OR install ChromeDriver manually: brew install chromedriver")
        import traceback
        traceback.print_exc()
        return
    
    # Process each buffet
    total = len(buffets)
    matched_count = 0
    yelp_matched = 0
    ta_matched = 0
    
    try:
        for idx, (buffet_id, buffet) in enumerate(buffets.items(), 1):
            # Skip if already matched
            if buffet_id in mapping and mapping[buffet_id].get('yelp') and mapping[buffet_id].get('tripadvisor'):
                continue
            
            name = buffet.get('name', '')
            city = buffet.get('address', {}).get('city', '')
            state = buffet.get('address', {}).get('state', '')
            phone = buffet.get('phone', '')
            
            if not name or not city or not state:
                continue
            
            print(f"\n[{idx}/{total}] ({idx*100//total}%) Matching: {name}")
            print(f"  Location: {city}, {state}")
            
            if buffet_id not in mapping:
                mapping[buffet_id] = {
                    'buffetId': buffet_id,
                    'buffetName': name,
                    'city': city,
                    'state': state,
                    'phone': phone,
                    'yelp': None,
                    'tripadvisor': None
                }
            
            # Search Yelp if not already matched
            if not mapping[buffet_id].get('yelp'):
                print(f"  Searching Yelp...")
                yelp_result = search_yelp_selenium(driver, name, city, state)
                if yelp_result:
                    mapping[buffet_id]['yelp'] = yelp_result
                    yelp_matched += 1
                    print(f"  ✓ Found Yelp: {yelp_result['name']}")
                else:
                    print(f"  ✗ Yelp: Not found")
                
                time.sleep(2)  # Rate limiting
            
            # Search TripAdvisor if not already matched
            if not mapping[buffet_id].get('tripadvisor'):
                print(f"  Searching TripAdvisor...")
                ta_result = search_tripadvisor_selenium(driver, name, city, state)
                if ta_result:
                    mapping[buffet_id]['tripadvisor'] = ta_result
                    ta_matched += 1
                    print(f"  ✓ Found TripAdvisor: {ta_result['name']}")
                else:
                    print(f"  ✗ TripAdvisor: Not found")
                
                time.sleep(3)  # Rate limiting
            
            # Save after each match (for resume capability)
            with open(mapping_file, 'w', encoding='utf-8') as f:
                json.dump(mapping, f, indent=2, ensure_ascii=False)
            
            if mapping[buffet_id].get('yelp') or mapping[buffet_id].get('tripadvisor'):
                matched_count += 1
            
            # Progress update every 5 restaurants with detailed stats
            if idx % 5 == 0:
                print(f"\n{'='*60}")
                print(f"Progress Update:")
                print(f"  Processed: {idx}/{total} ({idx*100//total}%)")
                print(f"  Matched: {matched_count} ({matched_count*100//idx if idx > 0 else 0}%)")
                print(f"  Yelp matches: {yelp_matched}")
                print(f"  TripAdvisor matches: {ta_matched}")
                print(f"  Estimated time remaining: {((total-idx)*5)//60} minutes")
                print(f"{'='*60}\n")
                print("Taking a short break...")
                time.sleep(5)  # Longer break every 5 restaurants
    finally:
        driver.quit()
        print("\nWebDriver closed")
    
    print(f"\n{'='*60}")
    print(f"Matching complete!")
    print(f"Total buffets: {total}")
    print(f"Matched: {matched_count}")
    print(f"Yelp matches: {yelp_matched}")
    print(f"TripAdvisor matches: {ta_matched}")
    print(f"Mapping saved to: {mapping_file}")
    print(f"{'='*60}")

if __name__ == '__main__':
    match_restaurants_selenium()

