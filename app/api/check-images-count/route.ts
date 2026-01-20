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
    
    let allBuffets = [];
    let offset = 0;
    const limit = 1000;
    
    // Fetch all buffets in batches
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

    const buffets = allBuffets;
    console.log(`\nTotal buffets: ${buffets.length}\n`);

    let countWithImages = 0;
    let countWithEmptyImages = 0;
    let countWithNullImages = 0;
    let totalImageCount = 0;

    // Check each buffet
    for (const buffet of buffets) {
      if (!buffet.images) {
        countWithNullImages++;
        continue;
      }

      // Parse images if it's a string (JSON)
      let imagesArray = null;
      if (typeof buffet.images === 'string') {
        try {
          const parsed = JSON.parse(buffet.images);
          if (Array.isArray(parsed)) {
            imagesArray = parsed;
          }
        } catch (e) {
          // Not valid JSON, treat as empty
          countWithEmptyImages++;
          continue;
        }
      } else if (Array.isArray(buffet.images)) {
        imagesArray = buffet.images;
      }

      // Check if images array has any valid entries
      if (imagesArray && imagesArray.length > 0) {
        // Filter out empty/null entries
        const validImages = imagesArray.filter(img => {
          if (!img) return false;
          // Check if it's an object with photoUrl
          if (typeof img === 'object' && img.photoUrl) {
            return img.photoUrl.trim().length > 0;
          }
          // Check if it's a string URL
          if (typeof img === 'string') {
            return img.trim().length > 0;
          }
          return false;
        });

        if (validImages.length > 0) {
          countWithImages++;
          totalImageCount += validImages.length;
        } else {
          countWithEmptyImages++;
        }
      } else {
        countWithEmptyImages++;
      }
    }

    const results = {
      totalBuffets: buffets.length,
      countWithImages,
      countWithEmptyImages: countWithNullImages + countWithEmptyImages,
      countWithNullImages,
      countWithEmptyArrays: countWithEmptyImages,
      totalImageCount,
      averageImagesPerBuffet: countWithImages > 0 ? Number((totalImageCount / countWithImages).toFixed(2)) : 0,
      percentage: ((countWithImages / buffets.length) * 100).toFixed(2) + '%',
    };

    console.log('=== Results ===');
    console.log(`Total buffets: ${results.totalBuffets}`);
    console.log(`Buffets with images (non-empty): ${results.countWithImages}`);
    console.log(`Buffets with empty/null images: ${results.countWithEmptyImages}`);
    console.log(`  - Null/undefined images: ${results.countWithNullImages}`);
    console.log(`  - Empty arrays or invalid data: ${results.countWithEmptyArrays}`);
    console.log(`Total images across all buffets: ${results.totalImageCount}`);
    console.log(`Average images per buffet (with images): ${results.averageImagesPerBuffet}`);
    console.log(`Percentage with images: ${results.percentage}`);

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error counting images:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
