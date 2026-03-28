'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { EVENT_TYPE_LABELS } from '@/types/index';
import type { MapMarker, MapViewportState, MapPanTarget } from '@/components/map/KakaoMap';
import { useViewportEvents, type ViewportBounds, type ViewportEvent } from '@/hooks/useViewportEvents';
import { useGeolocation } from '@/hooks/useGeolocation';
import CategoryFilter, { EVENT_TYPE_COLORS } from '@/components/map/CategoryFilter';
import type { FilterType } from '@/components/map/CategoryFilter';
import RegionFilter, { type SeoulRegion } from '@/components/map/RegionFilter';
import DateRangeFilter, { type DateRangePreset, getDateRangeFromPreset } from '@/components/map/DateRangeFilter';
import BookmarkButton from '@/components/BookmarkButton';
import { useAuth } from '@/hooks/useAuth';

const MapContainer = dynamic(() => import('@/components/map/MapContainer'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">지도 불러오는 중...</p>
      </div>
    </div>
  ),
});

// Default Seoul metropolitan area bounds used when map is unavailable
const SEOUL_DEFAULT_BOUNDS: ViewportBounds = {
  swLat: 37.41,
  swLng: 126.76,
  neLat: 37.70,
  neLng: 127.18,
};

// ── GPS radius filter helpers ─────────────────────────────────────────────────

/** Available GPS radius options shown when the user's location is known */
const GPS_RADIUS_OPTIONS = [
  { km: 1,  label: '1km' },
  { km: 3,  label: '3km' },
  { km: 5,  label: '5km' },
  { km: 10, label: '10km' },
] as const;

/**
 * Compute a rectangular bounding box that fully contains a GPS radius circle.
 * Used to pre-filter events at the DB level before the exact Haversine check.
 */
function computeBoundsFromRadius(lat: number, lng: number, radiusKm: number): ViewportBounds {
  const latDelta = radiusKm / 111.32; // 1 degree latitude ≈ 111.32 km
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    swLat: lat - latDelta,
    swLng: lng - lngDelta,
    neLat: lat + latDelta,
    neLng: lng + lngDelta,
  };
}

/** Return a Kakao map zoom level that neatly frames the given GPS radius circle */
function getZoomLevelForRadius(radiusKm: number): number {
  if (radiusKm <= 1)  return 4; // ~neighbourhood
  if (radiusKm <= 3)  return 5; // ~sub-district
  if (radiusKm <= 5)  return 6; // ~district
  return 7;                      // ~city-region
}

// ── Seoul city-hall defaults ─────────────────────────────────────────────────
const DEFAULT_LAT = 37.5665;
const DEFAULT_LNG = 126.978;
const DEFAULT_LEVEL = 8;

// SEOUL_REGIONS and SeoulRegion are now imported from @/components/map/RegionFilter

// ── Map state persistence via sessionStorage ─────────────────────────────────
// Preserves map position, zoom, filter, search, and view mode when navigating
// to event detail pages and back, so users return to exactly where they left off.
//
// sessionStorage is intentionally used rather than localStorage because:
//  1. It is scoped to the current browser tab/session, so different tabs can
//     have independent map positions without interfering with each other.
//  2. It is automatically cleared when the tab is closed, which means on a
//     fresh visit users always start at the default Seoul view.
//  3. It survives client-side navigations within the tab (Link / router.back()),
//     which is exactly what we need for back-button / back-gesture restoration.

const MAP_STATE_KEY = 'festimap_map_state';

interface PersistedMapState {
  lat: number;
  lng: number;
  level: number;
  filter: FilterType;
  searchQuery: string;
  /** The last active view mode so users return to map vs list as they left it */
  viewMode: 'map' | 'list';
  /** Scroll offset (px) of the list view so long lists restore their position */
  listScrollY: number;
  /** Selected region chip id (e.g. 'gangnam') for restoring the region filter */
  selectedRegion: string;
  /**
   * Last selected GPS radius in km (null = no radius filter).
   * The radius value is persisted so it is remembered the next time the user
   * activates GPS within the same browser tab session.  GPS coordinates are NOT
   * persisted – they are obtained fresh each time the user taps "내 위치".
   */
  gpsRadius: number | null;
  /**
   * Selected date range preset ('ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH').
   * Persisted so the user's preferred date filter is remembered across navigation.
   */
  dateRangePreset: DateRangePreset;
}

function loadPersistedMapState(): Partial<PersistedMapState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(MAP_STATE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PersistedMapState>;
  } catch {
    return {};
  }
}

function savePersistedMapState(state: PersistedMapState): void {
  try {
    sessionStorage.setItem(MAP_STATE_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore storage errors (private browsing, quota exceeded, etc.)
  }
}

interface MapPageClientProps {
  /**
   * Pre-fetched events from the server component for the default Seoul viewport.
   * These are shown immediately on first render while the Kakao SDK loads,
   * eliminating the blank-map state during SDK initialization.
   */
  initialEvents?: ViewportEvent[];
}

export default function MapPageClient({ initialEvents = [] }: MapPageClientProps) {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ViewportEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Region filter – default is 'seoul' (entire Seoul metropolitan area)
  const [selectedRegion, setSelectedRegion] = useState<string>('seoul');
  // Programmatic map pan target – changed to trigger the KakaoMap to re-centre
  const [panTarget, setPanTarget] = useState<MapPanTarget | null>(null);
  // Whether the region chip dropdown panel is open (mobile)
  const [regionPanelOpen, setRegionPanelOpen] = useState(false);
  // GPS radius filter: null = show all events in viewport; number = km radius around user
  const [gpsRadius, setGpsRadius] = useState<number | null>(null);
  // Date range filter preset – 'ALL' shows all events regardless of date
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('ALL');
  // Pre-check API key at initialization so that if missing we skip the map entirely.
  // This prevents the expensive map-load → fail → fallback transition from
  // artificially inflating LCP metrics (the error text renders during SSR
  // rather than only after JS hydration).
  const hasKakaoKey = !!process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const [mapFailed, setMapFailed] = useState(!hasKakaoKey);
  const [viewMode, setViewMode] = useState<'map' | 'list'>(!hasKakaoKey ? 'list' : 'map');

  // ── 인증 상태 ─────────────────────────────────────────────────────────────
  const { isLoading: isAuthLoading, isAuthenticated, user: authUser, logout } = useAuth();

  // ── GPS geolocation ──────────────────────────────────────────────────────
  const {
    status: geoStatus,
    coords: geoCoords,
    errorMessage: geoError,
    requestLocation,
  } = useGeolocation();

  // Show the geolocation error toast for 5 seconds then auto-dismiss
  const [geoErrorVisible, setGeoErrorVisible] = useState(false);
  const geoErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (geoError) {
      setGeoErrorVisible(true);
      if (geoErrorTimerRef.current) clearTimeout(geoErrorTimerRef.current);
      geoErrorTimerRef.current = setTimeout(() => setGeoErrorVisible(false), 5000);
    }
    return () => {
      if (geoErrorTimerRef.current) clearTimeout(geoErrorTimerRef.current);
    };
  }, [geoError]);

  // ── Map viewport state ───────────────────────────────────────────────────
  // These are initialized to Seoul defaults and restored from sessionStorage
  // on mount. The map is not rendered until `mapStateRestored` is true, which
  // guarantees that the Kakao SDK uses the correct (restored) initial position.
  const [mapLat, setMapLat] = useState(DEFAULT_LAT);
  const [mapLng, setMapLng] = useState(DEFAULT_LNG);
  const [mapLevel, setMapLevel] = useState(DEFAULT_LEVEL);
  // Guard: do not mount MapContainer until we have read sessionStorage so the
  // Kakao map is always created at the correct restored position.
  const [mapStateRestored, setMapStateRestored] = useState(false);

  // Ref to the list scroll container for scroll-position save/restore.
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  // Debounce timer for list scroll saves – avoids flooding sessionStorage
  // on every scroll frame (typically 60 fps on mobile).
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore map state from sessionStorage on first client-side mount.
  // useEffect only runs in the browser so typeof-window guards are unnecessary.
  useEffect(() => {
    const saved = loadPersistedMapState();
    if (saved.lat !== undefined) setMapLat(saved.lat);
    if (saved.lng !== undefined) setMapLng(saved.lng);
    if (saved.level !== undefined) setMapLevel(saved.level);
    if (saved.filter) setFilter(saved.filter);
    if (saved.searchQuery !== undefined) setSearchQuery(saved.searchQuery);
    if (saved.selectedRegion) setSelectedRegion(saved.selectedRegion);
    // Restore GPS radius preference (not the coords – those are obtained fresh each session)
    if (saved.gpsRadius !== undefined) setGpsRadius(saved.gpsRadius);
    // Restore date range preset
    if (saved.dateRangePreset) setDateRangePreset(saved.dateRangePreset);
    // Restore view mode – but only if the Kakao key is present; if it's missing
    // the map will fail anyway, so always default to list in that case.
    // `hasKakaoKey` is a compile-time constant derived from process.env so it
    // never changes between renders – reading it here is safe.
    const kakaoKeyAvailable = !!process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (saved.viewMode && kakaoKeyAvailable) setViewMode(saved.viewMode);
    setMapStateRestored(true);
  }, []); // intentionally empty – run once on mount only

  // Restore the list scroll position after the list is rendered (viewMode === 'list').
  // We wait until the next frame so the list DOM is fully painted before scrolling.
  useEffect(() => {
    if (!mapStateRestored || viewMode !== 'list') return;
    const saved = loadPersistedMapState();
    if (saved.listScrollY && listContainerRef.current) {
      // rAF ensures the list has rendered before we attempt to scroll
      requestAnimationFrame(() => {
        if (listContainerRef.current) {
          listContainerRef.current.scrollTop = saved.listScrollY ?? 0;
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapStateRestored]); // run once after restoration; viewMode dep would re-trigger on every toggle

  // Persist state to sessionStorage whenever it changes (after restoration).
  // This captures the latest position before the user navigates away, so it
  // is available when they return via the back button or back link.
  // listScrollY is updated via a separate scroll-event handler (below).
  useEffect(() => {
    if (!mapStateRestored) return;
    const listScrollY = listContainerRef.current?.scrollTop ?? 0;
    savePersistedMapState({ lat: mapLat, lng: mapLng, level: mapLevel, filter, searchQuery, viewMode, listScrollY, selectedRegion, gpsRadius, dateRangePreset });
  }, [mapStateRestored, mapLat, mapLng, mapLevel, filter, searchQuery, viewMode, selectedRegion, gpsRadius, dateRangePreset]);

  // Viewport-based event loading – fetches markers visible in the current map area.
  // Seeded with server-side initialEvents so markers render before Kakao SDK loads.
  // initialBounds lets the hook pre-seed the LRU cache so the map's first viewport
  // update hits the cache instead of making an API call.
  // Compute date range from the selected preset (recomputed on each render so 'TODAY'
  // always reflects the actual current date rather than a stale cached value).
  const activeDateRange = getDateRangeFromPreset(dateRangePreset) ?? undefined;

  const { events, isLoading, error, updateViewport } = useViewportEvents({
    filters: {
      eventType: filter === 'ALL' ? undefined : filter,
      q: searchQuery || undefined,
      // Activate GPS radius filter only when location is confirmed and a radius is selected.
      // When either condition is missing the filter is omitted and all viewport events load.
      gpsRadius:
        geoStatus === 'success' && geoCoords && gpsRadius
          ? { lat: geoCoords.lat, lng: geoCoords.lng, radiusKm: gpsRadius }
          : undefined,
      // Date range filter: undefined means no date restriction (show all events).
      dateRange: activeDateRange,
    },
    initialEvents: filter === 'ALL' && !searchQuery && dateRangePreset === 'ALL' ? initialEvents : [],
    initialBounds: SEOUL_DEFAULT_BOUNDS,
  });

  // Track the last known map bounds so filter/search changes can trigger re-fetch
  const lastBoundsRef = useRef<ViewportBounds | null>(null);

  // Guard: prevent the "no results" overlay from flashing before the map has
  // initialised and emitted its first bounds event (which triggers the first fetch).
  // Without this, restoring an active filter from sessionStorage would briefly show
  // "no results" while the Kakao SDK is still loading (events = [], isLoading = false).
  const mapBoundsReadyRef = useRef(false);
  const [mapBoundsReady, setMapBoundsReady] = useState(false);

  const handleBoundsChange = useCallback(
    (bounds: ViewportBounds) => {
      // Mark ready on first call (ref prevents repeated setState calls)
      if (!mapBoundsReadyRef.current) {
        mapBoundsReadyRef.current = true;
        setMapBoundsReady(true);
      }
      lastBoundsRef.current = bounds;
      updateViewport(bounds);
    },
    [updateViewport]
  );

  // When the Kakao Map SDK fails to load (e.g. missing API key), fall back to list view
  // and load events for the default Seoul bounding box so users can still browse.
  const handleMapError = useCallback(() => {
    setMapFailed(true);
    setViewMode('list');
    updateViewport(SEOUL_DEFAULT_BOUNDS);
  }, [updateViewport]);

  // Called by KakaoMap on every `idle` event (after pan/zoom settles).
  // Updates the persisted map position so navigating back restores the correct viewport.
  const handleViewportChange = useCallback((state: MapViewportState) => {
    setMapLat(state.lat);
    setMapLng(state.lng);
    setMapLevel(state.level);
  }, []);

  // Handle region chip selection: pan the map and fetch events for the new area.
  // In list-mode (or when the map has failed) we bypass the map and call
  // updateViewport directly with the region's predefined bounding box.
  //
  // ⚠️  Mutual exclusion: activating a region deactivates the GPS radius filter.
  //     The two filters control the same viewport, so only one should be active
  //     at a time.  GPS radius → region transition is instant (setGpsRadius clears
  //     the filter and the region selection drives the new viewport).
  const handleRegionSelect = useCallback(
    (region: SeoulRegion) => {
      setSelectedRegion(region.id);
      setRegionPanelOpen(false); // close dropdown panel after selection
      // Deactivate GPS radius when user explicitly picks a region
      setGpsRadius(null);

      const regionBounds: ViewportBounds = {
        swLat: region.swLat,
        swLng: region.swLng,
        neLat: region.neLat,
        neLng: region.neLng,
      };

      if (mapFailed || viewMode === 'list') {
        // No map available – fetch directly using predefined bounds
        lastBoundsRef.current = regionBounds;
        updateViewport(regionBounds);
      } else {
        // Map available – set panTarget; the map's `idle` event will call
        // onBoundsChange → handleBoundsChange → updateViewport automatically.
        setPanTarget({ lat: region.lat, lng: region.lng, level: region.level });
      }
    },
    [mapFailed, viewMode, updateViewport]
  );

  // ── GPS radius change handler ─────────────────────────────────────────────
  // Wraps setGpsRadius with mutual exclusion: selecting a GPS radius clears the
  // region filter back to 'seoul' (the neutral all-Seoul view), since the two
  // filters control the same viewport and should not conflict visually.
  // Passing null clears the GPS filter without touching the region selection,
  // allowing the user to return to the current region after disabling radius mode.
  const handleGpsRadiusChange = useCallback(
    (newRadius: number | null) => {
      setGpsRadius(newRadius);
      if (newRadius !== null) {
        // GPS radius takes precedence → reset region chip to neutral 'seoul'
        setSelectedRegion('seoul');
      }
    },
    []
  );

  // Re-fetch when category filter, search, or date range changes (reuse cached bounds).
  // Note: dateRangePreset is included here as a backup trigger in addition to the
  // internal useViewportEvents effect, ensuring date changes always cause an immediate
  // refetch even if the hook's effect fires slightly later.
  useEffect(() => {
    const bounds = lastBoundsRef.current ?? (mapFailed ? SEOUL_DEFAULT_BOUNDS : null);
    if (bounds) {
      updateViewport(bounds);
    }
  }, [filter, searchQuery, dateRangePreset, updateViewport, mapFailed]);

  // Clear any open event popup when the filter combination changes so that a stale
  // event card from a previous category/date selection is not left floating on the
  // map after the underlying markers have been replaced.
  useEffect(() => {
    setSelectedEvent(null);
  }, [filter, dateRangePreset, searchQuery]);

  // ── GPS radius filter effect ─────────────────────────────────────────────────
  // When the user selects a GPS radius (or GPS is first granted with a radius already
  // selected), update the viewport to the circle's bounding box and pan the map to
  // the user's location at an appropriate zoom level.
  //
  // When the radius is cleared (gpsRadius → null) we let the normal map pan / filter-
  // change cycle pick up: the hook's auto-refetch sees the gpsRadius filter removed
  // and re-fetches with lastBoundsRef (which still points to the radius bbox).  In map
  // mode the user can then freely pan, which will refetch for the new viewport.
  useEffect(() => {
    if (!gpsRadius || geoStatus !== 'success' || !geoCoords) return;

    const radiusBounds = computeBoundsFromRadius(geoCoords.lat, geoCoords.lng, gpsRadius);
    // Update the component-level lastBoundsRef so subsequent filter changes
    // (category, search) re-fetch with the radius bounding box.
    lastBoundsRef.current = radiusBounds;

    if (mapFailed || viewMode === 'list') {
      // No map: fetch events directly for the radius bounding box.
      // The gpsRadius filter in useViewportEvents will further narrow to the circle.
      updateViewport(radiusBounds);
    } else {
      // Map available: call updateViewport so the hook pre-loads the radius bbox,
      // then pan the map to the user's location at the appropriate zoom level.
      // The map's subsequent `idle` event will re-call handleBoundsChange with the
      // actual viewport bounds, which will be close to radiusBounds.
      updateViewport(radiusBounds);
      setPanTarget({
        lat: geoCoords.lat,
        lng: geoCoords.lng,
        level: getZoomLevelForRadius(gpsRadius),
      });
    }
  // Note: deliberately using primitive dependencies (geoCoords?.lat/lng) to avoid
  // re-firing when the geoCoords object reference changes but values stay the same.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsRadius, geoCoords?.lat, geoCoords?.lng, geoStatus, mapFailed, viewMode]);

  const markers: MapMarker[] = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        lat: event.latitude,
        lng: event.longitude,
        title: event.name,
        color: EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] ?? '#6B7280',
        onClick: (id: string) => {
          const found = events.find((e) => e.id === id);
          if (found) setSelectedEvent(found);
        },
      })),
    [events]
  );

  // Count per type from current viewport events
  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    });
    return counts;
  }, [events]);

  // ── Inner render helper: event list body ────────────────────────────────────
  // Shared between the mobile list view and the desktop sidebar list panel.
  // Renders status banners, loading/empty states, and the event list items.
  // The outer scroll container is provided by the caller so each context can
  // apply its own ref, scroll persistence, and className.
  function renderEventListContent() {
    return (
      <>
        {mapFailed && (
          <div className="mx-4 mt-3 mb-1 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
            <span>ℹ️</span>
            <span>지도를 불러올 수 없어 목록으로 표시합니다.</span>
          </div>
        )}

        {gpsRadius !== null && geoStatus === 'success' && (
          <div className="mx-4 mt-3 mb-1 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span>📍</span>
              <span>내 위치 {gpsRadius}km 이내 행사 {events.length}개</span>
            </span>
            <button
              type="button"
              onClick={() => handleGpsRadiusChange(null)}
              className="text-xs text-blue-500 hover:text-blue-700 font-medium underline underline-offset-2 flex-shrink-0"
              aria-label="GPS 반경 필터 해제"
            >
              해제
            </button>
          </div>
        )}

        {dateRangePreset !== 'ALL' && (
          <div className="mx-4 mt-3 mb-1 px-4 py-2.5 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span>📅</span>
              <span>
                {dateRangePreset === 'TODAY' && '오늘 행사'}
                {dateRangePreset === 'THIS_WEEK' && '이번 주 행사'}
                {dateRangePreset === 'THIS_MONTH' && '이번 달 행사'}
                {' '}{events.length}개
              </span>
            </span>
            <button
              type="button"
              onClick={() => setDateRangePreset('ALL')}
              className="text-xs text-yellow-600 hover:text-yellow-800 font-medium underline underline-offset-2 flex-shrink-0"
              aria-label="날짜 범위 필터 해제"
            >
              해제
            </button>
          </div>
        )}

        {isLoading && events.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-500 text-sm">행사 불러오는 중...</p>
            </div>
          </div>
        ) : events.length === 0 ? (
          (() => {
            const hasActiveFilter =
              filter !== 'ALL' ||
              dateRangePreset !== 'ALL' ||
              !!searchQuery.trim() ||
              (gpsRadius !== null && geoStatus === 'success');
            const activeFilterCount = [
              filter !== 'ALL',
              dateRangePreset !== 'ALL',
              !!searchQuery.trim(),
              gpsRadius !== null && geoStatus === 'success',
            ].filter(Boolean).length;
            return (
              <div className="flex flex-col items-center justify-center h-40 px-6 gap-3 text-center">
                <span className="text-3xl" aria-hidden="true">🔍</span>
                <div>
                  <p className="text-gray-600 text-sm font-medium">일치하는 행사가 없습니다</p>
                  {hasActiveFilter && (
                    <p className="text-gray-400 text-xs mt-1">
                      {activeFilterCount >= 2
                        ? '선택한 필터 조건을 모두 만족하는 행사가 없습니다'
                        : '다른 필터 조합을 시도해 보세요'}
                    </p>
                  )}
                </div>
                {hasActiveFilter && (
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {filter !== 'ALL' && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                        style={{ backgroundColor: EVENT_TYPE_COLORS[filter as keyof typeof EVENT_TYPE_COLORS] }}
                      >
                        {EVENT_TYPE_LABELS[filter as keyof typeof EVENT_TYPE_LABELS]}
                      </span>
                    )}
                    {dateRangePreset !== 'ALL' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400 text-white font-medium">
                        {dateRangePreset === 'TODAY' ? '오늘' : dateRangePreset === 'THIS_WEEK' ? '이번 주' : '이번 달'}
                      </span>
                    )}
                    {searchQuery.trim() && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium truncate max-w-[10rem]">
                        &ldquo;{searchQuery.trim()}&rdquo;
                      </span>
                    )}
                    {gpsRadius !== null && geoStatus === 'success' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        📍 {gpsRadius}km 이내
                      </span>
                    )}
                  </div>
                )}
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('ALL');
                      setDateRangePreset('ALL');
                      setSearchQuery('');
                      handleGpsRadiusChange(null);
                    }}
                    className="text-xs text-yellow-600 hover:text-yellow-700 font-medium underline underline-offset-2"
                    aria-label="모든 필터 초기화"
                  >
                    필터 초기화
                  </button>
                )}
              </div>
            );
          })()
        ) : (
          <ul className="divide-y divide-gray-100">
            {events.map((event) => (
              <li key={event.id}>
                <div className="flex items-center hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <Link
                    href={`/events/${event.id}`}
                    className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0"
                  >
                    <span className="mt-0.5 text-lg flex-shrink-0" aria-hidden="true">
                      {event.eventType === 'FESTIVAL' ? '🎉' : event.eventType === 'FLEA_MARKET' ? '🛍️' : '🌙'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded text-white"
                          style={{
                            backgroundColor:
                              EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] ?? '#6B7280',
                          }}
                        >
                          {EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] ?? event.eventType}
                        </span>
                        {event.isFree && (
                          <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            무료
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{event.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">📍 {event.district || event.city} · {event.venue}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        📅{' '}
                        {new Date(event.startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}{' '}
                        ~{' '}
                        {new Date(event.endDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-0.5 pr-2 flex-shrink-0 self-center">
                    <BookmarkButton eventId={event.id} size="sm" />
                    <span className="text-gray-300 text-lg" aria-hidden="true">›</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="safe-area-bottom" aria-hidden="true" />
      </>
    );
  }

  return (
    /*
     * Desktop layout shell
     * ─────────────────────────────────────────────────────────────────────────
     * Mobile  (< 1024 px): flex-col — header → filters → map/list area stacked.
     * Desktop (≥ 1024 px): flex-row via .desktop-app-shell — left sidebar (380 px)
     *   always shows filters + scrollable event list; map fills the remaining
     *   width on the right and is always visible.
     * The viewMode toggle (map ↔ list) only affects the mobile layout; on desktop
     * both the sidebar list and the map are always rendered side by side.
     */
    <div className="flex flex-col h-dvh-safe bg-white desktop-app-shell">

      {/* ══════════════════════════════════════════════════════════════════════
          LEFT SIDEBAR
          Mobile : natural height, part of the vertical flex-col stack.
          Desktop: fixed 380 px wide panel on the left; its own flex-col
                   keeps the filters at top and the event list scrollable below.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col flex-shrink-0 desktop-sidebar">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm z-10 flex-shrink-0">
        <h1 className="text-xl font-bold text-yellow-500 flex items-center gap-1">
          🗺️ <span>FestiMap</span>
        </h1>
        <div className="flex items-center gap-2">
          {isLoading ? (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin inline-block" />
              로딩 중
            </span>
          ) : (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {events.length}개 행사
            </span>
          )}
          {/* Map/List toggle – mobile only; desktop always shows both sidebar list and map */}
          <button
            onClick={() => setViewMode((v) => (v === 'map' ? 'list' : 'map'))}
            className="lg:hidden text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-full font-medium transition-colors"
            aria-label={viewMode === 'map' ? '목록으로 보기' : '지도로 보기'}
          >
            {viewMode === 'map' ? '📋 목록' : '🗺️ 지도'}
          </button>
          <Link
            href="/bookmarks"
            className="text-xs text-gray-600 hover:text-gray-900 font-medium flex items-center gap-0.5"
            aria-label="내 북마크"
          >
            🔖 북마크
          </Link>
          {/* 인증 상태에 따라 로그인/로그아웃 표시 */}
          {!isAuthLoading && (
            isAuthenticated ? (
              <button
                type="button"
                onClick={logout}
                className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                aria-label={authUser?.name ? `${authUser.name} 로그아웃` : '로그아웃'}
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                className="text-xs text-gray-600 hover:text-gray-900 font-medium"
              >
                로그인
              </Link>
            )
          )}
        </div>
      </header>

      {/* ── Search bar ── */}
      <div className="px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0">
        <input
          type="text"
          placeholder="🔍 행사명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 text-sm bg-gray-50 rounded-full border border-gray-200 focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
        />
      </div>

      {/* ── GPS 반경 필터 ─────────────────────────────────────────────────────────
          GPS 위치가 확인된 경우에만 표시됩니다.
          반경을 선택하면 해당 거리 이내의 행사만 지도/목록에 표시됩니다.
          지도는 사용자 위치로 자동 이동하며 적절한 줌 레벨이 설정됩니다.  */}
      {geoStatus === 'success' && geoCoords && (
        <div
          className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 border-b border-blue-100 flex-shrink-0 overflow-x-auto scrollbar-hide momentum-scroll snap-x-proximity"
          role="group"
          aria-label="내 위치 기반 반경 필터"
        >
          {/* Label */}
          <span
            className="text-xs text-blue-700 font-medium whitespace-nowrap flex-shrink-0"
            aria-hidden="true"
          >
            📍 근처
          </span>

          {/* "전체" – 반경 해제 버튼 */}
          <button
            type="button"
            onClick={() => handleGpsRadiusChange(null)}
            aria-pressed={gpsRadius === null}
            aria-label="반경 필터 해제, 전체 지역 보기"
            className={[
              'flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
              gpsRadius === null
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-100 active:bg-blue-200',
            ].join(' ')}
          >
            전체
          </button>

          {/* Radius option chips */}
          {GPS_RADIUS_OPTIONS.map(({ km, label }) => (
            <button
              key={km}
              type="button"
              // Toggle: clicking the active radius clears it; clicking a new one selects it
              onClick={() => handleGpsRadiusChange(km === gpsRadius ? null : km)}
              aria-pressed={gpsRadius === km}
              aria-label={`${label} 이내 행사만 보기${gpsRadius === km ? ' (선택됨)' : ''}`}
              className={[
                'flex-shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                gpsRadius === km
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-100 active:bg-blue-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}

          {/* Active radius indicator badge */}
          {gpsRadius !== null && (
            <span className="flex-shrink-0 text-xs text-blue-500 font-medium whitespace-nowrap ml-1">
              ← {gpsRadius}km 이내 필터 중
            </span>
          )}
        </div>
      )}

      {/* ── 지역 필터 ──
          RegionFilter 컴포넌트: 서울·수도권 지역 칩 + 드롭다운 패널.
          사용자의 GPS 위치와 무관하게 원하는 지역을 직접 선택할 수 있습니다.
          지역 선택 시 지도 모드에서는 해당 지역으로 지도가 이동하고,
          목록 모드 / 지도 오류 시에는 해당 지역의 행사를 직접 조회합니다.  */}
      <RegionFilter
        selectedRegion={selectedRegion}
        onSelect={handleRegionSelect}
        isPanelOpen={regionPanelOpen}
        onTogglePanel={() => setRegionPanelOpen((prev) => !prev)}
        onClosePanel={() => setRegionPanelOpen(false)}
      />

      {/* ── Category filter tabs ── */}
      {/* CategoryFilter 컴포넌트: 축제/플리마켓/야시장/전체 카테고리 필터 탭.
          activeFilter 변경 시 useViewportEvents 훅이 새 eventType 파라미터로
          API를 재호출하고, 반환된 events에서 markers를 재계산하여
          지도 마커와 목록이 자동으로 업데이트됩니다. */}
      <CategoryFilter
        activeFilter={filter}
        onFilterChange={setFilter}
        countByType={countByType}
        totalCount={events.length}
        isLoading={isLoading}
      />

      {/* ── 날짜 범위 필터 ──
          DateRangeFilter 컴포넌트: 오늘 / 이번 주 / 이번 달 / 전체 기간 필터.
          프리셋 선택 시 해당 기간에 진행 중이거나 예정된 행사만 표시됩니다.
          API에 startDate/endDate 파라미터로 전달되며, useViewportEvents 훅이
          필터 변경을 감지하여 현재 뷰포트를 자동으로 재조회합니다. */}
      <DateRangeFilter
        activePreset={dateRangePreset}
        onPresetChange={setDateRangePreset}
      />

        {/* ── Desktop sidebar event list ─────────────────────────────────────────
            Hidden on mobile (handled by the map-area list view below).
            On desktop (lg+): flex-1 makes this fill all remaining sidebar height,
            overflow-y-auto enables independent scrolling within the sidebar panel.
            Uses the shared renderEventListContent() helper so the same event items,
            banners and empty states appear here and in the mobile list view.       */}
        <div className="hidden lg:flex flex-col flex-1 overflow-hidden border-t border-gray-100">
          <div className="flex-1 overflow-y-auto bg-white momentum-scroll smooth-scroll scrollbar-hide">
            {renderEventListContent()}
          </div>
        </div>

      </div>{/* end desktop-sidebar */}

      {/* ══════════════════════════════════════════════════════════════════════
          RIGHT MAP AREA
          Mobile : flex-1, contains either the Kakao Map or the list view
                   depending on viewMode (toggled via the header button above).
          Desktop: flex-1 (via .desktop-map-area), Kakao Map is always visible
                   and fills the full right column; the mobile list view is
                   hidden via lg:hidden.
          ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 relative overflow-hidden desktop-map-area">

        {/* MAP VIEW
            Mobile : visible only when viewMode === 'map' (hidden otherwise so the
                     list view below can fill the same space).
            Desktop: always visible via `lg:block` override regardless of viewMode,
                     because the event list lives in the sidebar and the map area
                     is dedicated to the map full-time.                           */}
        <div className={`absolute inset-0 map-touch-container ${viewMode !== 'map' ? 'hidden lg:block' : ''}`}>
          {/* Only mount MapContainer after sessionStorage state has been restored.
              This guarantees the Kakao map is initialised at the correct (persisted)
              centre & zoom level rather than the Seoul-city-hall default. */}
          {mapStateRestored ? (
            <MapContainer
              lat={mapLat}
              lng={mapLng}
              level={mapLevel}
              markers={markers}
              className="w-full h-full"
              userLocation={geoStatus === 'success' ? geoCoords : null}
              panTarget={panTarget}
              onBoundsChange={handleBoundsChange}
              onViewportChange={handleViewportChange}
              onError={handleMapError}
            />
          ) : (
            /* Identical loading skeleton shown while sessionStorage is read (< 1 frame) */
            <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-500 text-sm">지도 불러오는 중...</p>
              </div>
            </div>
          )}

          {/* Viewport API error toast */}
          {error && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20
                         bg-red-50 border border-red-200 rounded-lg px-4 py-2
                         shadow text-sm text-red-600 max-w-xs text-center"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Geolocation error toast */}
          {geoErrorVisible && geoError && (
            <div
              className="absolute top-3 left-1/2 -translate-x-1/2 z-20
                         bg-amber-50 border border-amber-200 rounded-lg px-4 py-2
                         shadow text-sm text-amber-700 max-w-xs text-center"
              role="alert"
              aria-live="polite"
            >
              {geoError}
            </div>
          )}

          {/* ── 필터 조합 결과 없음 오버레이 ─────────────────────────────────────
               카테고리 + 날짜 필터(AND 로직), GPS 반경 필터, 또는 검색어 적용 후
               결과가 없을 때 지도 위에 비침투적인 카드로 안내를 표시합니다.
               - 로딩 중이 아닐 때만 표시 (플래시 방지)
               - 지도가 최초 bounds를 수신한 후에만 표시 (세션 복원 시 깜빡임 방지)
               - 필터가 하나 이상 활성화된 경우에만 표시 (빈 지역 이동과 구분)
               - 적용 중인 필터 칩과 "필터 초기화" 버튼 포함              */}
          {!isLoading && !error && events.length === 0 &&
            mapStateRestored && mapBoundsReady &&
            (filter !== 'ALL' || dateRangePreset !== 'ALL' || searchQuery.trim() !== '' ||
             (gpsRadius !== null && geoStatus === 'success')) && (
            <div
              className="absolute top-3 left-4 right-16 z-20
                         bg-white/95 backdrop-blur-sm border border-gray-200
                         rounded-xl px-4 py-3 shadow-md"
              role="status"
              aria-live="polite"
              aria-label="필터 결과 없음"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl flex-shrink-0" aria-hidden="true">🔍</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">일치하는 행사가 없습니다</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {/* 복수 필터 조합 시 AND 로직 안내 */}
                    {[
                      filter !== 'ALL',
                      dateRangePreset !== 'ALL',
                      searchQuery.trim() !== '',
                      gpsRadius !== null && geoStatus === 'success',
                    ].filter(Boolean).length >= 2
                      ? '선택한 필터 조건을 모두 만족하는 행사가 없습니다'
                      : '필터 조건을 변경해 보세요'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFilter('ALL');
                    setDateRangePreset('ALL');
                    setSearchQuery('');
                    handleGpsRadiusChange(null);
                  }}
                  className="text-xs text-yellow-600 hover:text-yellow-700 font-medium
                             whitespace-nowrap flex-shrink-0 underline underline-offset-2"
                  aria-label="모든 필터 초기화"
                >
                  초기화
                </button>
              </div>
              {/* 현재 활성 필터 칩 표시 – AND 로직으로 조합된 조건 시각화 */}
              <div className="flex flex-wrap gap-1 mt-2" aria-label="활성 필터">
                {filter !== 'ALL' && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{
                      backgroundColor:
                        EVENT_TYPE_COLORS[filter as keyof typeof EVENT_TYPE_COLORS],
                    }}
                  >
                    {EVENT_TYPE_LABELS[filter as keyof typeof EVENT_TYPE_LABELS]}
                  </span>
                )}
                {dateRangePreset !== 'ALL' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400 text-white font-medium">
                    {dateRangePreset === 'TODAY'
                      ? '오늘'
                      : dateRangePreset === 'THIS_WEEK'
                      ? '이번 주'
                      : '이번 달'}
                  </span>
                )}
                {searchQuery.trim() && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium truncate max-w-[8rem]">
                    &ldquo;{searchQuery.trim()}&rdquo;
                  </span>
                )}
                {gpsRadius !== null && geoStatus === 'success' && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                    📍 {gpsRadius}km 이내
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 내 위치 (My Location) button */}
          <button
            onClick={requestLocation}
            disabled={geoStatus === 'loading'}
            aria-label="내 위치로 이동"
            style={{ bottom: selectedEvent ? '9rem' : '1.5rem' }}
            className={[
              'absolute right-4 z-20',
              'w-11 h-11 rounded-full shadow-md border border-gray-200',
              'flex items-center justify-center',
              'transition-all duration-200',
              geoStatus === 'loading'
                ? 'bg-white cursor-wait'
                : geoStatus === 'success'
                  ? 'bg-blue-500 hover:bg-blue-600 border-blue-500'
                  : 'bg-white hover:bg-gray-50',
            ].join(' ')}
          >
            {geoStatus === 'loading' ? (
              <span
                className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`w-5 h-5 ${geoStatus === 'success' ? 'stroke-white' : 'stroke-gray-600'}`}
                aria-hidden="true"
              >
                {/* Crosshair / location target icon */}
                <circle cx="12" cy="12" r="4" />
                <line x1="12" y1="2" x2="12" y2="6" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="2" y1="12" x2="6" y2="12" />
                <line x1="18" y1="12" x2="22" y2="12" />
              </svg>
            )}
          </button>

          {/* Selected event card – shown when a map marker is tapped */}
          {selectedEvent && (
            <EventCard
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </div>

        {/* LIST VIEW – mobile only
            On desktop the sidebar already shows the event list permanently, so this
            full-screen overlay is hidden via `lg:hidden` even when viewMode is 'list'.
            The same renderEventListContent() helper is used here and in the sidebar
            to keep both lists in sync without duplicating JSX.                      */}
        {viewMode === 'list' && (
          <div
            ref={listContainerRef}
            className="lg:hidden absolute inset-0 overflow-y-auto bg-white momentum-scroll smooth-scroll scrollbar-hide"
            onScroll={() => {
              // Debounce scroll saves so we write to sessionStorage at most once
              // per 150 ms – plenty fast enough for back-navigation restoration.
              if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current);
              scrollSaveTimerRef.current = setTimeout(() => {
                if (!listContainerRef.current || !mapStateRestored) return;
                const scrollY = listContainerRef.current.scrollTop;
                // Read the current snapshot from sessionStorage rather than using
                // React state values which could be stale inside the closure.
                const saved = loadPersistedMapState();
                if (saved.lat !== undefined) {
                  savePersistedMapState({
                    lat: saved.lat,
                    lng: saved.lng ?? DEFAULT_LNG,
                    level: saved.level ?? DEFAULT_LEVEL,
                    filter: saved.filter ?? 'ALL',
                    searchQuery: saved.searchQuery ?? '',
                    viewMode: saved.viewMode ?? 'list',
                    listScrollY: scrollY,
                    selectedRegion: saved.selectedRegion ?? 'seoul',
                    gpsRadius: saved.gpsRadius ?? null,
                    dateRangePreset: saved.dateRangePreset ?? 'ALL',
                  });
                }
              }, 150);
            }}
          >
            {renderEventListContent()}
          </div>
        )}
      </div>{/* end desktop-map-area */}
    </div>
  );
}

// ── EventCard – shown over the map when a marker is tapped ───────────────────
function EventCard({
  event,
  onClose,
}: {
  event: ViewportEvent;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden z-20">
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                style={{
                  backgroundColor:
                    EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] ||
                    '#6B7280',
                }}
              >
                {EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] ||
                  event.eventType}
              </span>
              {event.isFree && (
                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  무료
                </span>
              )}
            </div>
            <h2 className="font-bold text-gray-900 text-base leading-tight truncate">
              {event.name}
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              📍 {event.district || event.city} · {event.venue}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              📅{' '}
              {new Date(event.startDate).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
              })}{' '}
              ~{' '}
              {new Date(event.endDate).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
          {/* 북마크 버튼 + 닫기 버튼 */}
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <BookmarkButton eventId={event.id} size="sm" />
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 active:bg-gray-200 text-xl transition-colors"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>
        <Link
          href={`/events/${event.id}`}
          className="mt-3 block w-full text-center py-2 px-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors"
        >
          자세히 보기 →
        </Link>
      </div>
    </div>
  );
}
