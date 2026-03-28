'use client';

import { useState, useCallback } from 'react';

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'denied' | 'error';

export interface GeolocationCoords {
  lat: number;
  lng: number;
  /** Accuracy in metres */
  accuracy?: number;
}

export interface UseGeolocationResult {
  /** Current detection status */
  status: GeolocationStatus;
  /** User's coordinates when status is 'success' */
  coords: GeolocationCoords | null;
  /** Korean error message when status is 'error' or 'denied' */
  errorMessage: string | null;
  /** Request the user's current position */
  requestLocation: () => void;
}

/**
 * Hook for GPS geolocation detection.
 *
 * Requests the user's current position using the browser Geolocation API.
 * Returns Korean-language error messages appropriate for the Korean market.
 *
 * Usage:
 *   const { status, coords, errorMessage, requestLocation } = useGeolocation();
 */
export function useGeolocation(): UseGeolocationResult {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [coords, setCoords] = useState<GeolocationCoords | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      setErrorMessage('이 브라우저는 위치 서비스를 지원하지 않습니다.');
      return;
    }

    setStatus('loading');
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setStatus('success');
      },
      (error) => {
        // error.code values: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        if (error.code === 1) {
          setStatus('denied');
          setErrorMessage(
            '위치 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.'
          );
        } else if (error.code === 2) {
          setStatus('error');
          setErrorMessage('현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.');
        } else if (error.code === 3) {
          setStatus('error');
          setErrorMessage('위치 확인 시간이 초과되었습니다. 다시 시도해 주세요.');
        } else {
          setStatus('error');
          setErrorMessage('위치를 가져오는 중 오류가 발생했습니다.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,   // 10 seconds
        maximumAge: 60_000, // Accept cached position up to 1 minute old
      }
    );
  }, []);

  return {
    status,
    coords,
    errorMessage,
    requestLocation,
  };
}
