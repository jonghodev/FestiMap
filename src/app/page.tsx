import dynamic from 'next/dynamic';

// Dynamically import the map component to prevent SSR
// This is critical: Kakao Map SDK requires browser window object
const KakaoMap = dynamic(() => import('@/components/map/KakaoMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center rounded-lg">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">지도 불러오는 중...</p>
      </div>
    </div>
  ),
});

// Seoul metropolitan area sample markers (will be replaced by DB data)
const SAMPLE_MARKERS = [
  { id: '1', lat: 37.5796, lng: 126.9770, title: '경복궁 봄 축제' },
  { id: '2', lat: 37.5512, lng: 126.9882, title: '한강 야시장' },
  { id: '3', lat: 37.5172, lng: 127.0473, title: '강남 플리마켓' },
];

export default function HomePage() {
  return (
    <main className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
        <h1 className="text-xl font-bold text-yellow-500">🗺️ FestiMap</h1>
        <span className="text-sm text-gray-500">내 주변 축제 찾기</span>
      </header>

      {/* Map fills remaining height */}
      <div className="flex-1 relative">
        <KakaoMap
          lat={37.5665}
          lng={126.978}
          level={7}
          markers={SAMPLE_MARKERS}
          className="w-full h-full"
        />
      </div>
    </main>
  );
}
