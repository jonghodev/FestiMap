'use client';

import { useCallback } from 'react';
import MapContainer from './MapContainer';
import type { MapMarker } from './KakaoMap';
import { useViewportEvents, type ViewportBounds } from '@/hooks/useViewportEvents';

export interface EventMapData {
  id: string;
  name: string;
  eventType: string;
  latitude: number;
  longitude: number;
  venue: string;
  isFree: boolean;
  district?: string | null;
}

interface HomeMapViewProps {
  /** Called when the user taps a marker */
  onMarkerClick?: (id: string) => void;
}

/**
 * HomeMapView — viewport-aware map component.
 *
 * Fetches only the markers visible in the current viewport from the API,
 * rather than loading all events up-front. Caches results client-side so
 * returning to a previously viewed area is instant.
 */
export default function HomeMapView({ onMarkerClick }: HomeMapViewProps) {
  const { events, updateViewport } = useViewportEvents();

  const handleBoundsChange = useCallback(
    (bounds: ViewportBounds) => {
      updateViewport(bounds);
    },
    [updateViewport]
  );

  const markers: MapMarker[] = events.map((event) => ({
    id: event.id,
    lat: event.latitude,
    lng: event.longitude,
    title: event.name,
    onClick: onMarkerClick,
  }));

  return (
    <MapContainer
      lat={37.5665}
      lng={126.978}
      level={8}
      markers={markers}
      className="w-full h-full"
      onBoundsChange={handleBoundsChange}
    />
  );
}
