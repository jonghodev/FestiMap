'use client';

/**
 * BookmarksListClient – 북마크 목록 클라이언트 컴포넌트
 *
 * 서버 컴포넌트(BookmarksPage)에서 초기 북마크 데이터를 받아
 * 클라이언트에서 제거(remove) 인터랙션을 처리합니다.
 *
 * 제거 시:
 *   1. 낙관적 업데이트: 즉시 목록에서 숨김
 *   2. DELETE /api/bookmarks/:eventId 호출
 *   3. 실패 시 원래 상태로 복구 + 오류 토스트 표시
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';

// ─── 타입 ──────────────────────────────────────────────────────────────────────

export interface BookmarkEvent {
  id: string;
  name: string;
  eventType: string;
  startDate: string; // ISO string (서버 컴포넌트에서 직렬화)
  endDate: string;
  venue: string;
  address: string;
  district: string | null;
  city: string;
  imageUrl: string | null;
  isFree: boolean;
  price: string | null;
}

export interface BookmarkItem {
  id: string;
  createdAt: string;
  event: BookmarkEvent;
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const EVENT_TYPE_LABELS: Record<string, string> = {
  FESTIVAL: '축제',
  FLEA_MARKET: '플리마켓',
  NIGHT_MARKET: '야시장',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
};

const EVENT_TYPE_EMOJIS: Record<string, string> = {
  FESTIVAL: '🎉',
  FLEA_MARKET: '🛍️',
  NIGHT_MARKET: '🌙',
};

// ─── 헬퍼 함수 ─────────────────────────────────────────────────────────────────

function formatDateRange(startDate: Date, endDate: Date): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const start = fmt(startDate);
  const end = fmt(endDate);

  if (startDate.toDateString() === endDate.toDateString()) {
    return start;
  }
  return `${start} ~ ${end}`;
}

function getEventStatus(startDate: Date, endDate: Date): '진행 중' | '예정' | '종료' {
  const now = new Date();
  if (now < startDate) return '예정';
  if (now > endDate) return '종료';
  return '진행 중';
}

// ─── 오류 토스트 ───────────────────────────────────────────────────────────────

function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                 bg-red-600 text-white text-sm font-medium
                 px-4 py-2.5 rounded-xl shadow-lg
                 flex items-center gap-2 min-w-max max-w-[90vw]"
    >
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 text-white/80 hover:text-white"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  );
}

// ─── 개별 북마크 카드 ──────────────────────────────────────────────────────────

function BookmarkedEventCard({
  bookmark,
  onRemove,
  isRemoving,
}: {
  bookmark: BookmarkItem;
  onRemove: (bookmarkId: string, eventId: string) => void;
  isRemoving: boolean;
}) {
  const { event } = bookmark;
  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? '#6B7280';
  const typeLabel = EVENT_TYPE_LABELS[event.eventType] ?? event.eventType;
  const typeEmoji = EVENT_TYPE_EMOJIS[event.eventType] ?? '📌';

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const status = getEventStatus(startDate, endDate);
  const dateRange = formatDateRange(startDate, endDate);

  const statusStyles: Record<string, string> = {
    '진행 중': 'bg-green-50 text-green-700 border-green-200',
    '예정': 'bg-blue-50 text-blue-700 border-blue-200',
    '종료': 'bg-gray-100 text-gray-500 border-gray-200',
  };

  return (
    <li
      className={`transition-opacity duration-200 ${isRemoving ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}
    >
      <div className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors">
        {/* 행사 정보 링크 */}
        <Link
          href={`/events/${event.id}`}
          className="flex items-start gap-3 flex-1 min-w-0"
        >
          {/* 이미지 / 이모지 플레이스홀더 */}
          <div className="flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden">
            {event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-3xl"
                style={{ backgroundColor: typeColor + '20' }}
                aria-hidden="true"
              >
                {typeEmoji}
              </div>
            )}
          </div>

          {/* 텍스트 정보 */}
          <div className="flex-1 min-w-0">
            {/* 카테고리 배지 + 상태 배지 */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ backgroundColor: typeColor }}
              >
                {typeLabel}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}
              >
                {status}
              </span>
              {event.isFree && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  무료
                </span>
              )}
            </div>

            {/* 행사명 */}
            <h2 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2 mb-1">
              {event.name}
            </h2>

            {/* 날짜 */}
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <span aria-hidden="true">📅</span>
              {dateRange}
            </p>

            {/* 장소 */}
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
              <span aria-hidden="true">📍</span>
              <span className="truncate">
                {event.venue}
                {event.district ? ` · ${event.district}` : ''}
              </span>
            </p>
          </div>
        </Link>

        {/* 오른쪽: 북마크 제거 버튼 + 화살표 */}
        <div className="flex items-center gap-0.5 flex-shrink-0 self-center">
          {/* 북마크 제거 버튼 */}
          <button
            type="button"
            onClick={() => onRemove(bookmark.id, event.id)}
            disabled={isRemoving}
            aria-label={`${event.name} 북마크 제거`}
            className={[
              'w-8 h-8 flex items-center justify-center rounded-full transition-all duration-150',
              isRemoving
                ? 'opacity-40 cursor-wait'
                : 'text-yellow-500 hover:text-yellow-600 active:text-yellow-700 hover:bg-yellow-50 active:bg-yellow-100 cursor-pointer',
            ].join(' ')}
          >
            {isRemoving ? (
              <span
                className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              /* 채워진 북마크 아이콘 */
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" />
              </svg>
            )}
          </button>

          {/* 상세 보기 화살표 */}
          <Link
            href={`/events/${event.id}`}
            className="w-8 h-8 flex items-center justify-center text-gray-300 text-lg"
            aria-label={`${event.name} 상세 보기`}
            tabIndex={-1}
            aria-hidden="true"
          >
            ›
          </Link>
        </div>
      </div>
    </li>
  );
}

// ─── 빈 상태 ───────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="text-6xl mb-4" aria-hidden="true">🔖</div>
      <h2 className="text-lg font-bold text-gray-800 mb-2">
        저장된 북마크가 없습니다
      </h2>
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        관심 있는 행사를 북마크하면<br />
        여기서 한눈에 확인할 수 있어요
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-white font-semibold text-sm rounded-xl transition-colors"
      >
        <span aria-hidden="true">🗺️</span>
        지도에서 행사 찾기
      </Link>
    </div>
  );
}

// ─── 메인 목록 컴포넌트 ────────────────────────────────────────────────────────

interface BookmarksListClientProps {
  initialBookmarks: BookmarkItem[];
}

export default function BookmarksListClient({
  initialBookmarks,
}: BookmarksListClientProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>(initialBookmarks);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (bookmarkId: string, eventId: string) => {
      // 낙관적 업데이트: 즉시 목록에서 숨김 표시
      setRemovingIds((prev) => new Set(prev).add(bookmarkId));

      try {
        const res = await fetch(`/api/bookmarks/${eventId}`, {
          method: 'DELETE',
        });

        if (res.ok || res.status === 404) {
          // 성공 (또는 이미 삭제됨): 목록에서 완전히 제거
          setBookmarks((prev) => prev.filter((b) => b.id !== bookmarkId));
        } else if (res.status === 401) {
          // 미인증: 복구 후 알림
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(bookmarkId);
            return next;
          });
          setErrorMessage('로그인이 필요합니다. 다시 로그인해주세요.');
        } else {
          // 기타 오류: 복구
          setRemovingIds((prev) => {
            const next = new Set(prev);
            next.delete(bookmarkId);
            return next;
          });
          try {
            const data = (await res.json()) as { error?: string };
            setErrorMessage(data.error ?? '북마크를 제거하는 중 오류가 발생했습니다.');
          } catch {
            setErrorMessage('북마크를 제거하는 중 오류가 발생했습니다.');
          }
        }
      } catch {
        // 네트워크 오류: 복구
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(bookmarkId);
          return next;
        });
        setErrorMessage('네트워크 오류가 발생했습니다. 연결을 확인해주세요.');
      }
    },
    []
  );

  if (bookmarks.length === 0) {
    return <EmptyState />;
  }

  return (
    <main className="flex-1">
      {/* 안내 텍스트 */}
      <p className="px-4 py-3 text-xs text-gray-400 border-b border-gray-100 bg-white">
        북마크한 행사를 탭하면 상세 정보를 확인할 수 있습니다. 북마크 아이콘을 탭하면 제거됩니다.
      </p>

      <ul className="divide-y divide-gray-100 bg-white">
        {bookmarks.map((bookmark) => (
          <BookmarkedEventCard
            key={bookmark.id}
            bookmark={bookmark}
            onRemove={handleRemove}
            isRemoving={removingIds.has(bookmark.id)}
          />
        ))}
      </ul>

      {/* 더 많은 행사 찾기 */}
      <div className="px-4 py-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-white font-semibold text-sm rounded-xl transition-colors"
        >
          <span aria-hidden="true">🗺️</span>
          더 많은 행사 찾기
        </Link>
      </div>

      {/* 오류 토스트 */}
      {errorMessage && (
        <ErrorToast
          message={errorMessage}
          onDismiss={() => setErrorMessage(null)}
        />
      )}
    </main>
  );
}
