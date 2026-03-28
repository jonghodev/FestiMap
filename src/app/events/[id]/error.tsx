'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function EventDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('행사 상세 페이지 오류:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
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

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            오류가 발생했습니다
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            행사 정보를 불러오는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <div className="flex flex-col gap-2 w-full">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              🔄 다시 시도
            </button>
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-xl transition-colors"
            >
              ← 지도로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
