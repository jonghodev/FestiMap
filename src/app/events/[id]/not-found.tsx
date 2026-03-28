import Link from 'next/link';

export default function EventNotFound() {
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
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            행사를 찾을 수 없습니다
          </h2>
          <p className="text-gray-500 text-sm mb-6">
            요청하신 행사 정보가 존재하지 않거나 삭제되었습니다.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-yellow-400 hover:bg-yellow-500 text-white font-semibold text-sm rounded-xl transition-colors"
          >
            ← 지도로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
