import { NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export async function GET() {
  if (!process.env.INSTANT_ADMIN_TOKEN) {
    return NextResponse.json({ error: 'INSTANT_ADMIN_TOKEN is required' }, { status: 500 });
  }

  try {
    const db = init({
      appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
      adminToken: process.env.INSTANT_ADMIN_TOKEN,
      schema: schema.default || schema,
    });

    console.log('Fetching all buffets...');
    
    // Fetch all buffets with a high limit
    const result = await db.query({
      buffets: {
        $: {
          limit: 10000,
        }
      }
    });

    const buffets = result.buffets || [];
    console.log(`Total buffets: ${buffets.length}`);

    let countWithYelpData = 0;
    let countWithValidYelpData = 0;
    let countWithEmptyYelpData = 0;

    // Check each buffet
    for (const buffet of buffets) {
      // Check if yelpData field exists and is not null/empty
      if (buffet.yelpData) {
        const yelpDataStr = buffet.yelpData.trim();
        
        // Check if it's not just an empty string
        if (yelpDataStr.length > 0) {
          countWithYelpData++;
          
          // Try to parse as JSON to check if it's valid
          try {
            const yelpData = JSON.parse(yelpDataStr);
            // Check if it's not just an empty object
            if (yelpData && typeof yelpData === 'object' && Object.keys(yelpData).length > 0) {
              countWithValidYelpData++;
            } else {
              countWithEmptyYelpData++;
            }
          } catch (e) {
            // Invalid JSON but has content, count it anyway
            countWithValidYelpData++;
          }
        }
      }
    }

    const results = {
      totalBuffets: buffets.length,
      countWithYelpData,
      countWithValidYelpData,
      countWithEmptyYelpData,
      countWithoutYelpData: buffets.length - countWithYelpData,
      percentage: ((countWithYelpData / buffets.length) * 100).toFixed(2) + '%',
    };

    console.log('\n=== Results ===');
    console.log(`Total buffets: ${results.totalBuffets}`);
    console.log(`Buffets with yelpData field filled: ${results.countWithYelpData}`);
    console.log(`  - Valid yelpData (non-empty JSON): ${results.countWithValidYelpData}`);
    console.log(`  - Empty/invalid yelpData: ${results.countWithEmptyYelpData}`);
    console.log(`Buffets without yelpData: ${results.countWithoutYelpData}`);
    console.log(`Percentage with yelpData: ${results.percentage}`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error counting yelpData:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
