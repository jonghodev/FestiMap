'use client';

/**
 * useBookmark – 단일 이벤트의 북마크 상태를 관리하는 훅
 *
 * 기능:
 *  - 초기 상태가 주어지면 즉시 반영 (서버에서 미리 확인한 경우)
 *  - 초기 상태가 없으면 API 호출로 현재 북마크 상태를 조회
 *  - toggleBookmark() 호출 시 낙관적 업데이트 (optimistic UI)
 *  - 미인증 상태에서 토글 시도 시 /login 으로 리다이렉트
 *  - API 오류 시 상태를 원상 복구하고 한국어 오류 메시지 반환
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

export interface UseBookmarkResult {
  /** 현재 북마크 여부 */
  isBookmarked: boolean;
  /** 토글 API 호출 중 여부 */
  isToggling: boolean;
  /** 오류 메시지 (없으면 null) */
  error: string | null;
  /** 북마크 추가/제거 토글 */
  toggleBookmark: () => Promise<void>;
  /** 오류 메시지 초기화 */
  clearError: () => void;
}

/**
 * @param eventId          북마크 대상 이벤트 ID
 * @param initialIsBookmarked  서버에서 미리 확인한 북마크 여부 (undefined = 클라이언트에서 조회)
 */
export function useBookmark(
  eventId: string,
  initialIsBookmarked?: boolean
): UseBookmarkResult {
  const router = useRouter();

  // 초기 상태: 서버에서 전달된 경우 즉시 사용, 없으면 false (API 조회 후 갱신)
  const [isBookmarked, setIsBookmarked] = useState(initialIsBookmarked ?? false);
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 초기 상태 조회 완료 여부 (서버에서 이미 알고 있으면 true)
  const [isFetched, setIsFetched] = useState(initialIsBookmarked !== undefined);

  // Stale closure 방지용 ref
  const isTogglingRef = useRef(false);

  // 초기 상태가 없을 때 API에서 현재 북마크 상태 조회
  useEffect(() => {
    if (isFetched) return;

    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch(`/api/bookmarks/${eventId}`, {
          // 캐시 비사용: 사용자별 데이터이므로 항상 최신 상태 조회
          cache: 'no-store',
        });

        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as { isBookmarked: boolean };
          setIsBookmarked(data.isBookmarked);
        }
        // 401 (미인증): 기본값 false 유지 – 별도 오류 표시 불필요
        // 기타 오류: 기본값 false 유지
      } catch {
        // 네트워크 오류 시 기본값(false) 유지
      } finally {
        if (!cancelled) setIsFetched(true);
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [eventId, isFetched]);

  const toggleBookmark = useCallback(async () => {
    // 이미 처리 중이면 무시 (중복 클릭 방지)
    if (isTogglingRef.current) return;

    const nextState = !isBookmarked;

    // 낙관적 업데이트: 즉시 UI 반영
    setIsBookmarked(nextState);
    setIsToggling(true);
    setError(null);
    isTogglingRef.current = true;

    try {
      let res: Response;

      if (nextState) {
        // 북마크 추가
        res = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId }),
        });
      } else {
        // 북마크 제거
        res = await fetch(`/api/bookmarks/${eventId}`, {
          method: 'DELETE',
        });
      }

      // 미인증: 상태 복구 후 로그인 페이지로 이동
      if (res.status === 401) {
        setIsBookmarked(!nextState);
        router.push(`/login?returnUrl=${encodeURIComponent(window.location.pathname)}`);
        return;
      }

      // 409 (이미 북마크됨): 낙관적 상태 유지 (성공으로 처리)
      if (res.status === 409) {
        setIsBookmarked(true);
        return;
      }

      // 404 (북마크 없음, DELETE 시): 낙관적 상태 유지 (이미 제거된 것으로 처리)
      if (res.status === 404 && !nextState) {
        setIsBookmarked(false);
        return;
      }

      // 그 외 오류: 원래 상태로 복구
      if (!res.ok) {
        setIsBookmarked(!nextState);
        try {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? '오류가 발생했습니다. 다시 시도해주세요.');
        } catch {
          setError('오류가 발생했습니다. 다시 시도해주세요.');
        }
      }
    } catch {
      // 네트워크 오류: 원래 상태로 복구
      setIsBookmarked(!nextState);
      setError('네트워크 오류가 발생했습니다. 연결을 확인해주세요.');
    } finally {
      setIsToggling(false);
      isTogglingRef.current = false;
    }
  }, [isBookmarked, eventId, router]);

  const clearError = useCallback(() => setError(null), []);

  return { isBookmarked, isToggling, error, toggleBookmark, clearError };
}
