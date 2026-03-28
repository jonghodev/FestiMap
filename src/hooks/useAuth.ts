'use client';

/**
 * useAuth – 클라이언트 사이드 인증 상태 훅
 *
 * /api/user/me 를 호출하여 현재 로그인 여부와 사용자 정보를 반환합니다.
 * 결과는 컴포넌트 수명 동안 캐시되어 불필요한 재요청을 방지합니다.
 *
 * 반환값:
 *   - isLoading: 인증 상태 확인 중
 *   - isAuthenticated: 로그인 여부
 *   - user: 로그인된 사용자 정보 (name, email) 또는 null
 *   - logout: 로그아웃 함수
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface UseAuthResult {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      try {
        const res = await fetch('/api/user/me', {
          // 미인증 요청은 미들웨어에서 401 반환
          cache: 'no-store',
        });

        if (cancelled) return;

        if (res.ok) {
          const data = (await res.json()) as { user: AuthUser };
          setUser(data.user);
        } else {
          // 401 (미인증) 또는 404 (계정 삭제)
          setUser(null);
        }
      } catch {
        // 네트워크 오류: 미인증으로 처리
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // 네트워크 오류도 로컬 상태는 초기화
    }
    setUser(null);
    router.push('/');
    router.refresh();
  }, [router]);

  return {
    isLoading,
    isAuthenticated: user !== null,
    user,
    logout,
  };
}
