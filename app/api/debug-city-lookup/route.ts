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

function normalizeForIndex(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rawQuery = searchParams.get('q') || 'new york';
  const normalizedQuery = normalizeForIndex(rawQuery);

  try {
    const db = getAdminDb();
    const result = await db.query({
      cities: {
        $: {
          where: { searchName: { $like: `%${normalizedQuery}%` } },
          limit: 200,
        },
      },
    });

    const cityRows = (result.cities || []) as Array<{
      id: string;
      city?: string;
      stateAbbr?: string;
      slug?: string;
      population?: number;
      rank?: number;
      searchName?: string;
    }>;

    const matches = cityRows.slice(0, 20).map((city) => ({
      id: city.id,
      city: city.city || '',
      stateAbbr: city.stateAbbr || '',
      slug: city.slug || '',
      population: typeof city.population === 'number' ? city.population : null,
      rank: typeof city.rank === 'number' ? city.rank : null,
      searchName: city.searchName || '',
    }));

    return NextResponse.json({
      q: rawQuery,
      qn: normalizedQuery,
      totalCount: cityRows.length,
      matches,
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}
