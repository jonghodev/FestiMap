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

type FilterType = 'ALL' | 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

export default function MapPageClient() {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<ViewportEvent | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Viewport-based event loading – only fetches markers visible in the current map area
  const { events, isLoading, error, updateViewport } = useViewportEvents({
    eventType: filter === 'ALL' ? undefined : filter,
    q: searchQuery || undefined,
  });

  // Remember the last known viewport so filter/search changes can trigger re-fetch
  const lastBoundsRef = useRef<ViewportBounds | null>(null);

  const handleBoundsChange = useCallback(
    (bounds: ViewportBounds) => {
      lastBoundsRef.current = bounds;
      updateViewport(bounds);
    },
    [updateViewport]
  );

  // Re-fetch when filter or search changes (using cached bounds)
  useEffect(() => {
    if (lastBoundsRef.current) {
      updateViewport(lastBoundsRef.current);
    }
  }, [filter, searchQuery, updateViewport]);

  const markers: MapMarker[] = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        lat: event.latitude,
        lng: event.longitude,
        title: event.name,
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
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm z-10">
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
          <Link
            href="/login"
            className="text-xs text-gray-600 hover:text-gray-900 font-medium"
          >
            로그인
          </Link>
        </div>
      </header>

      {/* Search bar */}
      <div className="px-4 py-2 bg-white border-b border-gray-100">
        <input
          type="text"
          placeholder="🔍 행사명 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 text-sm bg-gray-50 rounded-full border border-gray-200 focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto">
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

      {/* Map */}
      <div className="flex-1 relative overflow-hidden">
        <MapContainer
          lat={37.5665}
          lng={126.978}
          level={8}
          markers={markers}
          className="w-full h-full"
          onBoundsChange={handleBoundsChange}
        />

        {/* Error toast */}
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

        {/* Selected event card */}
        {selectedEvent && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden z-20">
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                      style={{
                        backgroundColor:
                          EVENT_TYPE_COLORS[selectedEvent.eventType as keyof typeof EVENT_TYPE_COLORS] ||
                          '#6B7280',
                      }}
                    >
                      {EVENT_TYPE_LABELS[selectedEvent.eventType as keyof typeof EVENT_TYPE_LABELS] ||
                        selectedEvent.eventType}
                    </span>
                    {selectedEvent.isFree && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        무료
                      </span>
                    )}
                  </div>
                  <h2 className="font-bold text-gray-900 text-base leading-tight truncate">
                    {selectedEvent.name}
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    📍 {selectedEvent.district || selectedEvent.city} · {selectedEvent.venue}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    📅{' '}
                    {new Date(selectedEvent.startDate).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                    })}{' '}
                    ~{' '}
                    {new Date(selectedEvent.endDate).toLocaleDateString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none mt-0.5 flex-shrink-0"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <Link
                href={`/events/${selectedEvent.id}`}
                className="mt-3 block w-full text-center py-2 px-4 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors"
              >
                자세히 보기 →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
