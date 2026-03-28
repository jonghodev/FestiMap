'use client';

// KakaoMap is imported directly (not via dynamic) because MapContainer itself
// is already loaded via next/dynamic with ssr:false in MapPageClient.tsx.
// A second dynamic() here would create an unnecessary network waterfall:
//   MapPageClient → dynamic → MapContainer chunk → dynamic → KakaoMap chunk
// By bundling KakaoMap into the same chunk as MapContainer we eliminate one
// extra round-trip and load both components in a single request.
import KakaoMap from './KakaoMap';
import type { MapMarker, MapViewportState, MapPanTarget } from './KakaoMap';
import type { ViewportBounds } from '@/hooks/useViewportEvents';

interface MapContainerProps {
  lat?: number;
  lng?: number;
  level?: number;
  markers?: MapMarker[];
  className?: string;
  /** User's GPS location – pans the map and shows a blue location dot */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * Programmatic pan target – when changed the map jumps to the given coordinates.
   * Used by region-filter chips to centre the map on a selected district/area.
   */
  panTarget?: MapPanTarget | null;
  onMapReady?: (map: kakao.maps.Map) => void;
  /** Called when the map viewport settles after pan/zoom – use to load visible markers */
  onBoundsChange?: (bounds: ViewportBounds) => void;
  /**
   * Called when the map viewport settles after pan/zoom.
   * Provides center coordinates and zoom level for state persistence across navigations.
   */
  onViewportChange?: (state: MapViewportState) => void;
  /** Called when the map fails to load */
  onError?: (error: Error) => void;
}

/**
 * Client-side wrapper for KakaoMap with SSR disabled.
 *
 * MapContainer is itself loaded via next/dynamic (ssr:false) in MapPageClient,
 * so it is guaranteed to run in a browser context.  KakaoMap is bundled into
 * the same lazy chunk — no additional dynamic split needed here.
 */
export default function MapContainer(props: MapContainerProps) {
  return <KakaoMap {...props} />;
}
