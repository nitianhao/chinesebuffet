'use client';

import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export interface BuffetMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  citySlug?: string;
  slug?: string;
}

interface MapProps {
  markers: BuffetMarker[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onMarkerClick?: (marker: BuffetMarker) => void;
  showClusters?: boolean;
}

export default function Map({
  markers,
  center = [39.8283, -98.5795], // Center of USA
  zoom = 4,
  height = '500px',
  onMarkerClick,
  showClusters = true,
}: MapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<any[]>([]);
  const clusterGroupRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const MarkerClusterGroupRef = useRef<any>(null);

  // Only mount on client
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !mapContainerRef.current) return;

    let isActive = true;

    // Dynamically import Leaflet only when mounted on client
    // Import Leaflet first and make it globally available for markercluster
    import('leaflet').then((LModule) => {
      if (!isActive || !mapContainerRef.current) return;

      const L = LModule.default;
      
      // Make L available globally for leaflet.markercluster
      if (typeof window !== 'undefined') {
        (window as any).L = L;
      }
      
      LRef.current = L;

      // Now import markercluster which expects L to be global
      return import('leaflet.markercluster').then((MarkerClusterModule) => {
        if (!isActive || !mapContainerRef.current) return;

        const MarkerClusterGroup = MarkerClusterModule.default || MarkerClusterModule;
        MarkerClusterGroupRef.current = MarkerClusterGroup;

      // Fix for default marker icons in Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Initialize map
      if (!mapRef.current) {
        mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(mapRef.current);
      }

      // Clear existing markers
      markersRef.current.forEach(marker => {
        mapRef.current?.removeLayer(marker);
      });
      markersRef.current = [];

      if (clusterGroupRef.current) {
        mapRef.current?.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }

      if (markers.length === 0) return;

      // Create markers
      const markerLayers: any[] = [];

      markers.forEach(markerData => {
        const marker = L.marker([markerData.lat, markerData.lng], {
          title: markerData.name,
        });

        // Create popup content
        const popupContent = `
          <div style="min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold;">${markerData.name}</h3>
            ${markerData.rating ? `<p style="margin: 0 0 8px 0;">⭐ ${markerData.rating.toFixed(1)}</p>` : ''}
            ${markerData.citySlug && markerData.slug ? `
              <a href="/chinese-buffets/${markerData.citySlug}/${markerData.slug}" 
                 style="color: #0066cc; text-decoration: none;">
                View Details →
              </a>
            ` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);

        if (onMarkerClick) {
          marker.on('click', () => {
            onMarkerClick(markerData);
          });
        }

        markerLayers.push(marker);
        markersRef.current.push(marker);
      });

      // Add markers to map with or without clustering
      if (showClusters && markers.length > 10 && MarkerClusterGroupRef.current) {
        const MarkerClusterGroupClass = MarkerClusterGroupRef.current;
        const ClusterGroupClass = MarkerClusterGroupClass.MarkerClusterGroup || MarkerClusterGroupClass;
        const clusterGroup = new ClusterGroupClass({
          chunkedLoading: true,
          maxClusterRadius: 50,
        });
        clusterGroup.addLayers(markerLayers);
        mapRef.current?.addLayer(clusterGroup);
        clusterGroupRef.current = clusterGroup;
      } else {
        markerLayers.forEach(marker => {
          marker.addTo(mapRef.current!);
        });
      }

        // Fit bounds if markers exist
        if (markers.length > 0) {
          const bounds = L.latLngBounds(
            markers.map(m => [m.lat, m.lng] as [number, number])
          );
          mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
        }
      });
    }).catch((error) => {
      console.error('Error loading Leaflet:', error);
    });

    return () => {
      isActive = false;
      // Cleanup
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [isMounted, markers, center, zoom, onMarkerClick, showClusters]);

  if (!isMounted) {
    return (
      <div
        style={{
          width: '100%',
          height: height,
          borderRadius: '8px',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: '100%',
        height: height,
        borderRadius: '8px',
        overflow: 'hidden',
        border: '1px solid #e5e7eb',
      }}
    />
  );
}
