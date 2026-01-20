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

    let countWithMenuUrl = 0;
    let countWithMenuUrlInYelp = 0;
    let countWithDirectMenuUrl = 0;
    let countWithMenuField = 0;

    // Check each buffet
    for (const buffet of buffets) {
      // Check menu field (after merge, menuUrl values are stored here)
      if (buffet.menu && typeof buffet.menu === 'string' && buffet.menu.trim()) {
        // Check if it looks like a URL (starts with http)
        if (buffet.menu.trim().startsWith('http')) {
          countWithMenuField++;
          countWithMenuUrl++;
          countWithDirectMenuUrl++;
          continue;
        }
      }
      
      // Check for direct menu_url field (legacy, will be removed after migration)
      if ((buffet as any).menu_url && (buffet as any).menu_url.trim()) {
        countWithDirectMenuUrl++;
        countWithMenuUrl++;
        continue;
      }
      
      // Check for menuUrl field (legacy, will be removed after migration)
      if ((buffet as any).menuUrl && (buffet as any).menuUrl.trim()) {
        countWithDirectMenuUrl++;
        countWithMenuUrl++;
        continue;
      }

      // Check inside yelpData JSON
      if (buffet.yelpData) {
        try {
          const yelpData = typeof buffet.yelpData === 'string' 
            ? JSON.parse(buffet.yelpData) 
            : buffet.yelpData;
          
          // Check various possible locations for menu_url
          if (yelpData?.menu_url && yelpData.menu_url.trim()) {
            countWithMenuUrlInYelp++;
            countWithMenuUrl++;
            continue;
          }
          
          if (yelpData?.details?.menu_url && yelpData.details.menu_url.trim()) {
            countWithMenuUrlInYelp++;
            countWithMenuUrl++;
            continue;
          }
        } catch (e) {
          // Invalid JSON, skip
        }
      }
    }

    const results = {
      totalBuffets: buffets.length,
      countWithMenuUrl,
      countWithDirectMenuUrl,
      countWithMenuUrlInYelp,
      countWithMenuField,
      countWithoutMenuUrl: buffets.length - countWithMenuUrl,
      percentage: ((countWithMenuUrl / buffets.length) * 100).toFixed(2) + '%',
    };

    console.log('\n=== Results ===');
    console.log(`Total buffets: ${results.totalBuffets}`);
    console.log(`Buffets with menu_url (any location): ${results.countWithMenuUrl}`);
    console.log(`  - In menu field: ${results.countWithMenuField}`);
    console.log(`  - Direct menu_url/menuUrl field (legacy): ${results.countWithDirectMenuUrl}`);
    console.log(`  - menu_url in yelpData: ${results.countWithMenuUrlInYelp}`);
    console.log(`Buffets without menu_url: ${results.countWithoutMenuUrl}`);
    console.log(`Percentage with menu_url: ${results.percentage}`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error counting menu URLs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


