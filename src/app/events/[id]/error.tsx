'use client';

import Link from 'next/link';
import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EventDetailError({ error, reset }: ErrorProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('행사 상세 페이지 오류:', error);
  }, [error]);

  // Mirrors the same logic as BackButton so the "뒤로" button behaves
  // identically to the real header back button: uses history pop when available,
  // falls back to the map home page when there is no prior same-origin entry.
  const handleBack = useCallback(() => {
    const hasSameOriginReferrer =
      typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      document.referrer.length > 0 &&
      document.referrer.startsWith(window.location.origin);

    const hasHistory =
      typeof window !== 'undefined' && window.history.length > 1;

    if (hasSameOriginReferrer || hasHistory) {
      router.back();
    } else {
      router.push('/');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header mirrors page.tsx sticky header layout.
          pt-safe-top: on iPhones with a notch or Dynamic Island, viewport-fit=cover
          extends the page under the status bar.  The padding pushes the visible
          header content below the system indicators. */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm pt-safe-top">
        <div className="max-w-5xl xl:max-w-6xl mx-auto flex items-center gap-3 px-4 py-3 lg:px-6 xl:px-8">
          {/* min-h-[44px] min-w-[44px]: meets Apple HIG minimum touch target (44 × 44 pt) */}
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1 min-h-[44px] min-w-[44px] px-2 -ml-1 text-sm text-gray-600 hover:text-gray-900 active:text-gray-900 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="뒤로 가기"
          >
            ← 뒤로
          </button>
          <h1 className="font-bold text-gray-900 text-base flex-1 truncate lg:text-lg xl:text-xl">
            행사 상세
          </h1>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center max-w-sm lg:max-w-md">
          <div className="text-6xl mb-4 lg:text-7xl">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 lg:text-2xl xl:text-3xl">
            오류가 발생했습니다
          </h2>
          <p className="text-gray-500 text-sm mb-6 lg:text-base">
            행사 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <div className="flex flex-col gap-2 w-full lg:max-w-xs lg:mx-auto">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors lg:text-base lg:py-3.5"
            >
              🔄 다시 시도
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-xl transition-colors lg:text-base lg:py-3.5"
            >
              ← 지도로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
