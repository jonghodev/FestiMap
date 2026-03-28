'use client';

import { useEffect } from 'react';
import { useKakaoMapInstance } from '@/hooks/useKakaoMap';
import type { ViewportBounds } from '@/hooks/useViewportEvents';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  onClick?: (id: string) => void;
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
  /** Called when the map finishes initializing */
  onMapReady?: (map: kakao.maps.Map) => void;
  /**
   * Called when the map viewport changes (pan / zoom) and the map becomes idle.
   * Receives the current bounding box so the parent can load only visible markers.
   */
  onBoundsChange?: (bounds: ViewportBounds) => void;
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
  onMapReady,
  onBoundsChange,
}: KakaoMapProps) {
  const { containerRef, mapInstance, status, error } = useKakaoMapInstance({
    lat,
    lng,
    level,
  });

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
    if (!mapInstance || !onBoundsChange) return;

    const emitBounds = () => {
      const bounds = mapInstance.getBounds();
      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      onBoundsChange({
        swLat: sw.getLat(),
        swLng: sw.getLng(),
        neLat: ne.getLat(),
        neLng: ne.getLng(),
      });
    };

    // Emit immediately for the initial viewport so the first render loads markers
    emitBounds();

    // Subscribe to subsequent viewport changes
    window.kakao.maps.event.addListener(mapInstance, 'idle', emitBounds);

    return () => {
      window.kakao.maps.event.removeListener(mapInstance, 'idle', emitBounds);
    };
  }, [mapInstance, onBoundsChange]);

  // Place markers on the map
  useEffect(() => {
    if (!mapInstance || !window.kakao?.maps) return;

    const kakaoMarkers: kakao.maps.Marker[] = [];

    markers.forEach((markerData) => {
      const position = new window.kakao.maps.LatLng(markerData.lat, markerData.lng);
      const marker = new window.kakao.maps.Marker({
        map: mapInstance,
        position,
        title: markerData.title,
        clickable: !!markerData.onClick,
      });

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
        className={`flex items-center justify-center bg-gray-100 rounded-lg ${className}`}
        role="alert"
        aria-label="지도 로딩 오류"
      >
        <div className="text-center p-6">
          <p className="text-red-500 font-medium">지도를 불러올 수 없습니다</p>
          <p className="text-gray-500 text-sm mt-1">
            {error?.message ?? '잠시 후 다시 시도해 주세요'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Map container */}
      <div
        ref={containerRef}
        className="w-full h-full"
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
