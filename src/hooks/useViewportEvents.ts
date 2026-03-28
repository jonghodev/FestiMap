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

/** Full event data returned for each marker in the viewport */
export interface ViewportEvent {
  id: string;
  name: string;
  eventType: string;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  district: string | null;
  city: string;
  isFree: boolean;
}

export interface ViewportEventFilters {
  /** Limit results to a single event type (FESTIVAL | FLEA_MARKET | NIGHT_MARKET) */
  eventType?: string;
  /** Search query (matched against event name with LIKE on the server) */
  q?: string;
}

// ---------------------------------------------------------------------------
// Client-side cache (module-level singleton, shared across hook instances)
// ---------------------------------------------------------------------------

interface CacheEntry {
  events: ViewportEvent[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes per entry
const MAX_CACHE_ENTRIES = 50;
/** Debounce viewport changes so rapid pan/zoom doesn't hammer the API */
const DEBOUNCE_MS = 300;
/**
 * Round bounds outward to 2 decimal places (~1.1 km precision).
 * This means small pans reuse the same cache key without a network round-trip.
 */
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

/** Snap bounds outward to grid so small pans share the same cache key */
function snapBounds(bounds: ViewportBounds): ViewportBounds {
  return {
    swLat: roundDown(bounds.swLat, COORD_PRECISION),
    swLng: roundDown(bounds.swLng, COORD_PRECISION),
    neLat: roundUp(bounds.neLat, COORD_PRECISION),
    neLng: roundUp(bounds.neLng, COORD_PRECISION),
  };
}

function boundsKey(bounds: ViewportBounds, filters: ViewportEventFilters): string {
  return [
    bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng,
    filters.eventType ?? '',
    filters.q ?? '',
  ].join('|');
}

function getCached(key: string): ViewportEvent[] | null {
  const entry = eventCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    eventCache.delete(key);
    return null;
  }
  return entry.events;
}

function setCached(key: string, events: ViewportEvent[]): void {
  // Simple LRU eviction: drop the oldest entry when we're at capacity
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
  /** Events currently loaded for the visible viewport */
  events: ViewportEvent[];
  /** True while a fetch is in-flight */
  isLoading: boolean;
  /** Korean-language error message, or null */
  error: string | null;
  /**
   * Call this whenever the map viewport changes (pan / zoom).
   * The call is debounced internally so it is safe to call on every map event.
   */
  updateViewport: (bounds: ViewportBounds) => void;
}

/**
 * useViewportEvents
 *
 * Loads map markers scoped to the currently visible map viewport.
 *
 * Features:
 * - **Viewport-scoped loading**: the map emits its initial bounds on mount,
 *   causing only visible markers to be fetched – no full table scan.
 * - **Debounced refetch** (300 ms) so rapid pan/zoom doesn't spam the API.
 * - **Client-side LRU cache** (5 min TTL, 50 cells) so returning to a
 *   previously viewed area is instant.
 * - **Request cancellation** via AbortController – only the latest viewport's
 *   response is applied.
 * - **Server-side CDN cache**: API responses carry `Cache-Control: s-maxage=60`
 *   so Vercel edge nodes serve repeated identical requests without hitting the DB.
 *
 * @param filters Optional event-type and search-query filters forwarded to the API
 */
export function useViewportEvents(
  filters: ViewportEventFilters = {}
): UseViewportEventsResult {
  const [events, setEvents] = useState<ViewportEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);
  // Keep a stable ref to the latest filters so the debounced callback always
  // sees the current value without needing to re-register the timer.
  const filtersRef = useRef<ViewportEventFilters>(filters);
  filtersRef.current = filters;

  const fetchForBounds = useCallback(async (bounds: ViewportBounds) => {
    const snapped = snapBounds(bounds);
    const currentFilters = filtersRef.current;
    const key = boundsKey(snapped, currentFilters);

    // 1. Check client-side cache first
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

      if (currentFilters.eventType) params.set('eventType', currentFilters.eventType);
      if (currentFilters.q) params.set('q', currentFilters.q);

      const res = await fetch(`/api/events?${params.toString()}`, {
        signal: abortController.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: {
        events: Array<{
          id: string;
          name: string;
          eventType: string;
          latitude: number;
          longitude: number;
          startDate: string;
          endDate: string;
          venue: string;
          address: string;
          district: string | null;
          city: string;
          isFree: boolean;
        }>;
      } = await res.json();

      const viewportEvents: ViewportEvent[] = data.events.map((e) => ({
        id: e.id,
        name: e.name,
        eventType: e.eventType,
        latitude: e.latitude,
        longitude: e.longitude,
        startDate: e.startDate,
        endDate: e.endDate,
        venue: e.venue,
        address: e.address,
        district: e.district,
        city: e.city,
        isFree: e.isFree,
      }));

      setCached(key, viewportEvents);
      setEvents(viewportEvents);
    } catch (err) {
      // AbortError is expected on rapid viewport changes – don't report it as error
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('useViewportEvents fetch error:', err);
      setError('이벤트 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []); // filters are read via ref so this stays stable

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
