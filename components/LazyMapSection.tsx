'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

// Preload Map chunk when section scrolls into view (snappier "Show map" click)
const preloadMapChunk = () => import('./Map');

// Map loaded only when user clicks "Show map" - never in initial bundle
const Map = dynamic(preloadMapChunk, {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] md:h-[450px] bg-[var(--surface2)] rounded-xl flex items-center justify-center animate-pulse">
      <p className="text-[var(--muted)]">Loading map…</p>
    </div>
  ),
});

interface MapMarker {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  rating?: number;
  citySlug: string;
}

interface LazyMapSectionProps {
  children?: React.ReactNode;
}

export default function LazyMapSection({ children }: LazyMapSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [isLoadingMarkers, setIsLoadingMarkers] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const hasPreloadedRef = useRef(false);

  // Preload Map chunk when section scrolls into view (before user clicks)
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || hasPreloadedRef.current) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasPreloadedRef.current) return;
        hasPreloadedRef.current = true;
        preloadMapChunk();
      },
      { rootMargin: '200px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const loadMarkers = useCallback(async () => {
    if (hasLoadedOnce || markers.length > 0) return;
    setIsLoadingMarkers(true);
    try {
      const res = await fetch('/api/buffets/map');
      const data = await res.json();
      if (data?.markers?.length) {
        setMarkers(data.markers);
        setHasLoadedOnce(true);
      }
    } catch {
      setMarkers([]);
    } finally {
      setIsLoadingMarkers(false);
    }
  }, [hasLoadedOnce, markers.length]);

  const handleToggle = useCallback(() => {
    if (!isExpanded) {
      loadMarkers();
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  }, [isExpanded, loadMarkers]);

  return (
    <section
      ref={sectionRef}
      id="map"
      className="bg-[var(--bg)] py-10 scroll-mt-24"
      aria-labelledby="map-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h2 id="map-heading" className="text-2xl font-bold text-[var(--text)] mb-3">
            Chinese Buffets Across the USA
          </h2>
          <p className="text-[var(--muted)] text-base leading-relaxed max-w-2xl mb-4">
            Browse Chinese buffets by region or explore the interactive map.
          </p>

          {/* Buffets by region - static, SEO-friendly, server-rendered when passed as children */}
          {children}

          {/* Toggle: Show map / Hide map - map hidden by default (mobile + LCP) */}
          <button
            type="button"
            onClick={handleToggle}
            disabled={isLoadingMarkers}
            aria-expanded={isExpanded}
            aria-controls="map-content"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] text-sm font-medium hover:border-[var(--accent1)] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent1)] focus:ring-offset-2 disabled:opacity-60"
          >
            {isLoadingMarkers ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-[var(--accent1)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Loading…
              </>
            ) : isExpanded ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
                Hide map
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Show map
              </>
            )}
          </button>
        </header>

        {/* Map - only rendered when expanded (lazy load Leaflet) */}
        {isExpanded && (
          <div id="map-content" className="mt-6" role="region" aria-label="Interactive map of Chinese buffets">
            {hasLoadedOnce && markers.length > 0 ? (
              <div className="rounded-xl overflow-hidden border border-[var(--border)] shadow-sm">
                <Map
                  markers={markers}
                  center={[39.8283, -98.5795]}
                  zoom={4}
                  height="400px"
                  showClusters={true}
                />
              </div>
            ) : markers.length === 0 && !isLoadingMarkers ? (
              <p className="text-[var(--muted)] text-sm">No map data available.</p>
            ) : (
              <div className="w-full h-[400px] bg-[var(--surface2)] rounded-xl flex items-center justify-center animate-pulse">
                <p className="text-[var(--muted)]">Loading map…</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
