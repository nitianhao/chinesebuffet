import { Suspense } from 'react';
import { Metadata } from 'next';
import SearchResultsClient from '@/components/search/SearchResultsClient';

export const metadata: Metadata = {
  title: 'Search Chinese Buffets | Find All-You-Can-Eat Restaurants',
  description: 'Search for Chinese buffet restaurants near you. Find the best all-you-can-eat Chinese food with ratings, reviews, and prices.',
};

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || '';

  return (
    <Suspense fallback={<SearchPageSkeleton />}>
      <SearchResultsClient initialQuery={query} />
    </Suspense>
  );
}

function SearchPageSkeleton() {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header skeleton */}
      <div className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="h-12 bg-[var(--surface2)] rounded-xl animate-pulse" />
          <div className="mt-4 flex gap-2">
            <div className="h-8 w-24 bg-[var(--surface2)] rounded-full animate-pulse" />
            <div className="h-8 w-20 bg-[var(--surface2)] rounded-full animate-pulse" />
            <div className="h-8 w-16 bg-[var(--surface2)] rounded-full animate-pulse" />
          </div>
        </div>
      </div>

      {/* Results skeleton */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl animate-pulse">
              <div className="w-32 h-32 flex-shrink-0 rounded-lg bg-[var(--surface2)]" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-[var(--surface2)] rounded w-3/4" />
                <div className="h-4 bg-[var(--surface2)] rounded w-1/2" />
                <div className="h-4 bg-[var(--surface2)] rounded w-1/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
