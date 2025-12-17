'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SearchBarProps {
  onSearch?: (query: string) => void;
  showResults?: boolean;
}

interface SearchResult {
  type: 'city' | 'buffet';
  slug: string;
  name: string;
  citySlug?: string;
}

export default function SearchBar({ onSearch, showResults = true }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query.trim() || !showResults) {
      setResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        setResults(data.results || []);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300); // Debounce search

    return () => clearTimeout(searchTimeout);
  }, [query, showResults]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (onSearch) {
      onSearch(value);
    }
  };

  return (
    <div className="relative w-full max-w-2xl">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search for a city or buffet..."
          className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <svg
          className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
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

      {isFocused && query && (results.length > 0 || isLoading) && (
        <div className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="px-4 py-3 text-gray-500 text-center">Searching...</div>
          ) : results.length > 0 ? (
            results.map((result, index) => (
              <Link
                key={index}
                href={
                  result.type === 'city'
                    ? `/chinese-buffets/${result.slug}`
                    : `/chinese-buffets/${result.citySlug}/${result.slug}`
                }
                className="block px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">
                    {result.type === 'city' ? '🏙️' : '🍽️'}
                  </span>
                  <span className="font-medium">{result.name}</span>
                  {result.type === 'city' && (
                    <span className="text-sm text-gray-500 ml-auto">City</span>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <div className="px-4 py-3 text-gray-500 text-center">No results found</div>
          )}
        </div>
      )}
    </div>
  );
}

