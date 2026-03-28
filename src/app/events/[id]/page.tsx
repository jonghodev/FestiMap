import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { EVENT_TYPE_LABELS } from '@/types/index';

const EVENT_TYPE_COLORS = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#2C3E50',
} as const;

interface EventPageProps {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) {
    notFound();
  }

  const typeLabel = EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] || event.eventType;
  const typeColor = EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] || '#6B7280';

  const formatDate = (date: Date) =>
    date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-gray-600 hover:text-gray-900 p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="뒤로 가기"
          >
            ← 뒤로
          </Link>
          <h1 className="font-bold text-gray-900 text-base flex-1 truncate">
            행사 상세
          </h1>
        </div>
      </header>

      {/* Event image placeholder */}
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={event.name}
          className="w-full h-48 object-cover"
        />
      ) : (
        <div
          className="w-full h-48 flex items-center justify-center text-6xl"
          style={{ backgroundColor: typeColor + '20' }}
        >
          {event.eventType === 'FESTIVAL' ? '🎉' : event.eventType === 'FLEA_MARKET' ? '🛍️' : '🌙'}
        </div>
      )}

      {/* Content */}
      <div className="px-4 py-5 bg-white mb-2">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="text-sm font-medium px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: typeColor }}
          >
            {typeLabel}
          </span>
          {event.isFree ? (
            <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-full">
              무료
            </span>
          ) : event.price ? (
            <span className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              {event.price}
            </span>
          ) : null}
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
          {event.name}
        </h2>

        {event.description && (
          <p className="text-sm text-gray-600 leading-relaxed">
            {event.description}
          </p>
        )}
      </div>

      {/* Info cards */}
      <div className="px-4 py-4 bg-white mb-2 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">행사 정보</h3>

        <div className="space-y-2.5">
          {/* Date */}
          <div className="flex items-start gap-3">
            <span className="text-lg">📅</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">기간</p>
              <p className="text-sm text-gray-900 font-medium">
                {formatDate(event.startDate)}
              </p>
              {event.startDate.toDateString() !== event.endDate.toDateString() && (
                <p className="text-sm text-gray-600">
                  ~ {formatDate(event.endDate)}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start gap-3">
            <span className="text-lg">📍</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">장소</p>
              <p className="text-sm text-gray-900 font-medium">{event.venue}</p>
              <p className="text-sm text-gray-600">{event.address}</p>
            </div>
          </div>

          {/* Organizer */}
          {event.organizer && (
            <div className="flex items-start gap-3">
              <span className="text-lg">🏢</span>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">주최</p>
                <p className="text-sm text-gray-900 font-medium">{event.organizer}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-4 bg-white space-y-2">
        {/* Kakao Map link */}
        <a
          href={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors"
        >
          <span>🗺️</span>
          <span>카카오맵에서 길찾기</span>
        </a>

        {event.sourceUrl && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
          >
            <span>🔗</span>
            <span>공식 사이트 방문</span>
          </a>
        )}

        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-3 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium text-sm rounded-xl transition-colors"
        >
          ← 지도로 돌아가기
        </Link>
      </div>

      {/* Bottom safe area */}
      <div className="h-8" />
    </div>
  );
}
