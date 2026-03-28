'use client';

import { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { EventSummary, EVENT_TYPE_LABELS } from '@/types/index';
import type { MapMarker } from '@/components/map/KakaoMap';

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

interface MapPageClientProps {
  events: (EventSummary & { description?: string | null })[];
}

export default function MapPageClient({ events }: MapPageClientProps) {
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesFilter = filter === 'ALL' || event.eventType === filter;
      const matchesSearch = searchQuery === '' || 
        event.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [events, filter, searchQuery]);

  const markers: MapMarker[] = useMemo(
    () =>
      filteredEvents.map((event) => ({
        id: event.id,
        lat: event.latitude,
        lng: event.longitude,
        title: event.name,
        onClick: (id: string) => {
          const found = events.find((e) => e.id === id);
          if (found) setSelectedEvent(found);
        },
      })),
    [filteredEvents, events]
  );

  const filterButtons: { type: FilterType; label: string; icon: string }[] = [
    { type: 'ALL', label: '전체', icon: '📍' },
    { type: 'FESTIVAL', label: '축제', icon: '🎉' },
    { type: 'FLEA_MARKET', label: '플리마켓', icon: '🛍️' },
    { type: 'NIGHT_MARKET', label: '야시장', icon: '🌙' },
  ];

  return (
    <main className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm z-10">
        <h1 className="text-xl font-bold text-yellow-500 flex items-center gap-1">
          🗺️ <span>FestiMap</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {filteredEvents.length}개 행사
          </span>
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
              {type !== 'ALL' && (
                <span className={`ml-0.5 ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                  ({events.filter((e) => e.eventType === type).length})
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
        />

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
                          EVENT_TYPE_COLORS[selectedEvent.eventType as keyof typeof EVENT_TYPE_COLORS] || '#6B7280',
                      }}
                    >
                      {EVENT_TYPE_LABELS[selectedEvent.eventType as keyof typeof EVENT_TYPE_LABELS] || selectedEvent.eventType}
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
                    📅 {new Date(selectedEvent.startDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ~{' '}
                    {new Date(selectedEvent.endDate).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
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
