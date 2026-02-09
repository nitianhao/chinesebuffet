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
    appId:
      process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
      process.env.INSTANT_APP_ID ||
      '709e0e09-3347-419b-8daa-bad6889e480d',
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
  const qRaw = searchParams.get('q') || 'new';
  const qn = normalizeForIndex(qRaw);
  const useContains = qn.length >= 3;
  const pattern = useContains ? `%${qn}%` : `${qn}%`;

  try {
    const db = getAdminDb();
    const [searchNameResult, cityResult, nyResult] = await Promise.all([
      db.query({
        cities: { $: { where: { searchName: { $ilike: pattern } }, limit: 200 } },
      }),
      db.query({
        cities: { $: { where: { city: { $ilike: pattern } }, limit: 200 } },
      }),
      db.query({
        cities: { $: { where: { slug: 'new-york-ny' }, limit: 5 } },
      }),
    ]);

    const toTop = (rows: any[]) =>
      rows.slice(0, 20).map((c: any) => ({
        city: c.city || '',
        stateAbbr: c.stateAbbr || '',
        slug: c.slug || '',
        searchName: c.searchName || '',
      }));

    const searchNameRows = searchNameResult.cities || [];
    const cityRows = cityResult.cities || [];
    const nyRows = nyResult.cities || [];

    return NextResponse.json({
      qRaw,
      qn,
      pattern,
      a: {
        count: searchNameRows.length,
        includesNY: searchNameRows.some((c: any) => c.slug === 'new-york-ny'),
        top: toTop(searchNameRows),
      },
      b: {
        count: cityRows.length,
        includesNY: cityRows.some((c: any) => c.slug === 'new-york-ny'),
        top: toTop(cityRows),
      },
      c: {
        count: nyRows.length,
        ny: toTop(nyRows),
      },
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
