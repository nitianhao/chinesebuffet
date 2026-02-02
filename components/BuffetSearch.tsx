'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';

type BuffetItem = {
  id: string;
  name: string;
  slug: string;
  citySlug: string;
  address: {
    city: string;
    state: string;
  };
};

interface BuffetSearchProps {
  initialBuffets?: BuffetItem[];
  /** Initial query from URL (?q=...) - triggers search on mount */
  initialQuery?: string;
}

type FuseResult<T> = { item: T };
type FuseOptions<T> = {
  keys: Array<{ name: keyof T; weight: number }>;
  threshold: number;
  minMatchCharLength: number;
  ignoreLocation: boolean;
};
type FuseLike<T> = { search: (query: string) => FuseResult<T>[] };
type FuseConstructor = new <T>(list: T[], options: FuseOptions<T>) => FuseLike<T>;
type WindowWithFuse = Window & { Fuse?: FuseConstructor };

// Fuse.js options - using string paths for nested fields
const fuseOptions = {
  keys: [
    { name: 'name', weight: 0.7 },
    { name: 'address.city', weight: 0.2 },
    { name: 'address.state', weight: 0.1 },
  ],
  threshold: 0.35,
  minMatchCharLength: 2,
  ignoreLocation: true,
};

export default function BuffetSearch({ initialBuffets = [], initialQuery = '' }: BuffetSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<BuffetItem[]>(initialBuffets);
  const [fuse, setFuse] = useState<FuseLike<BuffetItem> | null>(null);
  const [fuseReady, setFuseReady] = useState(false);

  useEffect(() => {
    setResults(initialBuffets);
  }, [initialBuffets]);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!fuseReady || initialBuffets.length === 0) {
      return;
    }

    const FuseCtor = (window as WindowWithFuse).Fuse;
    if (!FuseCtor) {
      return;
    }

    setFuse(new FuseCtor(initialBuffets, fuseOptions));
  }, [fuseReady, initialBuffets]);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (!fuse || trimmedQuery.length < 2) {
      setResults(initialBuffets);
      return;
    }

    const matches = fuse.search(trimmedQuery).map((match) => match.item);
    setResults(matches);
  }, [fuse, query, initialBuffets]);

  const showNoResults = query.trim().length >= 2 && results.length === 0;

  return (
    <div className="w-full">
      <Script
        src="https://cdn.jsdelivr.net/npm/fuse.js@6.6.2"
        strategy="afterInteractive"
        onLoad={() => setFuseReady(true)}
      />
      <div className="max-w-2xl mx-auto">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search buffets by name, city, or cuisine"
            className="w-full px-4 py-3 pl-12 border border-white/20 rounded-xl shadow-lg focus:outline-none focus:ring-2 focus:ring-white/80 focus:border-transparent text-gray-900 bg-white"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <div className="mt-3 text-sm text-white/70 text-center">
          Start typing to filter (minimum 2 characters)
        </div>
      </div>

      {results.length > 0 && (
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((buffet) => {
            const citySlug = buffet.citySlug || '';
            const buffetSlug = buffet.slug || '';
            const href = citySlug && buffetSlug ? `/chinese-buffets/${citySlug}/${buffetSlug}` : '#';
            const cityDisplay = buffet.address?.city && buffet.address?.state
              ? `${buffet.address.city}, ${buffet.address.state}`
              : buffet.address?.city || '';

            return (
              <Link
                key={buffet.id}
                href={href}
                className="bg-white text-gray-900 rounded-xl border border-white/20 shadow-sm p-4 hover:shadow-md hover:border-[#C1121F]/30 transition-all cursor-pointer block"
              >
                <div className="text-lg font-semibold">{buffet.name}</div>
                {cityDisplay && (
                  <div className="text-sm text-gray-600 mt-1">{cityDisplay}</div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {showNoResults && (
        <div className="mt-8 text-center text-white/70">
          No results found
        </div>
      )}

      {initialBuffets.length === 0 && !showNoResults && (
        <div className="mt-8 text-center text-white/70">
          <p>No buffets loaded. Browse by state below.</p>
        </div>
      )}
    </div>
  );
}
