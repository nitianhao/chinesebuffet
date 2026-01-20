/**
 * Website Testing Tool
 * 
 * Tests health department websites to understand their structure
 * Saves HTML for manual inspection
 * 
 * Usage:
 *   node scripts/health-inspection/test-website.js <url> [output-file]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const { URL } = require('url');

async function testWebsite(url, outputFile = 'website-test.html') {
  try {
    console.log(`Testing: ${url}\n`);
    
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const response = await new Promise((resolve, reject) => {
      const req = protocol.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ 
          statusCode: res.statusCode, 
          html: data, 
          headers: res.headers,
          finalUrl: res.responseUrl || url,
        }));
      });
      
      req.on('error', reject);
      req.setTimeout(20000, () => {
        req.destroy();
        reject(new Error('Request timeout after 20 seconds'));
      });
    });
    
    console.log(`Status: ${response.statusCode}`);
    console.log(`Size: ${response.html.length} bytes`);
    console.log(`Content-Type: ${response.headers['content-type'] || 'unknown'}\n`);
    
    if (response.statusCode === 200) {
      // Save HTML
      fs.writeFileSync(outputFile, response.html);
      console.log(`✓ Saved HTML to ${outputFile}\n`);
      
      // Basic analysis
      console.log('Basic Analysis:');
      console.log(`  - Contains "search": ${response.html.toLowerCase().includes('search') ? 'Yes' : 'No'}`);
      console.log(`  - Contains "form": ${response.html.toLowerCase().includes('<form') ? 'Yes' : 'No'}`);
      console.log(`  - Contains "inspection": ${response.html.toLowerCase().includes('inspection') ? 'Yes' : 'No'}`);
      console.log(`  - Contains "restaurant": ${response.html.toLowerCase().includes('restaurant') ? 'Yes' : 'No'}`);
      
      // Count forms
      const formMatches = response.html.match(/<form[^>]*>/gi);
      console.log(`  - Forms found: ${formMatches ? formMatches.length : 0}`);
      
      // Count input fields
      const inputMatches = response.html.match(/<input[^>]*>/gi);
      console.log(`  - Input fields: ${inputMatches ? inputMatches.length : 0}`);
      
      // Look for JavaScript
      const scriptMatches = response.html.match(/<script[^>]*>/gi);
      console.log(`  - Script tags: ${scriptMatches ? scriptMatches.length : 0}`);
      
      if (scriptMatches && scriptMatches.length > 5) {
        console.log(`\n⚠ Website appears to use JavaScript heavily`);
        console.log(`  Consider using Puppeteer for scraping`);
      }
      
      // Look for API endpoints
      const apiPatterns = [
        /["']([^"']*\/api\/[^"']*)["']/gi,
        /["']([^"']*\.json[^"']*)["']/gi,
        /fetch\(["']([^"']+)["']/gi,
      ];
      
      const endpoints = new Set();
      apiPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(response.html)) !== null) {
          if (match[1] && !match[1].startsWith('http')) {
            endpoints.add(match[1]);
          }
        }
      });
      
      if (endpoints.size > 0) {
        console.log(`\nPotential API endpoints found:`);
        Array.from(endpoints).slice(0, 5).forEach(endpoint => {
          console.log(`  - ${endpoint}`);
        });
      }
      
      console.log(`\n💡 Next steps:`);
      console.log(`  1. Open ${outputFile} in a browser`);
      console.log(`  2. Inspect the HTML structure`);
      console.log(`  3. Look for search forms and result containers`);
      console.log(`  4. Update scraper configuration`);
      
    } else if (response.statusCode === 301 || response.statusCode === 302) {
      const location = response.headers.location;
      console.log(`\n⚠ Redirected to: ${location}`);
      console.log(`Run again with the new URL`);
    } else {
      console.log(`\n⚠ Unexpected status code: ${response.statusCode}`);
    }
    
  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    if (error.message.includes('timeout')) {
      console.log(`\n💡 The website may:`);
      console.log(`  - Require JavaScript to load`);
      console.log(`  - Have anti-scraping measures`);
      console.log(`  - Be temporarily unavailable`);
      console.log(`\nTry using Puppeteer instead: npm install puppeteer`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const url = process.argv[2];
  const outputFile = process.argv[3] || 'website-test.html';
  
  if (!url) {
    console.log('Usage: node test-website.js <url> [output-file]');
    console.log('\nExamples:');
    console.log('  node test-website.js https://www.houstontx.gov/health/FoodService/index.html');
    console.log('  node test-website.js https://www.dallascounty.org/departments/dchhs/food-safety.php houston.html');
    process.exit(1);
  }
  
  testWebsite(url, outputFile);
}

module.exports = { testWebsite };
















