'use client';

import { useCallback, useMemo } from 'react';
import MapContainer from './MapContainer';
import type { MapMarker } from './KakaoMap';
import { useViewportEvents, type ViewportBounds } from '@/hooks/useViewportEvents';
import { EVENT_TYPE_COLORS } from './CategoryFilter';

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

  // Convert ViewportEvent → MapMarker with event-type colour coding.
  // Memoised so the markers array reference only changes when events actually change,
  // preventing KakaoMap from destroying and recreating all markers on every render.
  const markers: MapMarker[] = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        lat: event.latitude,
        lng: event.longitude,
        title: event.name,
        color: EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] ?? '#6B7280',
        onClick: onMarkerClick,
      })),
    [events, onMarkerClick]
  );

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
