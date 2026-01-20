#!/bin/bash

# Install dependencies for health inspection web scraping

echo "Installing Health Inspection Scraping Dependencies"
echo "=================================================="
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

echo "📦 Installing Node.js packages..."
echo ""

# Install Cheerio for HTML parsing
echo "Installing cheerio..."
npm install cheerio --save-dev

# Install Puppeteer for browser automation
echo ""
echo "Installing puppeteer..."
echo "⚠ This may take a few minutes as it downloads Chromium..."
npm install puppeteer --save-dev

echo ""
echo "✅ Installation complete!"
echo ""
echo "You can now run:"
echo "  node scripts/health-inspection/scrape-houston-working.js"
echo ""
















