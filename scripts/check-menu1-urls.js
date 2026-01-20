// Script to check if menu1 URLs are valid (test run on first 5 records)
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const dataPath = path.join(__dirname, '..', 'data', 'buffets-urls-websites.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Function to check if a URL is valid
function checkUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve('NOK');
      return;
    }

    try {
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        method: 'HEAD', // Use HEAD to avoid downloading the full page
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = protocol.request(url, options, (res) => {
        // Consider 2xx and 3xx status codes as OK
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 400) {
          resolve('OK');
        } else if (statusCode === 404) {
          resolve('NOK');
        } else {
          // For other status codes, try GET to be sure
          const getReq = protocol.get(url, { timeout: 10000 }, (getRes) => {
            if (getRes.statusCode >= 200 && getRes.statusCode < 400) {
              resolve('OK');
            } else {
              resolve('NOK');
            }
          });
          getReq.on('error', () => resolve('NOK'));
          getReq.on('timeout', () => {
            getReq.destroy();
            resolve('NOK');
          });
        }
      });

      req.on('error', (error) => {
        console.log(`  Error checking ${url}: ${error.message}`);
        resolve('NOK');
      });

      req.on('timeout', () => {
        req.destroy();
        console.log(`  Timeout checking ${url}`);
        resolve('NOK');
      });

      req.end();
    } catch (error) {
      console.log(`  Invalid URL format: ${url}`);
      resolve('NOK');
    }
  });
}

async function checkMenu1Urls() {
  // Filter records that don't have menu1_check yet
  const recordsToCheck = data.filter(r => !r.menu1_check && r.menu1);
  const totalRecords = recordsToCheck.length;
  const startTime = Date.now();
  
  console.log(`Checking ${totalRecords} menu1 URLs...`);
  console.log(`(Skipping ${data.length - totalRecords} records that already have menu1_check or no menu1 URL)`);
  console.log(`Estimated time: ~${Math.ceil(totalRecords * 1.5 / 60)} minutes\n`);

  let processed = 0;
  let okCount = 0;
  let nokCount = 0;

  for (let i = 0; i < recordsToCheck.length; i++) {
    const record = recordsToCheck[i];
    processed++;
    
    // Find ALL records with the same PlaceID (handle duplicates)
    const recordIndices = data
      .map((r, idx) => r.PlaceID === record.PlaceID ? idx : -1)
      .filter(idx => idx !== -1);
    
    if (recordIndices.length === 0) continue;
    
    console.log(`[${processed}/${totalRecords}] ${record.Name}`);
    console.log(`   URL: ${record.menu1}`);
    if (recordIndices.length > 1) {
      console.log(`   ⚠️  Found ${recordIndices.length} duplicate(s) with same PlaceID - updating all`);
    }
    
    try {
      const checkResult = await checkUrl(record.menu1);
      // Update ALL records with the same PlaceID
      recordIndices.forEach(idx => {
        data[idx].menu1_check = checkResult;
      });
      
      if (checkResult === 'OK') {
        okCount++;
      } else {
        nokCount++;
      }
      
      console.log(`   Result: ${checkResult} (OK: ${okCount}, NOK: ${nokCount})\n`);
    } catch (error) {
      console.log(`   Error: ${error.message}`);
      data[recordIndex].menu1_check = 'NOK';
      nokCount++;
    }
    
    // Save progress after every record for immediate visibility
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
    if (processed % 10 === 0) {
      console.log(`💾 Progress saved (${processed}/${totalRecords} processed)\n`);
    }
    
    // Delay to avoid overwhelming servers and rate limiting
    // Random delay between 0.5-1.5 seconds (reduced for faster processing)
    const delay = 500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Show progress every 10 records
    if (processed % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const avgTime = (elapsed / processed).toFixed(1);
      const remaining = totalRecords - processed;
      const estimatedTime = ((remaining * avgTime) / 60).toFixed(1);
      console.log(`⏱️  Progress: ${processed}/${totalRecords} (${((processed/totalRecords)*100).toFixed(1)}%) | Elapsed: ${elapsed}s | Est. remaining: ~${estimatedTime} min\n`);
    }
  }

  // Final save
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');

  console.log('\n✅ Check complete!');
  console.log(`\nSummary:`);
  console.log(`   Total checked: ${processed}`);
  console.log(`   OK: ${okCount}`);
  console.log(`   NOK: ${nokCount}`);
  console.log(`\nResults saved to: ${dataPath}`);
}

checkMenu1Urls().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

