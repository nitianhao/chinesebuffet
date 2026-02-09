'use client';

/**
 * Core Leaflet map component.
 *
 * ALL Leaflet + MarkerCluster imports live here.  This file is the ONLY
 * place in the project that references the "leaflet" package.  It must
 * always be loaded via `next/dynamic` with `ssr: false` so Leaflet is
 * never bundled into the shared initial JS.
 */

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

interface LeafletMapProps {
  markers: BuffetMarker[];
  center?: [number, number];
  zoom?: number;
  height?: string;
  onMarkerClick?: (marker: BuffetMarker) => void;
  showClusters?: boolean;
}

export default function LeafletMap({
  markers,
  center = [39.8283, -98.5795], // Center of USA
  zoom = 4,
  height = '500px',
  onMarkerClick,
  showClusters = true,
}: LeafletMapProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
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

  // Initialize map once when mounted
  useEffect(() => {
    if (!isMounted || !mapContainerRef.current || mapRef.current) return;

    let isActive = true;

    // Dynamically import Leaflet only when mounted on client
    import('leaflet').then((LModule) => {
      if (!isActive || !mapContainerRef.current) return;

      const L = LModule.default;

      // Make L available globally for leaflet.markercluster
      if (typeof window !== 'undefined') {
        (window as any).L = L;
      }

      LRef.current = L;

      // Fix for default marker icons in Next.js
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      // Custom red marker icon for Chinese Buffet theme
      (LRef.current as any).redIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #C1121F, #7F0A12);
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 3px 8px rgba(0,0,0,0.4);
          position: relative;
        "><div style="
          width: 10px;
          height: 10px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
        "></div></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });

      // Initialize map
      mapRef.current = L.map(mapContainerRef.current).setView(center, zoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(mapRef.current);

      // Mark map as ready so markers effect can run
      setIsMapReady(true);

      // Import markercluster after map is ready
      import('leaflet.markercluster').then((MarkerClusterModule) => {
        if (!isActive) return;
        MarkerClusterGroupRef.current = MarkerClusterModule.default || MarkerClusterModule;
      }).catch(() => {
        // Markercluster is optional
      });
    }).catch((error) => {
      console.error('Error loading Leaflet:', error);
    });

    return () => {
      isActive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setIsMapReady(false);
    };
  }, [isMounted, center, zoom]);

  // Update markers when map is ready and markers change
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !LRef.current) return;

    const L = LRef.current;

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
      // Use custom red icon for single markers (buffet detail page), default for clusters
      const markerOptions: any = {
        title: markerData.name,
      };
      if (markers.length === 1 && (LRef.current as any).redIcon) {
        markerOptions.icon = (LRef.current as any).redIcon;
      }
      const marker = L.marker([markerData.lat, markerData.lng], markerOptions);

      // Create popup content
      const popupContent = `
        <div style="min-width: 180px; font-family: system-ui, sans-serif;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #111;">${markerData.name}</h3>
          ${markerData.rating ? `<p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">⭐ ${markerData.rating.toFixed(1)}</p>` : ''}
          ${markerData.citySlug && markerData.slug ? `
            <a href="/chinese-buffets/${markerData.citySlug}/${markerData.slug}"
               style="color: #C1121F; text-decoration: none; font-size: 13px; font-weight: 500;">
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
    if (markers.length > 1) {
      const bounds = L.latLngBounds(
        markers.map(m => [m.lat, m.lng] as [number, number])
      );
      mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
    } else if (markers.length === 1) {
      // For single marker, just center on it with the specified zoom
      mapRef.current?.setView([markers[0].lat, markers[0].lng], zoom);
    }
  }, [isMapReady, markers, onMarkerClick, showClusters, zoom]);

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
