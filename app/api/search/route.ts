import { NextResponse } from 'next/server';
import { searchAll } from '@/lib/data-instantdb';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  // Use the fast search function that searches restaurant names, cities, and neighborhoods
  const results = await searchAll(query, 20);

  return NextResponse.json({ results });
}

