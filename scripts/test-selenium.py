#!/usr/bin/env python3
"""
Quick test script to verify Selenium setup works
"""

import sys
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

print("Testing Selenium setup...")

options = Options()
options.add_argument('--headless=new')
options.add_argument('--no-sandbox')
options.add_argument('--disable-dev-shm-usage')

try:
    # Try webdriver-manager first
    try:
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.chrome.service import Service
        print("Using webdriver-manager...")
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=options)
        print("✓ ChromeDriver loaded via webdriver-manager")
    except ImportError:
        print("webdriver-manager not available, trying direct...")
        driver = webdriver.Chrome(options=options)
        print("✓ ChromeDriver loaded directly")
    
    # Test: Navigate to a simple page
    print("\nTesting navigation...")
    driver.get("https://www.google.com")
    print(f"✓ Page loaded: {driver.title}")
    
    driver.quit()
    print("\n✓ Selenium test successful!")
    sys.exit(0)
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
















