'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SearchBar from '@/components/SearchBar';

interface City {
  slug: string;
  city: string;
  state: string;
  buffetCount: number;
}

export default function Header() {
  const [isCitiesMenuOpen, setIsCitiesMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [topCities, setTopCities] = useState<City[]>([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const pathname = usePathname();

  // Load top cities when cities menu is opened
  useEffect(() => {
    if (isCitiesMenuOpen && topCities.length === 0 && !isLoadingCities) {
      setIsLoadingCities(true);
      fetch('/api/cities')
        .then(res => res.json())
        .then(data => {
          if (data.cities) {
            setTopCities(data.cities);
          }
        })
        .catch(err => {
          console.error('Error loading cities:', err);
        })
        .finally(() => {
          setIsLoadingCities(false);
        });
    }
  }, [isCitiesMenuOpen, topCities.length, isLoadingCities]);

  // Close menus when pathname changes
  useEffect(() => {
    setIsCitiesMenuOpen(false);
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 h-16">
          {/* Logo / Site Name */}
          <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
            <span className="text-2xl font-bold text-gray-900">
              Chinese Buffets Directory
            </span>
          </Link>

          <div className="hidden md:flex flex-1 justify-center px-6">
            <div className="w-full max-w-md">
              <SearchBar />
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/"
              className={`text-sm font-medium transition-colors ${
                pathname === '/'
                  ? 'text-[var(--accent1)]'
                  : 'text-gray-700 hover:text-[var(--accent1)]'
              }`}
            >
              Home
            </Link>

            {/* Cities Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsCitiesMenuOpen(!isCitiesMenuOpen)}
                className={`text-sm font-medium transition-colors flex items-center space-x-1 ${
                  pathname?.startsWith('/chinese-buffets/') && !pathname.includes('/states/') && !pathname.includes('/near/')
                    ? 'text-[var(--accent1)]'
                    : 'text-gray-700 hover:text-[var(--accent1)]'
                }`}
                aria-expanded={isCitiesMenuOpen}
                aria-haspopup="true"
              >
                <span>Cities</span>
                <svg
                  className={`w-4 h-4 transition-transform ${isCitiesMenuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isCitiesMenuOpen && (
                <>
                  {/* Backdrop */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsCitiesMenuOpen(false)}
                  />
                  
                  {/* Dropdown Menu */}
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-20 max-h-96 overflow-y-auto">
                    {isLoadingCities ? (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        Loading cities...
                      </div>
                    ) : topCities.length > 0 ? (
                      <div className="py-2">
                        {topCities.map((city) => (
                          <Link
                            key={city.slug}
                            href={`/chinese-buffets/${city.slug}`}
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-[var(--surface2)] hover:text-[var(--accent1)] transition-colors"
                            onClick={() => setIsCitiesMenuOpen(false)}
                          >
                            <div className="flex justify-between items-center">
                              <span>
                                {city.city}, {city.state}
                              </span>
                              <span className="text-gray-400 text-xs">
                                {city.buffetCount}
                              </span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-gray-500 text-sm">
                        No cities available
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <Link
              href="/chinese-buffets/states"
              className={`text-sm font-medium transition-colors ${
                pathname?.startsWith('/chinese-buffets/states')
                  ? 'text-[var(--accent1)]'
                  : 'text-gray-700 hover:text-[var(--accent1)]'
              }`}
            >
              Browse by State
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-700 hover:text-[var(--accent1)] transition-colors"
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="md:hidden pb-4 border-t border-gray-200 mt-2 pt-4">
            <div className="space-y-2">
              <div className="px-4">
                <SearchBar
                  variant="mobile"
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
              </div>
              <Link
                href="/"
                className={`block px-4 py-2 text-base font-medium rounded-md transition-colors ${
                  pathname === '/'
                    ? 'text-[var(--accent1)] bg-[var(--surface2)]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>

              <div>
                <button
                  onClick={() => setIsCitiesMenuOpen(!isCitiesMenuOpen)}
                  className={`w-full text-left px-4 py-2 text-base font-medium rounded-md transition-colors flex items-center justify-between ${
                    pathname?.startsWith('/chinese-buffets/') && !pathname.includes('/states/') && !pathname.includes('/near/')
                      ? 'text-[var(--accent1)] bg-[var(--surface2)]'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>Cities</span>
                  <svg
                    className={`w-5 h-5 transition-transform ${isCitiesMenuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isCitiesMenuOpen && (
                  <div className="mt-2 pl-4 space-y-1 max-h-64 overflow-y-auto">
                    {isLoadingCities ? (
                      <div className="px-4 py-2 text-sm text-gray-500">
                        Loading cities...
                      </div>
                    ) : topCities.length > 0 ? (
                      topCities.map((city) => (
                        <Link
                          key={city.slug}
                          href={`/chinese-buffets/${city.slug}`}
                          className="block px-4 py-2 text-sm text-gray-700 hover:bg-[var(--surface2)] hover:text-[var(--accent1)] rounded-md transition-colors"
                          onClick={() => {
                            setIsCitiesMenuOpen(false);
                            setIsMobileMenuOpen(false);
                          }}
                        >
                          <div className="flex justify-between items-center">
                            <span>
                              {city.city}, {city.state}
                            </span>
                            <span className="text-gray-400 text-xs">
                              {city.buffetCount}
                            </span>
                          </div>
                        </Link>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500">
                        No cities available
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Link
                href="/chinese-buffets/states"
                className={`block px-4 py-2 text-base font-medium rounded-md transition-colors ${
                  pathname?.startsWith('/chinese-buffets/states')
                    ? 'text-[var(--accent1)] bg-[var(--surface2)]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Browse by State
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
