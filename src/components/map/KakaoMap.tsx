'use client';

import { useEffect, useRef } from 'react';
import { useKakaoMapInstance } from '@/hooks/useKakaoMap';
import type { ViewportBounds } from '@/hooks/useViewportEvents';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** Optional hex color for the marker pin (e.g. '#FF6B6B'). Falls back to default Kakao marker. */
  color?: string;
  onClick?: (id: string) => void;
}

/**
 * Generates a colored pin SVG as a data URL for use as a Kakao MarkerImage.
 * The pin is a filled circle with a pointed bottom.
 */
function makeMarkerImageUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <circle cx="14" cy="13" r="11" fill="${color}" stroke="white" stroke-width="2.5"/>
    <polygon points="14,36 8,26 20,26" fill="${color}"/>
    <circle cx="14" cy="13" r="4.5" fill="white" opacity="0.45"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Generates a "current location" blue-dot SVG as a data URL.
 * Resembles the standard GPS location indicator used in popular map apps.
 */
function makeUserLocationImageUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" fill="#1B73E8" stroke="white" stroke-width="3"/>
    <circle cx="12" cy="12" r="4" fill="white" opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/** Map viewport state – center coordinates and zoom level */
export interface MapViewportState {
  lat: number;
  lng: number;
  level: number;
}

/**
 * A programmatic pan target for the map.
 * When this prop changes the map pans (and optionally re-zooms) to the given position.
 * Useful for region-filter chips that jump the map to a predefined area.
 */
export interface MapPanTarget {
  lat: number;
  lng: number;
  level: number;
}

interface KakaoMapProps {
  /** Initial center latitude (default: Seoul city hall) */
  lat?: number;
  /** Initial center longitude (default: Seoul city hall) */
  lng?: number;
  /** Initial zoom level 1-14 */
  level?: number;
  /** Markers to display on the map */
  markers?: MapMarker[];
  /** CSS class name for the map container */
  className?: string;
  /**
   * User's current GPS location. When provided, the map pans to these
   * coordinates and displays a blue "current location" dot marker.
   */
  userLocation?: { lat: number; lng: number } | null;
  /**
   * When set, the map smoothly pans (and re-zooms) to the given coordinates.
   * Change this object reference to trigger a pan; the map will fire `idle`
   * afterwards so `onBoundsChange` is called with the new viewport bounds.
   * Intended for region-filter chips that select a predefined area.
   */
  panTarget?: MapPanTarget | null;
  /** Called when the map finishes initializing */
  onMapReady?: (map: kakao.maps.Map) => void;
  /**
   * Called when the map viewport changes (pan / zoom) and the map becomes idle.
   * Receives the current bounding box so the parent can load only visible markers.
   */
  onBoundsChange?: (bounds: ViewportBounds) => void;
  /**
   * Called when the map viewport changes (pan / zoom) and the map becomes idle.
   * Receives the current center coordinates and zoom level for state persistence.
   */
  onViewportChange?: (state: MapViewportState) => void;
  /** Called when the map fails to load (e.g. missing API key, network error) */
  onError?: (error: Error) => void;
}

/**
 * KakaoMap component
 *
 * Renders a Kakao Map with lazy-loaded SDK.
 * Shows a loading skeleton while the SDK initializes.
 * Suitable for mobile-first use (touch-friendly, responsive).
 *
 * Emits `onBoundsChange` whenever the viewport settles after a pan or zoom,
 * enabling the parent to fetch only the markers visible in the current viewport.
 */
export default function KakaoMap({
  lat = 37.5665,   // Seoul city hall
  lng = 126.978,
  level = 7,
  markers = [],
  className = '',
  userLocation = null,
  panTarget = null,
  onMapReady,
  onBoundsChange,
  onViewportChange,
  onError,
}: KakaoMapProps) {
  const { containerRef, mapInstance, status, error } = useKakaoMapInstance({
    lat,
    lng,
    level,
  });

  // Notify parent when map fails to load (call once per error instance)
  const reportedErrorRef = useRef<Error | null>(null);
  useEffect(() => {
    if (status === 'error' && error && onError && reportedErrorRef.current !== error) {
      reportedErrorRef.current = error;
      onError(error);
    }
  }, [status, error, onError]);

  // Notify parent when map is ready
  useEffect(() => {
    if (mapInstance && onMapReady) {
      onMapReady(mapInstance);
    }
  }, [mapInstance, onMapReady]);

  // Emit initial bounds + subscribe to `idle` event for subsequent viewport changes.
  // The `idle` event fires once the map has finished moving/zooming, which avoids
  // calling onBoundsChange on every intermediate animation frame.
  useEffect(() => {
    if (!mapInstance || (!onBoundsChange && !onViewportChange)) return;

    const emitViewport = () => {
      // Emit bounds for viewport-scoped event loading
      if (onBoundsChange) {
        const bounds = mapInstance.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        onBoundsChange({
          swLat: sw.getLat(),
          swLng: sw.getLng(),
          neLat: ne.getLat(),
          neLng: ne.getLng(),
        });
      }

      // Emit center + level for map state persistence across navigations
      if (onViewportChange) {
        const center = mapInstance.getCenter();
        onViewportChange({
          lat: center.getLat(),
          lng: center.getLng(),
          level: mapInstance.getLevel(),
        });
      }
    };

    // Emit immediately for the initial viewport so the first render loads markers
    emitViewport();

    // Subscribe to subsequent viewport changes
    window.kakao.maps.event.addListener(mapInstance, 'idle', emitViewport);

    return () => {
      window.kakao.maps.event.removeListener(mapInstance, 'idle', emitViewport);
    };
  }, [mapInstance, onBoundsChange, onViewportChange]);

  // Pan map to user's GPS location whenever it is set or updated.
  // If the current zoom is wider than level 5 (city-wide), zoom in to
  // level 4 (neighbourhood) so the user can see surrounding events.
  useEffect(() => {
    if (!mapInstance || !userLocation || !window.kakao?.maps) return;

    const position = new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng);
    const currentLevel = mapInstance.getLevel();

    if (currentLevel > 5) {
      // Zoom in first, then centre — avoids a jarring double-animation
      mapInstance.setLevel(4);
    }
    mapInstance.setCenter(position);
  }, [mapInstance, userLocation]);

  // Pan and re-zoom the map whenever panTarget changes.
  // The map fires `idle` after settling, which triggers onBoundsChange so the parent
  // can fetch events for the new viewport — no extra plumbing needed.
  const prevPanTargetRef = useRef<MapPanTarget | null>(null);
  useEffect(() => {
    if (!mapInstance || !panTarget || !window.kakao?.maps) return;
    // Skip if the target hasn't actually changed (guards against re-render noise)
    const prev = prevPanTargetRef.current;
    if (
      prev &&
      prev.lat === panTarget.lat &&
      prev.lng === panTarget.lng &&
      prev.level === panTarget.level
    ) return;
    prevPanTargetRef.current = panTarget;

    const position = new window.kakao.maps.LatLng(panTarget.lat, panTarget.lng);
    // Set zoom first to avoid a jarring double-animation
    mapInstance.setLevel(panTarget.level);
    mapInstance.setCenter(position);
  }, [mapInstance, panTarget]);

  // Show a distinct blue "current location" dot marker at the user's GPS position.
  // The marker is removed when userLocation becomes null or the component unmounts.
  useEffect(() => {
    if (!mapInstance || !userLocation || !window.kakao?.maps) return;

    const position = new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng);
    const imageUrl = makeUserLocationImageUrl();
    const imageSize = new window.kakao.maps.Size(24, 24);
    const imageOptions: kakao.maps.MarkerImageOptions = {
      // Centre the dot on the exact coordinate (half of 24×24)
      offset: new window.kakao.maps.Point(12, 12),
    };
    const markerImage = new window.kakao.maps.MarkerImage(
      imageUrl,
      imageSize,
      imageOptions
    );

    const locationMarker = new window.kakao.maps.Marker({
      map: mapInstance,
      position,
      image: markerImage,
      title: '내 위치',
      zIndex: 10, // Render above event markers (default zIndex is 1)
    });

    return () => {
      locationMarker.setMap(null);
    };
  }, [mapInstance, userLocation]);

  // Relayout the map whenever the container element is resized.
  // This covers two important mobile scenarios:
  //   1. iOS Safari URL bar appearing / disappearing (dynamic viewport height)
  //   2. Device orientation changes (portrait ↔ landscape)
  // Without relayout() Kakao Map keeps the old canvas dimensions and leaves
  // grey bands where the new visible area wasn't painted.
  useEffect(() => {
    if (!mapInstance || !containerRef.current || !window.kakao?.maps) return;

    const observer = new ResizeObserver(() => {
      // Small timeout lets the CSS layout finish before we re-measure
      requestAnimationFrame(() => {
        mapInstance.relayout();
      });
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [mapInstance, containerRef]);

  // Place markers on the map
  useEffect(() => {
    if (!mapInstance || !window.kakao?.maps) return;

    const kakaoMarkers: kakao.maps.Marker[] = [];

    markers.forEach((markerData) => {
      const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);

      // Build marker options, optionally with a custom colored image
      const markerOptions: kakao.maps.MarkerOptions = {
        map: mapInstance,
        position,
        title: markerData.title,
        clickable: !!markerData.onClick,
      };

      if (markerData.color) {
        const imageUrl = makeMarkerImageUrl(markerData.color);
        const imageSize = new window.kakao.maps.Size(28, 36);
        const imageOptions: kakao.maps.MarkerImageOptions = {
          offset: new window.kakao.maps.Point(14, 36),
        };
        markerOptions.image = new window.kakao.maps.MarkerImage(
          imageUrl,
          imageSize,
          imageOptions
        );
      }

      const marker = new window.kakao.maps.Marker(markerOptions);

      if (markerData.onClick) {
        window.kakao.maps.event.addListener(marker, 'click', () => {
          markerData.onClick!(markerData.id);
        });
      }

      kakaoMarkers.push(marker);
    });

    // Cleanup: remove markers when component unmounts or markers change
    return () => {
      kakaoMarkers.forEach((marker) => marker.setMap(null));
    };
  }, [mapInstance, markers]);

  if (status === 'error') {
    return (
      <div
        className={`flex items-center justify-center bg-gray-50 ${className}`}
        role="alert"
        aria-label="지도 로딩 오류"
      >
        <div className="text-center p-6 max-w-xs">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-gray-800 font-semibold text-base mb-1">지도를 불러올 수 없습니다</p>
          <p className="text-gray-500 text-sm leading-relaxed">
            아래 목록에서 행사를 확인해 주세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map container
          map-touch-container (touch-action: none) is applied directly here so
          that pinch-to-zoom, drag-to-pan and tap gestures are all forwarded to
          the Kakao SDK even when this component is embedded inside a parent
          that does not carry the class (e.g. EventVenueMap's ancestor chain).
          Defence-in-depth: MapPageClient also sets the class on the outer
          wrapper, but having it on the actual Kakao element ensures correctness
          regardless of how the component is composed. */}
      <div
        ref={containerRef}
        className="w-full h-full map-touch-container"
        aria-label="카카오 지도"
        role="application"
      />

      {/* Loading skeleton overlay */}
      {status !== 'ready' && (
        <div
          className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center rounded-lg"
          aria-hidden="true"
        >
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">지도 불러오는 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
