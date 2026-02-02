/**
 * On-demand revalidation API for ISR cache invalidation.
 *
 * Call when buffet data changes (webhook, cron, or manual) to invalidate:
 * - Page HTML cache (revalidatePath)
 * - Transform cache (revalidateTag)
 *
 * Usage:
 *   POST /api/revalidate?secret=<REVALIDATE_SECRET>&buffet=salem-or/golden-dragon
 *   POST /api/revalidate?secret=<REVALIDATE_SECRET>&path=/chinese-buffets/salem-or/golden-dragon
 *   POST /api/revalidate?secret=<REVALIDATE_SECRET>&tag=buffet-transforms-salem-or-golden-dragon
 *   POST /api/revalidate?secret=<REVALIDATE_SECRET>&tag=buffet-transforms  (all transforms)
 *
 * Env: REVALIDATE_SECRET (required for auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    let path = searchParams.get('path');
    let tag = searchParams.get('tag');
    const buffet = searchParams.get('buffet'); // shorthand: cityState/slug

    const expectedSecret = process.env.REVALIDATE_SECRET;
    if (!expectedSecret || secret !== expectedSecret) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    // Shorthand: buffet=salem-or/golden-dragon -> path + tags (transforms + schema)
    if (buffet) {
      const [cityState, slug] = buffet.split('/');
      if (cityState && slug) {
        path = path || `/chinese-buffets/${cityState}/${slug}`;
        tag = tag || `buffet-transforms-${cityState}-${slug}`;
      }
    }

    const invalidated: string[] = [];

    if (path) {
      revalidatePath(path);
      invalidated.push(`path:${path}`);
    }

    if (tag) {
      revalidateTag(tag);
      invalidated.push(`tag:${tag}`);
    }

    // When buffet shorthand used, also invalidate schema cache
    if (buffet) {
      const [cityState, slug] = buffet.split('/');
      if (cityState && slug) {
        const schemaTag = `seo-jsonld-${cityState}-${slug}`;
        revalidateTag(schemaTag);
        invalidated.push(`tag:${schemaTag}`);
      }
    }

    if (invalidated.length === 0) {
      return NextResponse.json(
        { error: 'Provide buffet, path, and/or tag query param' },
        { status: 400 }
      );
    }

    return NextResponse.json({ revalidated: invalidated });
  } catch (err) {
    console.error('[revalidate] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Revalidation failed' },
      { status: 500 }
    );
  }
}
