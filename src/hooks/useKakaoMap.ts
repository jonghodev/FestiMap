'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { loadKakaoMapSDK, isKakaoMapsReady } from '@/lib/kakao-loader';

export type KakaoMapStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseKakaoMapSDKOptions {
  /** Skip loading if false (e.g. feature flag) */
  enabled?: boolean;
}

interface UseKakaoMapSDKResult {
  status: KakaoMapStatus;
  isReady: boolean;
  error: Error | null;
  /** Manually trigger SDK load (called automatically when enabled=true) */
  load: () => Promise<void>;
}

/**
 * Hook to lazily load the Kakao Map SDK.
 *
 * Returns `isReady=true` once the SDK is fully initialized and safe to use.
 * The SDK is loaded on mount (or when `enabled` becomes true).
 */
export function useKakaoMapSDK(
  options: UseKakaoMapSDKOptions = {}
): UseKakaoMapSDKResult {
  const { enabled = true } = options;
  const [status, setStatus] = useState<KakaoMapStatus>(() =>
    isKakaoMapsReady() ? 'ready' : 'idle'
  );
  const [error, setError] = useState<Error | null>(null);
  const loadingRef = useRef(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '';

  const load = useCallback(async () => {
    if (loadingRef.current || isKakaoMapsReady()) return;
    loadingRef.current = true;
    setStatus('loading');
    setError(null);

    try {
      await loadKakaoMapSDK(appKey);
      setStatus('ready');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setStatus('error');
      loadingRef.current = false; // Allow retry
    }
  }, [appKey]);

  useEffect(() => {
    if (!enabled) return;
    if (isKakaoMapsReady()) {
      setStatus('ready');
      return;
    }
    load();
  }, [enabled, load]);

  return {
    status,
    isReady: status === 'ready',
    error,
    load,
  };
}

interface UseKakaoMapInstanceOptions {
  /** Latitude of initial map center */
  lat: number;
  /** Longitude of initial map center */
  lng: number;
  /** Initial zoom level (1-14, lower = more zoomed in) */
  level?: number;
}

interface UseKakaoMapInstanceResult {
  /** Ref to attach to the map container div */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** The Kakao Map instance (null until initialized) */
  mapInstance: kakao.maps.Map | null;
  /** SDK + map initialization status */
  status: KakaoMapStatus;
  isReady: boolean;
  error: Error | null;
}

/**
 * Hook to initialize a Kakao Map instance on a container element.
 *
 * Loads the SDK lazily and creates the map when the container is available.
 */
export function useKakaoMapInstance(
  options: UseKakaoMapInstanceOptions
): UseKakaoMapInstanceResult {
  const { lat, lng, level = 5 } = options;
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<kakao.maps.Map | null>(null);
  const { status, isReady, error } = useKakaoMapSDK();

  useEffect(() => {
    if (!isReady || !containerRef.current) return;
    if (mapInstance) return; // Already initialized

    const center = new window.kakao.maps.LatLng(lat, lng);
    const map = new window.kakao.maps.Map(containerRef.current, {
      center,
      level,
    });

    setMapInstance(map);
  }, [isReady, lat, lng, level, mapInstance]);

  return {
    containerRef,
    mapInstance,
    status,
    isReady,
    error,
  };
}
