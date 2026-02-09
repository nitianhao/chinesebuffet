import { NextRequest, NextResponse } from 'next/server';
import { init, id } from '@instantdb/admin';
import schema from '@/src/instant.schema';
import { generateSlug } from '@/lib/utils';
import { buildFacetIndex } from '@/lib/facets/buildFacetIndex';

export const runtime = 'nodejs';

let cachedDb: ReturnType<typeof init> | null = null;

function getAdminDb() {
  if (cachedDb) return cachedDb;
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!adminToken) {
    throw new Error('INSTANT_ADMIN_TOKEN is required');
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

function normalizeStateAbbr(state: string): string {
  const s = state.trim().toUpperCase();
  if (s.length === 2) return s;
  const nameToAbbr: Record<string, string> = {
    ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR',
    CALIFORNIA: 'CA', COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE',
    FLORIDA: 'FL', GEORGIA: 'GA', HAWAII: 'HI', IDAHO: 'ID',
    ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA', KANSAS: 'KS',
    KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
    MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
    MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
    'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
    'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
    OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
    'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
    VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
    WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
  };
  return nameToAbbr[s] || s.slice(0, 2);
}

function generateCitySlug(cityName: string, stateAbbr: string): string {
  const citySlug = generateSlug(cityName);
  const stateSlug = generateSlug(stateAbbr);
  return `${citySlug}-${stateSlug}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const state = typeof body.state === 'string' ? body.state.trim() : '';

    if (!name) {
      return NextResponse.json({ error: 'Buffet name is required.' }, { status: 400 });
    }
    if (!city || !state) {
      return NextResponse.json({ error: 'City and state are required.' }, { status: 400 });
    }

    const stateAbbr = normalizeStateAbbr(state);
    const street = typeof body.street === 'string' ? body.street.trim() : '';
    const postalCode = typeof body.postalCode === 'string' ? body.postalCode.trim() : '';
    const address =
      typeof body.address === 'string'
        ? body.address.trim()
        : [street, city, stateAbbr, postalCode].filter(Boolean).join(', ');
    const phone = typeof body.phone === 'string' ? body.phone.trim() || undefined : undefined;
    const website = typeof body.website === 'string' ? body.website.trim() || undefined : undefined;
    const price = typeof body.price === 'string' ? body.price.trim() || undefined : undefined;
    const description =
      typeof body.description === 'string' ? body.description.trim() || undefined : undefined;
    const neighborhood =
      typeof body.neighborhood === 'string' ? body.neighborhood.trim() || undefined : undefined;

    if (!process.env.INSTANT_ADMIN_TOKEN) {
      return NextResponse.json(
        {
          message:
            'Thank you! Your submission has been received. We will review it and add the buffet to the directory soon.',
        },
        { status: 200 }
      );
    }

    const db = getAdminDb();
    const citySlug = generateCitySlug(city, stateAbbr);

    // Find existing city by slug first, then by city + stateAbbr
    let existingCity = (
      await db.query({
        cities: { $: { where: { slug: citySlug }, limit: 1 } },
      })
    ).cities?.[0] as { id: string } | undefined;

    if (!existingCity) {
      const byName = (
        await db.query({
          cities: { $: { where: { city, stateAbbr }, limit: 1 } },
        })
      ).cities?.[0] as { id: string } | undefined;
      existingCity = byName;
    }

    let cityId: string;

    if (existingCity) {
      cityId = existingCity.id;
    } else {
      // Create minimal city so we can link the buffet
      cityId = id();
      await db.transact([
        db.tx.cities[cityId].create({
          city,
          state: stateAbbr,
          stateAbbr,
          slug: citySlug,
          rank: 0,
          population: 0,
        }),
      ]);
    }

    const buffetSlugBase = generateSlug(name);
    let buffetSlug = buffetSlugBase;
    const statePart = citySlug.split('-').pop() || stateAbbr.toLowerCase();
    buffetSlug = `${buffetSlug}-${statePart}`;

    const buffetId = id();

    // Compute initial facetIndex (will be all false/zeros for new buffets without POI data)
    const initialFacetData = buildFacetIndex({});
    const facetIndex = JSON.stringify(initialFacetData);

    const buffetData: Record<string, unknown> = {
      name,
      slug: buffetSlug,
      street: street || '',
      cityName: city,
      state: stateAbbr,
      stateAbbr,
      postalCode: postalCode || '',
      address: address || `${city}, ${stateAbbr}`,
      lat: 0,
      lng: 0,
      permanentlyClosed: false,
      temporarilyClosed: false,
      phone,
      website,
      price,
      description,
      neighborhood,
      facetIndex,
    };

    const buffetTx = db.tx.buffets[buffetId].create(buffetData).link({ city: cityId });
    await db.transact([buffetTx]);

    return NextResponse.json(
      {
        message: 'Thank you! The buffet has been added to the directory.',
        id: buffetId,
      },
      { status: 201 }
    );
  } catch (err) {
    const error = err as Error;
    console.error('[add-buffet]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add buffet.' },
      { status: 500 }
    );
  }
}
