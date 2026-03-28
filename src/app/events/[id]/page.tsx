import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
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

/** Generate dynamic page title and description for SEO / social sharing */
export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: { name: true, description: true, venue: true, city: true },
  });

  if (!event) {
    return { title: '행사를 찾을 수 없습니다 | FestiMap' };
  }

  const description = event.description
    ? event.description.slice(0, 120)
    : `${event.venue} (${event.city})`;

  return {
    title: `${event.name} | FestiMap`,
    description,
  };
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) {
    notFound();
  }

  const typeLabel =
    EVENT_TYPE_LABELS[event.eventType as keyof typeof EVENT_TYPE_LABELS] || event.eventType;
  const typeColor =
    EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] || '#6B7280';

  const formatDate = (date: Date) =>
    date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });

  // Whether event spans multiple days
  const isMultiDay =
    event.startDate.toDateString() !== event.endDate.toDateString();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href="/"
            className="text-gray-600 hover:text-gray-900 p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="지도로 돌아가기"
          >
            ← 뒤로
          </Link>
          <h1
            className="font-bold text-gray-900 text-base flex-1 truncate"
            title={event.name}
          >
            {event.name}
          </h1>
        </div>
      </header>

      {/* Hero image or emoji placeholder */}
      {event.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={event.imageUrl}
          alt={event.name}
          className="w-full h-52 object-cover"
          loading="eager"
        />
      ) : (
        <div
          className="w-full h-52 flex items-center justify-center text-7xl"
          style={{ backgroundColor: typeColor + '20' }}
          aria-hidden="true"
        >
          {event.eventType === 'FESTIVAL'
            ? '🎉'
            : event.eventType === 'FLEA_MARKET'
            ? '🛍️'
            : '🌙'}
        </div>
      )}

      {/* Title + badges section */}
      <div className="px-4 py-5 bg-white mb-2">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Event type badge */}
          <span
            className="text-sm font-medium px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: typeColor }}
          >
            {typeLabel}
          </span>
          {/* Free / price badge */}
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

        {/* Event name */}
        <h2 className="text-xl font-bold text-gray-900 mb-2 leading-tight">
          {event.name}
        </h2>

        {/* Description */}
        {event.description && (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {event.description}
          </p>
        )}
      </div>

      {/* Event info section */}
      <div className="px-4 py-4 bg-white mb-2 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">행사 정보</h3>

        <div className="space-y-4">
          {/* Date */}
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5" aria-hidden="true">📅</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">기간</p>
              <p className="text-sm text-gray-900 font-medium">
                {formatDate(event.startDate)}
              </p>
              {isMultiDay && (
                <p className="text-sm text-gray-600">
                  ~ {formatDate(event.endDate)}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5" aria-hidden="true">📍</span>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">장소</p>
              <p className="text-sm text-gray-900 font-medium">{event.venue}</p>
              <p className="text-sm text-gray-600">{event.address}</p>
              {(event.district || event.city) && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {[event.district, event.city].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>

          {/* Organizer */}
          {event.organizer && (
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5" aria-hidden="true">🏢</span>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">주최</p>
                <p className="text-sm text-gray-900 font-medium">{event.organizer}</p>
              </div>
            </div>
          )}

          {/* Price (if not free and price info exists) */}
          {!event.isFree && event.price && (
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5" aria-hidden="true">🎟️</span>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">입장료</p>
                <p className="text-sm text-gray-900 font-medium">{event.price}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 py-4 bg-white space-y-2">
        {/* Kakao Map navigation */}
        <a
          href={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-white font-semibold text-sm rounded-xl transition-colors"
        >
          <span aria-hidden="true">🗺️</span>
          <span>카카오맵에서 길찾기</span>
        </a>

        {/* Official site link */}
        {event.sourceUrl && (
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
          >
            <span aria-hidden="true">🔗</span>
            <span>공식 사이트 방문</span>
          </a>
        )}

        {/* Back to map */}
        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full py-3 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-600 font-medium text-sm rounded-xl transition-colors"
        >
          ← 지도로 돌아가기
        </Link>
      </div>

      {/* iOS safe-area bottom spacing */}
      <div className="h-8" />
    </div>
  );
}
