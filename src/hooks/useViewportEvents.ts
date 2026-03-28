'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

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
  /**
   * GPS-based radius filter: show only events within `radiusKm` kilometres of the
   * given point. The API uses the Haversine formula for exact circular filtering.
   * A bounding box derived from the circle is also applied at the DB query level
   * for efficiency (pre-filter before exact radius check).
   */
  gpsRadius?: {
    lat: number;
    lng: number;
    radiusKm: number;
  };
  /**
   * Date range filter: show only events that overlap with the given date range.
   * Both values are ISO date strings (YYYY-MM-DD).
   * An event overlaps when event.startDate <= endDate AND event.endDate >= startDate.
   */
  dateRange?: {
    startDate: string;
    endDate: string;
  };
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
  // Include GPS radius in cache key so radius-filtered results are stored separately
  const gpsKey = filters.gpsRadius
    ? `gps:${filters.gpsRadius.lat}:${filters.gpsRadius.lng}:${filters.gpsRadius.radiusKm}`
    : '';
  // Include date range in cache key so date-filtered results are stored separately
  const dateKey = filters.dateRange
    ? `date:${filters.dateRange.startDate}:${filters.dateRange.endDate}`
    : '';
  return [
    bounds.swLat, bounds.swLng, bounds.neLat, bounds.neLng,
    filters.eventType ?? '',
    filters.q ?? '',
    gpsKey,
    dateKey,
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

export interface UseViewportEventsOptions {
  /** Optional event-type and search-query filters forwarded to the API */
  filters?: ViewportEventFilters;
  /**
   * Pre-fetched events from SSR/server component.
   * When provided these events are shown immediately on first render,
   * eliminating the blank-markers state while the map SDK initializes.
   * The hook will still fetch fresh data once the real map viewport is known.
   */
  initialEvents?: ViewportEvent[];
  /**
   * The bounding box used to pre-fetch `initialEvents` on the server.
   * When provided alongside `initialEvents`, the hook pre-seeds the client-side
   * LRU cache with the server data.  If the map's first viewport lands within
   * the same snapped cell as `initialBounds`, the cache hit is immediate and
   * no API request is made for the initial render.
   */
  initialBounds?: ViewportBounds;
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
 * - **Filter-change auto-refetch**: when eventType or search query changes, the
 *   hook automatically re-fetches for the last known viewport bounds.
 * - **SSR initial data**: accepts pre-fetched `initialEvents` from server
 *   components so markers appear instantly without waiting for the map to emit
 *   its first viewport bounds.
 *
 * @param filters Optional event-type and search-query filters forwarded to the API
 * @param initialEvents Pre-fetched events from server-side rendering
 *
 * @deprecated Use the object overload: useViewportEvents({ filters, initialEvents })
 */
export function useViewportEvents(
  filtersOrOptions: ViewportEventFilters | UseViewportEventsOptions = {}
): UseViewportEventsResult {
  // Support both legacy (filters object) and new ({ filters, initialEvents, initialBounds }) call signatures
  const isOptionsShape =
    filtersOrOptions !== null &&
    typeof filtersOrOptions === 'object' &&
    ('filters' in filtersOrOptions || 'initialEvents' in filtersOrOptions || 'initialBounds' in filtersOrOptions);

  const filters: ViewportEventFilters = isOptionsShape
    ? ((filtersOrOptions as UseViewportEventsOptions).filters ?? {})
    : (filtersOrOptions as ViewportEventFilters);

  const initialEvents: ViewportEvent[] = isOptionsShape
    ? ((filtersOrOptions as UseViewportEventsOptions).initialEvents ?? [])
    : [];

  const initialBounds: ViewportBounds | undefined = isOptionsShape
    ? (filtersOrOptions as UseViewportEventsOptions).initialBounds
    : undefined;

  const [events, setEvents] = useState<ViewportEvent[]>(initialEvents);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-seed the client-side LRU cache with server-fetched data on first mount.
  // We do this once so subsequent viewport updates that land in the same snapped
  // cell get an instant cache hit instead of a network round-trip.
  const cacheSeedDoneRef = useRef(false);
  useEffect(() => {
    if (cacheSeedDoneRef.current) return;
    cacheSeedDoneRef.current = true;

    if (initialEvents.length > 0 && initialBounds) {
      const snapped = snapBounds(initialBounds);
      const key = boundsKey(snapped, filters);
      // Only seed if the slot is empty (another tab may have already filled it)
      if (!getCached(key)) {
        setCached(key, initialEvents);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount only

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);
  // Keep a stable ref to the latest filters so the debounced callback always
  // sees the current value without needing to re-register the timer.
  const filtersRef = useRef<ViewportEventFilters>(filters);
  filtersRef.current = filters;

  // Track the last known viewport bounds so we can re-fetch when filters change
  const lastBoundsRef = useRef<ViewportBounds | null>(null);

  const fetchForBounds = useCallback(async (bounds: ViewportBounds) => {
    const currentFilters = filtersRef.current;

    // When GPS radius is active, expand the viewport bounds to fully include the GPS
    // radius bounding box. This guarantees that ALL events within the radius circle
    // are fetched regardless of where the map has been panned, since the DB-level
    // bounding-box pre-filter must contain the full circle for the Haversine post-
    // filter to see every candidate event.
    //
    // Without this expansion, when the map viewport is smaller than the radius circle
    // (which it commonly is – e.g. a 1km radius circle is 2km wide but level-4 zoom
    // only shows ~1.2km), events in the outer ring of the circle but outside the
    // current viewport would be silently omitted from the results.
    let effectiveBounds = bounds;
    if (currentFilters.gpsRadius) {
      const { lat, lng, radiusKm } = currentFilters.gpsRadius;
      const latDelta = radiusKm / 111.32; // 1° latitude ≈ 111.32 km
      const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
      const radiusBbox: ViewportBounds = {
        swLat: lat - latDelta,
        swLng: lng - lngDelta,
        neLat: lat + latDelta,
        neLng: lng + lngDelta,
      };
      // Union: take the bounding rectangle that contains BOTH the viewport and the circle bbox.
      // The Haversine post-filter in the API will then further restrict to exactly the circle.
      effectiveBounds = {
        swLat: Math.min(bounds.swLat, radiusBbox.swLat),
        swLng: Math.min(bounds.swLng, radiusBbox.swLng),
        neLat: Math.max(bounds.neLat, radiusBbox.neLat),
        neLng: Math.max(bounds.neLng, radiusBbox.neLng),
      };
    }

    const snapped = snapBounds(effectiveBounds);
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

      // GPS radius filter: pass centre + radius to the API for Haversine post-filtering.
      // The bounding box params above serve as an efficient pre-filter at DB level.
      if (currentFilters.gpsRadius) {
        params.set('lat', String(currentFilters.gpsRadius.lat));
        params.set('lng', String(currentFilters.gpsRadius.lng));
        params.set('radius', String(currentFilters.gpsRadius.radiusKm));
      }

      // Date range filter: pass start/end dates to the API.
      // Events that overlap with the range are returned (startDate <= endDate AND endDate >= startDate).
      if (currentFilters.dateRange) {
        params.set('startDate', currentFilters.dateRange.startDate);
        params.set('endDate', currentFilters.dateRange.endDate);
      }

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
      // Store the latest bounds so filter-change refetch can use them
      lastBoundsRef.current = bounds;

      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        fetchForBounds(bounds);
      }, DEBOUNCE_MS);
    },
    [fetchForBounds]
  );

  // Auto-refetch when filters change (e.g. user taps a category tab, types a search query,
  // activates / changes the GPS radius filter, or selects a date range preset).
  // We read from lastBoundsRef so we always fetch the current viewport with the new filters.
  // The 300ms debounce inside updateViewport means rapid filter changes don't hammer the API.
  const prevEventTypeRef = useRef(filters.eventType);
  const prevQRef = useRef(filters.q);
  // Serialise gpsRadius to a primitive string so we can track changes with a simple ref.
  const prevGpsRadiusKeyRef = useRef<string>(
    filters.gpsRadius
      ? `${filters.gpsRadius.lat}:${filters.gpsRadius.lng}:${filters.gpsRadius.radiusKm}`
      : ''
  );
  // Serialise dateRange to a primitive string so we can track changes with a simple ref.
  const prevDateRangeKeyRef = useRef<string>(
    filters.dateRange
      ? `${filters.dateRange.startDate}:${filters.dateRange.endDate}`
      : ''
  );

  useEffect(() => {
    const currentGpsKey = filters.gpsRadius
      ? `${filters.gpsRadius.lat}:${filters.gpsRadius.lng}:${filters.gpsRadius.radiusKm}`
      : '';
    const currentDateKey = filters.dateRange
      ? `${filters.dateRange.startDate}:${filters.dateRange.endDate}`
      : '';

    const eventTypeChanged = prevEventTypeRef.current !== filters.eventType;
    const qChanged = prevQRef.current !== filters.q;
    const gpsRadiusChanged = prevGpsRadiusKeyRef.current !== currentGpsKey;
    const dateRangeChanged = prevDateRangeKeyRef.current !== currentDateKey;

    prevEventTypeRef.current = filters.eventType;
    prevQRef.current = filters.q;
    prevGpsRadiusKeyRef.current = currentGpsKey;
    prevDateRangeKeyRef.current = currentDateKey;

    if (eventTypeChanged || qChanged || gpsRadiusChanged || dateRangeChanged) {
      if (lastBoundsRef.current) {
        // Re-use the debounced updateViewport so rapid changes still debounce
        updateViewport(lastBoundsRef.current);
      } else {
        // Map viewport not yet known (map still initializing, or filter changed during
        // sessionStorage state restore before the Kakao map fires its first `idle`).
        // Clear the stale initialEvents so wrong-category markers don't flash on the
        // map while it sets up at the restored viewport position.
        // The correct events will be loaded once the map emits its first bounds update.
        setEvents([]);
      }
    }
  // gpsRadius and dateRange are spread to primitive dep values to avoid object-reference
  // churn – a new object with the same values must not trigger a refetch.
  // The full object refs are intentionally omitted from the dep array here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.eventType,
    filters.q,
    filters.gpsRadius?.lat,
    filters.gpsRadius?.lng,
    filters.gpsRadius?.radiusKm,
    filters.dateRange?.startDate,
    filters.dateRange?.endDate,
    updateViewport,
  ]);

  return { events, isLoading, error, updateViewport };
}
