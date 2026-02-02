'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useGeolocation } from '@/hooks/useGeolocation';
import { reverseGeocode, buildCitySlug, normalizeStateAbbr } from '@/lib/reverseGeocode';

interface CitySuggestion {
  slug: string;
  city: string;
  state: string;
  buffetCount: number;
}

export default function HomepageHero() {
  const router = useRouter();
  const [citySuggestions, setCitySuggestions] = useState<CitySuggestion[]>([]);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [isLocationLoading, setIsLocationLoading] = useState(false);

  const { status: geoStatus, coords, error: geoError, requestLocation, reset } = useGeolocation();

  // Fetch city suggestions on mount (lazy - only when needed for geolocation)
  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((data) => {
        if (data?.cities?.length) setCitySuggestions(data.cities);
      })
      .catch(() => {});
  }, []);

  // Handle geolocation success: reverse geocode and navigate
  useEffect(() => {
    if (geoStatus !== 'success' || !coords) return;

    const run = async () => {
      setIsLocationLoading(true);
      setLocationMessage(null);

      const result = await reverseGeocode(coords.lat, coords.lng);
      if (!result) {
        setLocationMessage("We couldn't find your city. Browse by state instead.");
        reset();
        setIsLocationLoading(false);
        return;
      }

      const builtSlug = buildCitySlug(result.city, result.stateAbbr);

      // Fetch cities if not yet loaded
      let suggestions = citySuggestions;
      if (suggestions.length === 0) {
        try {
          const res = await fetch('/api/cities');
          const data = await res.json();
          if (data?.cities?.length) {
            suggestions = data.cities;
            setCitySuggestions(suggestions);
          }
        } catch {
          /* ignore */
        }
      }

      // Try exact match first
      let match = suggestions.find((c) => c.slug === builtSlug);

      // Fuzzy: match city name + state (state can be abbr or full name)
      if (!match) {
        match = suggestions.find(
          (c) =>
            c.city.toLowerCase() === result.city.toLowerCase() &&
            normalizeStateAbbr(c.state) === result.stateAbbr
        );
      }
      if (!match) {
        match = suggestions.find(
          (c) =>
            c.slug.includes(result.city.toLowerCase().replace(/\s+/g, '-')) &&
            normalizeStateAbbr(c.state) === result.stateAbbr
        );
      }

      if (match) {
        router.push(`/chinese-buffets/${match.slug}`);
      } else {
        setLocationMessage("We don't have buffets in your area yet. Browse by state instead.");
      }

      reset();
      setIsLocationLoading(false);
    };

    run();
  }, [geoStatus, coords, citySuggestions, router, reset]);

  const handleUseLocation = useCallback(() => {
    setLocationMessage(null);
    requestLocation();
  }, [requestLocation]);

  const showLocationError = geoStatus === 'denied' || geoStatus === 'unavailable' || geoStatus === 'timeout' || geoStatus === 'error';
  const showLocationMessage = locationMessage || (showLocationError && geoError);

  return (
    <section
      className="bg-[var(--surface)] border-b border-[var(--border)]"
      aria-labelledby="hero-heading"
    >
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* H1 + subtext - compact on mobile */}
        <header className="mb-5 sm:mb-6">
          <h1
            id="hero-heading"
            className="text-2xl sm:text-3xl md:text-4xl font-bold text-[var(--text)] mb-2 leading-tight"
          >
            Chinese Buffets Near You
          </h1>
          <p className="text-base sm:text-lg text-[var(--muted)] leading-snug">
            Find all-you-can-eat Chinese buffets across the USA. Browse by city, state, or use your location.
          </p>
        </header>

        {/* Use my location button */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleUseLocation}
            disabled={geoStatus === 'requesting' || isLocationLoading}
            aria-busy={geoStatus === 'requesting' || isLocationLoading}
            aria-label="Use my current location to find nearby buffets"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface2)] text-[var(--text)] text-sm font-medium
              hover:bg-[var(--surface)] hover:border-[var(--border-strong)] transition-colors
              focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2
              disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {(geoStatus === 'requesting' || isLocationLoading) ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-[var(--accent1)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Finding location…
              </>
            ) : (
              <>
                <LocationIcon className="w-4 h-4" aria-hidden="true" />
                Use my location
              </>
            )}
          </button>

          {/* Location fallback message */}
          {showLocationMessage && (
            <div
              role="status"
              className="flex items-start gap-2 p-3 rounded-lg bg-[var(--surface2)] border border-[var(--border)] text-sm text-[var(--muted)]"
            >
              <span className="shrink-0 mt-0.5" aria-hidden="true">ℹ️</span>
              <div className="flex-1">
                <p>{showLocationMessage}</p>
                <Link
                  href="/#states"
                  className="mt-1 inline-block text-[var(--accent1)] font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 rounded"
                >
                  Browse by state →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick chips */}
        <nav aria-label="Quick browse options" className="mt-5 pt-4 border-t border-[var(--border)]">
          <p className="sr-only">Quick links to browse buffets</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/#states"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-[var(--accent-light)] text-[var(--accent1)] border border-[rgba(193,18,31,0.15)]
                hover:bg-[var(--accent-medium)] transition-colors
                focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              Browse by State
            </Link>
            <Link
              href="/#popular-cities"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-[var(--surface2)] text-[var(--muted)] border border-[var(--border)]
                hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors
                focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              Browse by City
            </Link>
            <Link
              href="/#top-rated"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium bg-[var(--surface2)] text-[var(--muted)] border border-[var(--border)]
                hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors
                focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2"
            >
              Top Rated
            </Link>
          </div>
        </nav>
      </div>
    </section>
  );
}

function LocationIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
