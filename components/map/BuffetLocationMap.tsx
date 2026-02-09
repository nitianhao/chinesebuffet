'use client';

import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

// ---------------------------------------------------------------------------
// Leaflet is loaded ONLY after the user explicitly taps "Load interactive map".
// The ~145 KB Leaflet chunk is never fetched during normal page browsing.
// Once loaded in a session it stays loaded (sessionStorage key).
// ---------------------------------------------------------------------------

const SESSION_KEY = 'leaflet-map-loaded';

const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] md:h-[250px] bg-[var(--surface2)] rounded-xl flex items-center justify-center">
      <p className="text-[var(--muted)]">Loading map…</p>
    </div>
  ),
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuffetLocationMapProps {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  showTitle?: boolean;
  /** Formatted street address, e.g. "123 Main St, Los Angeles, CA 90012" */
  address?: string;
  /** Pre-built Google Maps directions URL */
  directionsUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapsSearchUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function wasLoadedInSession(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markLoadedInSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Private browsing or quota – ignore silently
  }
}

// ---------------------------------------------------------------------------
// Static placeholder card — zero Leaflet JS
// ---------------------------------------------------------------------------

function MapPlaceholder({
  name,
  lat,
  lng,
  address,
  directionsUrl,
  onLoadMap,
}: {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  directionsUrl?: string | null;
  onLoadMap: () => void;
}) {
  return (
    <div
      className="w-full h-[200px] md:h-[250px] rounded-xl border border-[var(--border)] bg-[var(--surface2)] flex flex-col items-center justify-center gap-3 px-4 text-center"
      role="region"
      aria-label={`Map location for ${name}`}
    >
      {/* Location pin icon */}
      <svg
        className="w-8 h-8 text-[var(--accent1)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>

      {/* Address */}
      {address && (
        <p className="text-sm text-[var(--text)] font-medium line-clamp-2 max-w-xs">
          {address}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <a
          href={directionsUrl || mapsSearchUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Directions
        </a>

        <a
          href={mapsSearchUrl(lat, lng)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent1)] hover:text-[var(--accent1)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Open in Google Maps
        </a>

        <button
          type="button"
          onClick={onLoadMap}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full bg-[var(--accent1)] text-white hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent1)] focus-visible:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Load interactive map
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function BuffetLocationMap({
  id,
  name,
  lat,
  lng,
  rating,
  showTitle = false,
  address,
  directionsUrl,
}: BuffetLocationMapProps) {
  // If the user already loaded a map in this tab/session, show the
  // interactive map immediately (no extra click needed).
  const [showMap, setShowMap] = useState(() => wasLoadedInSession());

  const handleLoadMap = useCallback(() => {
    markLoadedInSession();
    setShowMap(true);
  }, []);

  const markers = useMemo(
    () => [{ id, name, lat, lng, rating }],
    [id, name, lat, lng, rating],
  );

  const center = useMemo(() => [lat, lng] as [number, number], [lat, lng]);

  return (
    <div>
      {showTitle && (
        <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Location</h3>
      )}

      {showMap ? (
        <LeafletMap
          markers={markers}
          center={center}
          zoom={15}
          height="200px"
          showClusters={false}
        />
      ) : (
        <MapPlaceholder
          name={name}
          lat={lat}
          lng={lng}
          address={address}
          directionsUrl={directionsUrl}
          onLoadMap={handleLoadMap}
        />
      )}
    </div>
  );
}
