'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type CitySuggestion = {
  slug: string;
  city: string;
  state: string;
  buffetCount: number;
};

type SearchAutocompleteProps = {
  variant: 'desktop' | 'mobile';
  topCities?: CitySuggestion[];
  autoFocus?: boolean;
  onNavigate?: () => void;
};

const MIN_QUERY_LENGTH = 2;

export default function SearchAutocomplete({
  variant,
  topCities = [],
  autoFocus = false,
  onNavigate,
}: SearchAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const normalizedText = query.trim();
  const showTopCities = isOpen && normalizedText.length < MIN_QUERY_LENGTH;

  const suggestions = useMemo(() => topCities.slice(0, 6), [topCities]);

  const inputClasses =
    variant === 'desktop'
      ? 'w-full rounded-full border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/50 shadow-sm transition focus:border-[#C1121F]/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#C1121F]/40'
      : 'w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-4 text-sm text-[var(--text)] shadow-sm focus:border-[#C1121F]/40 focus:outline-none focus:ring-2 focus:ring-[#C1121F]/30';

  const panelClasses =
    variant === 'desktop'
      ? 'absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#111214] shadow-xl'
      : 'absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl';

  const textMuted = variant === 'desktop' ? 'text-white/60' : 'text-[var(--muted)]';
  const divider = variant === 'desktop' ? 'divide-white/5' : 'divide-[var(--border)]';

  return (
    <div className="relative w-full">
      <span
        className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${
          variant === 'desktop' ? 'text-white/50' : 'text-[var(--muted)]'
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        placeholder="Search buffets, cities, neighborhoods..."
        className={inputClasses}
        autoFocus={autoFocus}
      />

      {isOpen && (
        <div className={panelClasses} onMouseDown={(event) => event.preventDefault()}>
          {showTopCities && (
            <>
              <div
                className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] ${
                  variant === 'desktop' ? 'text-white/40' : 'text-[var(--muted)]'
                }`}
              >
                Top cities
              </div>
              {suggestions.length > 0 ? (
                <div className={`divide-y ${divider}`}>
                  {suggestions.map((city) => (
                    <Link
                      key={city.slug}
                      href={`/chinese-buffets/${city.slug}`}
                      className={`flex items-center justify-between px-4 py-3 text-sm ${
                        variant === 'desktop'
                          ? 'text-white/80 hover:bg-white/5 hover:text-white'
                          : 'text-[var(--text)] hover:bg-[var(--surface2)]'
                      }`}
                      onClick={() => {
                        setIsOpen(false);
                        onNavigate?.();
                      }}
                    >
                      <span>
                        {city.city}, {city.state}
                      </span>
                      <span className={`text-xs ${textMuted}`}>{city.buffetCount}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className={`px-4 py-3 text-sm ${textMuted}`}>No cities available</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
