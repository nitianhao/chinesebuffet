// Script to count buffets with questionsAndAnswers filled
// Run with: node check-questions-and-answers-count.js
const { init } = require('@instantdb/admin');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local or env.local.txt if it exists
const envPaths = [
  path.join(__dirname, '.env.local'),
  path.join(process.cwd(), '.env.local'),
  path.join(__dirname, 'env.local.txt'),
  path.join(process.cwd(), 'env.local.txt'),
];

for (const envPath of envPaths) {
  try {
    if (fs.existsSync(envPath)) {
      const envFile = fs.readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=:#]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      break; // Stop after first successful load
    }
  } catch (error) {
    // Continue to next path
  }
}

// Try to load schema, but it's optional
let schema;
try {
  schema = require('./src/instant.schema.ts');
} catch (e) {
  // Schema is optional for this query
  schema = null;
}

async function countQuestionsAndAnswers() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
  }

  const dbConfig = {
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken: process.env.INSTANT_ADMIN_TOKEN,
  };

  if (schema) {
    dbConfig.schema = schema.default || schema;
  }

  const db = init(dbConfig);

  console.log('Fetching all buffets...');
  
  // Fetch all buffets in batches since there might be many
  let allBuffets = [];
  let offset = 0;
  const limit = 1000;
  
  while (true) {
    const result = await db.query({
      buffets: {
        $: {
          limit: limit,
          offset: offset,
        }
      }
    });
    
    const buffets = result.buffets || [];
    if (buffets.length === 0) break;
    
    allBuffets = allBuffets.concat(buffets);
    console.log(`  Fetched ${allBuffets.length} buffets so far...`);
    
    if (buffets.length < limit) break;
    offset += limit;
  }

  console.log(`\nTotal buffets: ${allBuffets.length}`);

  let countWithQnA = 0;
  let countWithValidQnA = 0;
  let countWithEmptyQnA = 0;

  // Check each buffet
  for (const buffet of allBuffets) {
    // Check if questionsAndAnswers field exists and is not null/empty
    if (buffet.questionsAndAnswers) {
      const qnaStr = buffet.questionsAndAnswers.trim();
      
      // Check if it's not just an empty string
      if (qnaStr.length > 0 && qnaStr !== 'null' && qnaStr !== '[]' && qnaStr !== '{}') {
        countWithQnA++;
        
        // Try to parse as JSON to check if it's valid
        try {
          const qna = JSON.parse(qnaStr);
          // Check if it's a non-empty array
          if (Array.isArray(qna) && qna.length > 0) {
            countWithValidQnA++;
          } else if (qna && typeof qna === 'object' && Object.keys(qna).length > 0) {
            // Also count non-empty objects
            countWithValidQnA++;
          } else {
            countWithEmptyQnA++;
          }
        } catch (e) {
          // Invalid JSON but has content, count it anyway
          countWithValidQnA++;
        }
      } else {
        countWithEmptyQnA++;
      }
    }
  }

  console.log('\n=== Results ===');
  console.log(`Total buffets: ${allBuffets.length}`);
  console.log(`Buffets with questionsAndAnswers field filled: ${countWithQnA}`);
  console.log(`  - Valid questionsAndAnswers (non-empty array/object): ${countWithValidQnA}`);
  console.log(`  - Empty/invalid questionsAndAnswers: ${countWithEmptyQnA}`);
  console.log(`Buffets without questionsAndAnswers: ${allBuffets.length - countWithQnA}`);
  console.log(`Percentage with questionsAndAnswers: ${((countWithQnA / allBuffets.length) * 100).toFixed(2)}%`);
  
  return {
    total: allBuffets.length,
    withQuestionsAndAnswers: countWithQnA,
    withValidQuestionsAndAnswers: countWithValidQnA,
    withoutQuestionsAndAnswers: allBuffets.length - countWithQnA,
    percentage: ((countWithQnA / allBuffets.length) * 100).toFixed(2)
  };
}

countQuestionsAndAnswers().then(results => {
  console.log('\nSummary:', results);
  process.exit(0);
}).catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
