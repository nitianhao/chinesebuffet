import { NextRequest, NextResponse } from 'next/server';
import { init } from '@instantdb/admin';
import schema from '@/src/instant.schema';

export const runtime = 'nodejs';

let cachedDb: ReturnType<typeof init> | null = null;

function getAdminDb() {
  if (cachedDb) return cachedDb;

  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required for server-side search');
  }

  cachedDb = init({
    appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID || '709e0e09-3347-419b-8daa-bad6889e480d',
    adminToken,
    schema: schema.default || schema,
  });

  return cachedDb;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  try {
    const db = getAdminDb();
    const result = await db.query({
      cities: {
        $: {
          where: { slug },
          limit: 1,
        },
      },
    });

    const city = (result.cities || [])[0] as
      | {
          id: string;
          city?: string;
          stateAbbr?: string;
          state?: string;
          slug?: string;
          population?: number;
          rank?: number;
          searchName?: string;
        }
      | undefined;

    if (!city) {
      return NextResponse.json({ slug, found: false, city: null });
    }

    return NextResponse.json({
      slug,
      found: true,
      city: {
        id: city.id,
        city: city.city || '',
        stateAbbr: city.stateAbbr || '',
        state: city.state || '',
        slug: city.slug || '',
        population: typeof city.population === 'number' ? city.population : null,
        rank: typeof city.rank === 'number' ? city.rank : null,
        searchName: city.searchName || '',
      },
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}
