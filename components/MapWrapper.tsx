'use client';

import dynamic from 'next/dynamic';

// This wrapper ensures Map is only loaded on client and never analyzed during SSR/static generation
const MapComponent = dynamic(() => import('./Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[300px] bg-gray-100 rounded-xl flex items-center justify-center">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

// Re-export the Map component interface
export type { BuffetMarker } from './Map';

// Re-export Map as default with the same interface
export default MapComponent;
