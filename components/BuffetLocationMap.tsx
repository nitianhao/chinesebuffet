'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import Map with no SSR to avoid hydration issues
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[200px] md:h-[250px] bg-[var(--surface2)] rounded-xl flex items-center justify-center">
      <p className="text-[var(--muted)]">Loading map...</p>
    </div>
  ),
});

interface BuffetLocationMapProps {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  /** Show title header (default: false for standalone placement) */
  showTitle?: boolean;
}

export default function BuffetLocationMap({ id, name, lat, lng, rating, showTitle = false }: BuffetLocationMapProps) {
  // Memoize markers to prevent unnecessary re-renders
  const markers = useMemo(() => [{
    id,
    name,
    lat,
    lng,
    rating,
  }], [id, name, lat, lng, rating]);

  const center = useMemo(() => [lat, lng] as [number, number], [lat, lng]);

  return (
    <div>
      {showTitle && (
        <h3 className="text-lg font-semibold text-[var(--text)] mb-3">Location</h3>
      )}
      <Map
        markers={markers}
        center={center}
        zoom={15}
        height="200px"
        showClusters={false}
      />
    </div>
  );
}
