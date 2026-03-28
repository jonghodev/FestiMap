/**
 * 내 북마크 페이지
 *
 * 로그인한 사용자가 북마크한 행사 목록을 보여줍니다.
 * 미인증 상태에서는 /login 으로 리다이렉트됩니다.
 *
 * 렌더링 전략:
 *  - 서버 컴포넌트: DB에서 직접 북마크 목록 조회 (API 왕복 없음)
 *  - force-dynamic: 북마크는 사용자별 데이터이므로 캐시 불가
 *  - BookmarksListClient: 북마크 제거 등 인터랙션은 클라이언트에서 처리
 */

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import BackButton from '@/components/BackButton';
import BookmarksListClient, { type BookmarkItem } from '@/components/BookmarksListClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '내 북마크 | FestiMap',
  description: '내가 저장한 행사 목록',
};

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────────────

export default async function BookmarksPage() {
  // ── 인증 확인 ──────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    redirect('/login?returnUrl=/bookmarks');
  }

  const payload = await verifyToken(token);
  if (!payload) {
    redirect('/login?returnUrl=/bookmarks');
  }

  const { userId } = payload;

  // ── 북마크 목록 조회 ────────────────────────────────────────────────────────
  let bookmarks: BookmarkItem[] = [];
  let fetchError = false;

  try {
    const rawBookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            eventType: true,
            startDate: true,
            endDate: true,
            venue: true,
            address: true,
            district: true,
            city: true,
            imageUrl: true,
            isFree: true,
            price: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Date 객체를 ISO 문자열로 직렬화 (클라이언트 컴포넌트에 전달 시 필요)
    bookmarks = rawBookmarks.map((b) => ({
      id: b.id,
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : String(b.createdAt),
      event: {
        id: b.event.id,
        name: b.event.name,
        eventType: b.event.eventType,
        startDate: b.event.startDate instanceof Date ? b.event.startDate.toISOString() : String(b.event.startDate),
        endDate: b.event.endDate instanceof Date ? b.event.endDate.toISOString() : String(b.event.endDate),
        venue: b.event.venue,
        address: b.event.address,
        district: b.event.district,
        city: b.event.city,
        imageUrl: b.event.imageUrl,
        isFree: b.event.isFree,
        price: b.event.price,
      },
    }));
  } catch (error) {
    console.error('[BookmarksPage] DB error:', error);
    fetchError = true;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <BackButton
            fallbackHref="/"
            className="text-gray-600 hover:text-gray-900 p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="홈으로"
          >
            ← 뒤로
          </BackButton>
          <h1 className="text-base font-bold text-gray-900 flex-1">
            내 북마크
          </h1>
          {!fetchError && bookmarks.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
              {bookmarks.length}개
            </span>
          )}
        </div>
      </header>

      {/* 오류 상태 */}
      {fetchError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">
            불러오기 실패
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            북마크 목록을 불러오는 중 오류가 발생했습니다.
            <br />
            잠시 후 다시 시도해주세요.
          </p>
          <Link
            href="/bookmarks"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
          >
            다시 시도
          </Link>
        </div>
      ) : (
        /* 북마크 목록 (클라이언트 컴포넌트 – 제거 기능 포함) */
        <BookmarksListClient initialBookmarks={bookmarks} />
      )}

      {/* iOS safe-area 하단 여백 */}
      <div className="h-8" />
    </div>
  );
}
