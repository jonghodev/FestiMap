'use client';

import { useCallback } from 'react';
import MapContainer from './MapContainer';
import { useViewportEvents, type ViewportBounds } from '@/hooks/useViewportEvents';
import type { MapMarker } from './KakaoMap';

interface MapViewProps {
  /** Initial map center latitude */
  lat?: number;
  /** Initial map center longitude */
  lng?: number;
  /** Initial zoom level */
  level?: number;
  /** CSS class for the outer wrapper */
  className?: string;
  /** Called when user clicks a marker */
  onMarkerClick?: (id: string) => void;
}

/**
 * MapView
 *
 * Full-featured map component that:
 * 1. Renders the Kakao Map via MapContainer
 * 2. On initial render, fires onBoundsChange for the initial viewport, which
 *    triggers a scoped API fetch – so only markers visible right now are loaded.
 * 3. On every pan/zoom (idle event), re-fetches markers for the new viewport.
 * 4. Deduplicates and caches responses client-side to minimise network round-trips.
 *
 * The parent page stays a React Server Component; all interactivity lives here.
 */
export default function MapView({
  lat = 37.5665,
  lng = 126.978,
  level = 7,
  className = '',
  onMarkerClick,
}: MapViewProps) {
  const { events, isLoading, error, updateViewport } = useViewportEvents();

  const handleBoundsChange = useCallback(
    (bounds: ViewportBounds) => {
      updateViewport(bounds);
    },
    [updateViewport]
  );

  // Convert ViewportEvent → MapMarker (add click handler if provided)
  const markers: MapMarker[] = events.map((e) => ({
    id: e.id,
    lat: e.latitude,
    lng: e.longitude,
    title: e.name,
    onClick: onMarkerClick,
  }));

  return (
    <div className={`relative ${className}`}>
      <MapContainer
        lat={lat}
        lng={lng}
        level={level}
        markers={markers}
        className="w-full h-full"
        onBoundsChange={handleBoundsChange}
      />

      {/* Loading indicator while fetching viewport events */}
      {isLoading && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-10
                     bg-white/90 backdrop-blur-sm rounded-full px-4 py-1.5
                     shadow text-sm text-gray-600 flex items-center gap-2"
          aria-live="polite"
        >
          <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          이벤트 불러오는 중…
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
                     bg-red-50 border border-red-200 rounded-lg px-4 py-2
                     shadow text-sm text-red-600 max-w-xs text-center"
          role="alert"
        >
          {error}
        </div>
      )}
    </div>
  );
}
