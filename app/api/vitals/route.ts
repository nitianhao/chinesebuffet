import { NextRequest, NextResponse } from 'next/server';

const SHOULD_LOG = process.env.VITALS_LOG === 'true';

export async function POST(request: NextRequest) {
  if (!SHOULD_LOG) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const body = await request.json();
    console.log('[web-vitals]', body);
  } catch (error) {
    console.warn('[web-vitals] failed to parse payload', error);
  }

  return new NextResponse(null, { status: 204 });
}
