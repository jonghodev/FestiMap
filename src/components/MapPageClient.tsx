'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { EVENT_TYPE_LABELS } from '@/types/index';
import type { MapMarker } from '@/components/map/KakaoMap';
import { useViewportEvents, type ViewportBounds, type ViewportEvent } from '@/hooks/useViewportEvents';

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

const EVENT_TYPE_COLORS = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#2C3E50',
} as const;

// Default Seoul metropolitan area bounds used when map is unavailable
const SEOUL_DEFAULT_BOUNDS: ViewportBounds = {
  swLat: 37.41,
  swLng: 126.76,
  neLat: 37.70,
  neLng: 127.18,
};

type FilterType = 'ALL' | 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

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
  const [mapFailed, setMapFailed] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');

  // Viewport-based event loading – fetches markers visible in the current map area.
  // Seeded with server-side initialEvents so markers render before Kakao SDK loads.
  // initialBounds lets the hook pre-seed the LRU cache so the map's first viewport
  // update hits the cache instead of making an API call.
  const { events, isLoading, error, updateViewport } = useViewportEvents({
    filters: {
      eventType: filter === 'ALL' ? undefined : filter,
      q: searchQuery || undefined,
    },
    initialEvents: filter === 'ALL' && !searchQuery ? initialEvents : [],
    initialBounds: SEOUL_DEFAULT_BOUNDS,
  });

  // Track the last known map bounds so filter/search changes can trigger re-fetch
  const lastBoundsRef = useRef<ViewportBounds | null>(null);

  const handleBoundsChange = useCallback(
    (bounds: ViewportBounds) => {
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

  // Re-fetch when filter or search changes (reuse cached bounds)
  useEffect(() => {
    const bounds = lastBoundsRef.current ?? (mapFailed ? SEOUL_DEFAULT_BOUNDS : null);
    if (bounds) {
      updateViewport(bounds);
    }
  }, [filter, searchQuery, updateViewport, mapFailed]);

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

  const filterButtons: { type: FilterType; label: string; icon: string }[] = [
    { type: 'ALL', label: '전체', icon: '📍' },
    { type: 'FESTIVAL', label: '축제', icon: '🎉' },
    { type: 'FLEA_MARKET', label: '플리마켓', icon: '🛍️' },
    { type: 'NIGHT_MARKET', label: '야시장', icon: '🌙' },
  ];

  // Count per type from current viewport events
  const countByType = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => {
      counts[e.eventType] = (counts[e.eventType] ?? 0) + 1;
    });
    return counts;
  }, [events]);

  return (
    <main className="flex flex-col h-screen bg-white">
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
          {/* Map/List toggle */}
          <button
            onClick={() => setViewMode((v) => (v === 'map' ? 'list' : 'map'))}
            className="text-xs text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded-full font-medium transition-colors"
            aria-label={viewMode === 'map' ? '목록으로 보기' : '지도로 보기'}
          >
            {viewMode === 'map' ? '📋 목록' : '🗺️ 지도'}
          </button>
          <Link
            href="/login"
            className="text-xs text-gray-600 hover:text-gray-900 font-medium"
          >
            로그인
          </Link>
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

      {/* ── Filter tabs ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto flex-shrink-0">
        {filterButtons.map(({ type, label, icon }) => {
          const isActive = filter === type;
          const color = type !== 'ALL' ? EVENT_TYPE_COLORS[type] : '#6B7280';
          const count = type !== 'ALL' ? (countByType[type] ?? 0) : undefined;
          return (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              style={isActive ? { backgroundColor: color } : {}}
            >
              <span>{icon}</span>
              <span>{label}</span>
              {count !== undefined && (
                <span className={`ml-0.5 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Main content area ── */}
      <div className="flex-1 relative overflow-hidden">

        {/* MAP VIEW */}
        <div className={`absolute inset-0 ${viewMode === 'map' ? '' : 'hidden'}`}>
          <MapContainer
            lat={37.5665}
            lng={126.978}
            level={8}
            markers={markers}
            className="w-full h-full"
            onBoundsChange={handleBoundsChange}
            onError={handleMapError}
          />

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

          {/* Selected event card – shown when a map marker is tapped */}
          {selectedEvent && (
            <EventCard
              event={selectedEvent}
              onClose={() => setSelectedEvent(null)}
            />
          )}
        </div>

        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="absolute inset-0 overflow-y-auto bg-white">
            {mapFailed && (
              <div className="mx-4 mt-3 mb-1 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-center gap-2">
                <span>ℹ️</span>
                <span>지도를 불러올 수 없어 목록으로 표시합니다.</span>
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
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                검색된 행사가 없습니다
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {events.map((event) => (
                  <li key={event.id}>
                    <Link
                      href={`/events/${event.id}`}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <span className="mt-0.5 text-lg flex-shrink-0" aria-hidden="true">
                        {event.eventType === 'FESTIVAL'
                          ? '🎉'
                          : event.eventType === 'FLEA_MARKET'
                          ? '🛍️'
                          : '🌙'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded text-white"
                            style={{
                              backgroundColor:
                                EVENT_TYPE_COLORS[
                                  event.eventType as keyof typeof EVENT_TYPE_COLORS
                                ] ?? '#6B7280',
                            }}
                          >
                            {EVENT_TYPE_LABELS[
                              event.eventType as keyof typeof EVENT_TYPE_LABELS
                            ] ?? event.eventType}
                          </span>
                          {event.isFree && (
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                              무료
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {event.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
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
                      <span className="text-gray-300 self-center flex-shrink-0 text-lg">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="h-6" />
          </div>
        )}
      </div>
    </main>
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
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5 flex-shrink-0"
            aria-label="닫기"
          >
            ×
          </button>
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
