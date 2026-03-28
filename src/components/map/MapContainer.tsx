'use client';

import dynamic from 'next/dynamic';
import type { MapMarker } from './KakaoMap';
import type { ViewportBounds } from '@/hooks/useViewportEvents';

// Dynamically import the map component to prevent SSR
// This is critical: Kakao Map SDK requires browser window object
const KakaoMap = dynamic(() => import('./KakaoMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">지도 불러오는 중...</p>
      </div>
    </div>
  ),
});

interface MapContainerProps {
  lat?: number;
  lng?: number;
  level?: number;
  markers?: MapMarker[];
  className?: string;
  onMapReady?: (map: kakao.maps.Map) => void;
  /** Called when the map viewport settles after pan/zoom – use to load visible markers */
  onBoundsChange?: (bounds: ViewportBounds) => void;
}

/**
 * Client-side wrapper for KakaoMap with SSR disabled.
 *
 * Use this component in Server Components (pages) to safely render the map.
 * next/dynamic with ssr:false must be used in a Client Component in Next.js App Router.
 */
export default function MapContainer(props: MapContainerProps) {
  return <KakaoMap {...props} />;
}
