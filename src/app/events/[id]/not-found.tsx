import Link from 'next/link';

export default function EventNotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header mirrors page.tsx sticky header layout.
          pt-safe-top: on iPhones with a notch or Dynamic Island, viewport-fit=cover
          extends the page under the status bar.  The padding pushes the visible
          header content below the system indicators. */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm pt-safe-top">
        <div className="max-w-5xl xl:max-w-6xl mx-auto flex items-center gap-3 px-4 py-3 lg:px-6 xl:px-8">
          {/* min-h-[44px] min-w-[44px]: meets Apple HIG minimum touch target (44 × 44 pt) */}
          <Link
            href="/"
            className="flex items-center gap-1 min-h-[44px] min-w-[44px] px-2 -ml-1 text-sm text-gray-600 hover:text-gray-900 active:text-gray-900 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="뒤로 가기"
          >
            ← 뒤로
          </Link>
          <h1 className="font-bold text-gray-900 text-base flex-1 truncate lg:text-lg xl:text-xl">
            행사 상세
          </h1>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center max-w-sm lg:max-w-md">
          <div className="text-6xl mb-4 lg:text-7xl">🔍</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 lg:text-2xl xl:text-3xl">
            행사를 찾을 수 없습니다
          </h2>
          <p className="text-gray-500 text-sm mb-6 lg:text-base">
            요청하신 행사 정보가 존재하지 않거나 삭제되었습니다.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors lg:text-base lg:px-8 lg:py-3.5"
          >
            ← 지도로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
