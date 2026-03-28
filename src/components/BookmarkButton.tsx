'use client';

/**
 * BookmarkButton – 북마크 토글 아이콘 버튼
 *
 * 이벤트 상세 페이지 헤더와 지도 팝업 카드에서 사용됩니다.
 *
 * 특징:
 *  - 북마크 상태에 따라 채워진/빈 북마크 아이콘 표시
 *  - 낙관적 업데이트(optimistic UI)로 즉각적인 시각 피드백
 *  - 로딩 중에는 스피너 표시
 *  - 오류 발생 시 인라인 툴팁 메시지 표시 (3초 후 자동 소멸)
 *  - 미인증 상태에서 토글 시도 시 /login 으로 리다이렉트 (useBookmark 처리)
 *  - ARIA 속성으로 스크린리더 접근성 지원
 */

import { useEffect } from 'react';
import { useBookmark } from '@/hooks/useBookmark';

interface BookmarkButtonProps {
  /** 북마크 대상 이벤트 ID */
  eventId: string;
  /**
   * 서버에서 미리 확인한 북마크 여부.
   * undefined이면 클라이언트에서 API를 호출하여 조회합니다.
   */
  initialIsBookmarked?: boolean;
  /** 추가 CSS 클래스 (버튼 컨테이너에 적용) */
  className?: string;
  /** 아이콘 크기 */
  size?: 'sm' | 'md' | 'lg';
}

export default function BookmarkButton({
  eventId,
  initialIsBookmarked,
  className = '',
  size = 'md',
}: BookmarkButtonProps) {
  const { isBookmarked, isToggling, error, toggleBookmark, clearError } =
    useBookmark(eventId, initialIsBookmarked);

  // 오류 메시지 3초 후 자동 소멸
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => clearError(), 3000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  // 크기별 클래스
  const sizeMap = {
    sm: { btn: 'w-8 h-8', icon: 'w-4 h-4', spinner: 'w-3 h-3' },
    md: { btn: 'w-10 h-10', icon: 'w-5 h-5', spinner: 'w-4 h-4' },
    lg: { btn: 'w-12 h-12', icon: 'w-6 h-6', spinner: 'w-5 h-5' },
  } as const;

  const { btn, icon, spinner } = sizeMap[size];

  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <button
        type="button"
        onClick={toggleBookmark}
        disabled={isToggling}
        aria-label={isBookmarked ? '북마크 제거' : '북마크 추가'}
        aria-pressed={isBookmarked}
        className={[
          'flex items-center justify-center rounded-full transition-all duration-150',
          btn,
          isBookmarked
            ? 'text-yellow-500 hover:text-yellow-600 active:text-yellow-700'
            : 'text-gray-400 hover:text-gray-600 active:text-gray-700',
          isToggling
            ? 'opacity-60 cursor-wait'
            : 'cursor-pointer hover:bg-gray-100 active:bg-gray-200',
        ].join(' ')}
      >
        {isToggling ? (
          /* 로딩 스피너 */
          <span
            className={`${spinner} border-2 border-current border-t-transparent rounded-full animate-spin`}
            aria-hidden="true"
          />
        ) : isBookmarked ? (
          /* 채워진 북마크 아이콘 */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={icon}
            aria-hidden="true"
          >
            <path d="M6.32 2.577a49.255 49.255 0 0 1 11.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 0 1-1.085.67L12 18.089l-7.165 3.583A.75.75 0 0 1 3.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93Z" />
          </svg>
        ) : (
          /* 빈 북마크 아이콘 */
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className={icon}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
            />
          </svg>
        )}
      </button>

      {/* 오류 툴팁 – 버튼 아래에 표시 */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="absolute top-full right-0 mt-1.5 z-50
                     bg-red-50 border border-red-200 rounded-lg
                     px-3 py-1.5 text-xs text-red-600 whitespace-nowrap
                     shadow-md animate-fade-in"
        >
          {error}
        </div>
      )}
    </div>
  );
}
