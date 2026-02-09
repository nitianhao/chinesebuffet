import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
    const db = getAdminDb();
    const [citiesResult, buffetsResult] = await Promise.all([
      db.query({ cities: { $: { limit: 5 } } }),
      db.query({ buffets: { $: { limit: 5 }, city: {} } }),
    ]);

    const cities = (citiesResult.cities || []).map((city: any) => ({
      id: city.id,
      city: city.city || '',
      stateAbbr: city.stateAbbr || '',
      slug: city.slug || '',
      searchName: city.searchName || null,
    }));

    const buffets = (buffetsResult.buffets || []).map((buffet: any) => ({
      id: buffet.id,
      name: buffet.name || '',
      slug: buffet.slug || '',
      city: buffet.city?.city || buffet.cityName || '',
      state: buffet.city?.stateAbbr || buffet.stateAbbr || buffet.state || '',
      searchName: buffet.searchName || null,
    }));

    return NextResponse.json({ cities, buffets });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json(
      { error: String(err), stack: err?.stack },
      { status: 500 }
    );
  }
}
