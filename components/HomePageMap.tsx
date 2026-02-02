'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import DeferredSection from './DeferredSection';

// Dynamically import Map - Leaflet is heavy, only load when map section is in view
const Map = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] md:h-[450px] bg-[var(--surface2)] rounded-xl flex items-center justify-center animate-pulse">
      <p className="text-[var(--muted)]">Loading map...</p>
    </div>
  ),
});

export interface MapMarker {
  id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  rating?: number;
  citySlug: string;
}

interface HomePageMapProps {
  markers: MapMarker[];
}

export default function HomePageMap({ markers }: HomePageMapProps) {
  const mapMarkers = useMemo(
    () =>
      markers.map((m) => ({
        id: m.id,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        rating: m.rating,
        citySlug: m.citySlug,
        slug: m.slug,
      })),
    [markers]
  );

  return (
    <DeferredSection
      id="map"
      title="Chinese Buffets Across the USA"
      summary={
        <p className="text-[var(--muted)] mb-4">
          Explore {markers.length} Chinese buffet locations on the map below. Scroll to load the interactive map.
        </p>
      }
      threshold={600}
      className="py-8"
    >
      <div className="rounded-xl overflow-hidden border border-[var(--border)] shadow-sm">
        <Map
          markers={mapMarkers}
          center={[39.8283, -98.5795]}
          zoom={4}
          height="400px"
          showClusters={true}
        />
      </div>
    </DeferredSection>
  );
}
