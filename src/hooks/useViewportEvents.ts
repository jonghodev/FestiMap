'use client';

import { useState, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewportBounds {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
}

export interface EventMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  eventType: string;
}

// ---------------------------------------------------------------------------
// Client-side cache (module-level singleton)
// ---------------------------------------------------------------------------

interface CacheEntry {
  events: EventMarker[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 50;
const DEBOUNCE_MS = 300;
// Round bounds to 2 decimal places (~1.1 km precision) to maximise cache hits
const COORD_PRECISION = 2;

const eventCache = new Map<string, CacheEntry>();

function roundDown(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor) / factor;
}

function roundUp(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

/**
 * Snap bounds outward to the nearest grid cell so panning by a small amount
 * still hits the cache.
 */
function snapBounds(bounds: ViewportBounds): ViewportBounds {
  return {
    swLat: roundDown(bounds.swLat, COORD_PRECISION),
    swLng: roundDown(bounds.swLng, COORD_PRECISION),
    neLat: roundUp(bounds.neLat, COORD_PRECISION),
    neLng: roundUp(bounds.neLng, COORD_PRECISION),
  };
}

function boundsKey(bounds: ViewportBounds): string {
  return `${bounds.swLat}|${bounds.swLng}|${bounds.neLat}|${bounds.neLng}`;
}

function getCached(key: string): EventMarker[] | null {
  const entry = eventCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    eventCache.delete(key);
    return null;
  }
  return entry.events;
}

function setCached(key: string, events: EventMarker[]): void {
  // Evict oldest entry when cache is full
  if (eventCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = eventCache.keys().next().value;
    if (firstKey !== undefined) eventCache.delete(firstKey);
  }
  eventCache.set(key, { events, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseViewportEventsResult {
  /** Event markers currently visible in the viewport */
  events: EventMarker[];
  /** True while a fetch is in-flight */
  isLoading: boolean;
  /** Korean-language error message, or null */
  error: string | null;
  /**
   * Call this whenever the map viewport changes.
   * The call is debounced internally so it is safe to call on every pan/zoom event.
   */
  updateViewport: (bounds: ViewportBounds) => void;
}

/**
 * Loads map markers for the currently visible map viewport.
 *
 * Features:
 * - Debounced viewport updates (300 ms) to avoid excessive API calls during pan/zoom
 * - Client-side LRU-ish cache with 5-minute TTL keyed by snapped bounds
 * - Inflight request cancellation via AbortController
 * - Server responses are also cached at the CDN edge (Cache-Control headers on the API)
 */
export function useViewportEvents(): UseViewportEventsResult {
  const [events, setEvents] = useState<EventMarker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);

  const fetchForBounds = useCallback(async (bounds: ViewportBounds) => {
    const snapped = snapBounds(bounds);
    const key = boundsKey(snapped);

    // 1. Check client-side cache
    const cached = getCached(key);
    if (cached) {
      setEvents(cached);
      setIsLoading(false);
      return;
    }

    // 2. Cancel any previous in-flight request
    abortController.current?.abort();
    abortController.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        swLat: String(snapped.swLat),
        swLng: String(snapped.swLng),
        neLat: String(snapped.neLat),
        neLng: String(snapped.neLng),
      });

      const res = await fetch(`/api/events?${params.toString()}`, {
        signal: abortController.current.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: {
        events: Array<{
          id: string;
          name: string;
          latitude: number;
          longitude: number;
          eventType: string;
        }>;
      } = await res.json();

      const markers: EventMarker[] = data.events.map((e) => ({
        id: e.id,
        lat: e.latitude,
        lng: e.longitude,
        title: e.name,
        eventType: e.eventType,
      }));

      setCached(key, markers);
      setEvents(markers);
    } catch (err) {
      // Ignore abort errors – they are expected on rapid pan/zoom
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('useViewportEvents fetch error:', err);
      setError('이벤트 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateViewport = useCallback(
    (bounds: ViewportBounds) => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        fetchForBounds(bounds);
      }, DEBOUNCE_MS);
    },
    [fetchForBounds]
  );

  return { events, isLoading, error, updateViewport };
}
