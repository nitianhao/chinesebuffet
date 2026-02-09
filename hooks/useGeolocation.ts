'use client';

import { useState, useCallback } from 'react';

export type GeolocationStatus = 'idle' | 'requesting' | 'success' | 'denied' | 'unavailable' | 'timeout' | 'error';

export interface GeolocationState {
  status: GeolocationStatus;
  coords: { lat: number; lng: number } | null;
  error: string | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    status: 'idle',
    coords: null,
    error: null,
  });

  const requestLocation = useCallback(() => {
    if (!navigator?.geolocation) {
      setState({
        status: 'unavailable',
        coords: null,
        error: 'Geolocation is not supported by your browser.',
      });
      return;
    }

    setState({ status: 'requesting', coords: null, error: null });

    const timeoutId = setTimeout(() => {
      setState((prev) => {
        if (prev.status === 'requesting') {
          return {
            status: 'timeout',
            coords: null,
            error: 'Location request timed out.',
          };
        }
        return prev;
      });
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId);
        setState({
          status: 'success',
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          error: null,
        });
      },
      (err) => {
        clearTimeout(timeoutId);
        const status: GeolocationStatus =
          err.code === 1 ? 'denied' : err.code === 2 ? 'unavailable' : err.code === 3 ? 'timeout' : 'error';
        const error =
          err.code === 1
            ? 'Location access was denied.'
            : err.code === 2
              ? 'Location is unavailable.'
              : err.code === 3
                ? 'Location request timed out.'
                : err.message || 'Unable to get location.';
        setState({ status, coords: null, error });
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const reset = useCallback(() => {
    setState({ status: 'idle', coords: null, error: null });
  }, []);

  return { ...state, requestLocation, reset };
}
