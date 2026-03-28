'use client';

/**
 * NearbyFilter
 *
 * GPS 반경 기반 필터 컴포넌트.
 * "내 근처" 버튼을 누르면 사용자의 현재 GPS 위치를 기준으로
 * 선택한 반경 내의 행사만 지도에 표시합니다.
 *
 * 지역 필터(RegionFilter)와 상호 배타적으로 동작합니다:
 * - 내 근처 모드 활성 시: GPS 위치 기반 반경으로 뷰포트를 제어
 * - 지역 선택 시: 내 근처 모드가 해제되고 지역 기반 뷰포트로 전환
 */

import { useCallback } from 'react';
import type { GeolocationStatus } from '@/hooks/useGeolocation';

/** 선택 가능한 반경 옵션 (km 단위) */
export const RADIUS_OPTIONS = [
  { km: 1, label: '1km' },
  { km: 3, label: '3km' },
  { km: 5, label: '5km' },
  { km: 10, label: '10km' },
] as const;

export type RadiusKm = (typeof RADIUS_OPTIONS)[number]['km'];

interface NearbyFilterProps {
  /** "내 근처" 모드 활성 여부 */
  isActive: boolean;
  /** 현재 선택된 반경 km (isActive가 true일 때 유효) */
  selectedRadius: RadiusKm;
  /** GPS 위치 상태 */
  geoStatus: GeolocationStatus;
  /** "내 근처" 모드 토글 콜백 */
  onToggle: () => void;
  /** 반경 변경 콜백 (isActive가 true일 때만 호출) */
  onRadiusChange: (radius: RadiusKm) => void;
  /** 추가 className */
  className?: string;
}

export default function NearbyFilter({
  isActive,
  selectedRadius,
  geoStatus,
  onToggle,
  onRadiusChange,
  className = '',
}: NearbyFilterProps) {
  const handleRadiusClick = useCallback(
    (km: RadiusKm) => {
      onRadiusChange(km);
    },
    [onRadiusChange]
  );

  // GPS 상태에 따른 버튼 레이블
  const locationLabel =
    geoStatus === 'loading'
      ? '위치 확인 중...'
      : geoStatus === 'denied'
      ? '위치 권한 필요'
      : isActive
      ? '내 근처 ✓'
      : '내 근처';

  const isDisabled = geoStatus === 'loading';

  return (
    <div
      className={`flex items-center gap-1.5 px-3 py-1.5 bg-white border-b border-gray-100 overflow-x-auto scrollbar-hide flex-shrink-0 momentum-scroll ${className}`}
      role="group"
      aria-label="내 근처 반경 필터"
    >
      {/* 내 근처 토글 버튼 */}
      <button
        type="button"
        onClick={onToggle}
        disabled={isDisabled}
        className={[
          'flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all border',
          isActive
            ? 'bg-blue-500 text-white border-blue-500 shadow-sm'
            : geoStatus === 'denied'
            ? 'bg-gray-100 text-gray-400 border-gray-200'
            : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border-gray-200 hover:border-blue-200',
          isDisabled ? 'cursor-wait opacity-70' : 'cursor-pointer',
        ].join(' ')}
        aria-pressed={isActive}
        aria-label={isActive ? '내 근처 필터 해제' : '내 근처 행사 보기'}
      >
        {/* GPS 상태 아이콘 */}
        {geoStatus === 'loading' ? (
          <span
            className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-3 h-3 flex-shrink-0 ${isActive ? 'stroke-white' : 'stroke-current'}`}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}

        <span className="whitespace-nowrap">{locationLabel}</span>
      </button>

      {/* 반경 선택 버튼 - 내 근처 모드 활성 시에만 표시 */}
      {isActive && (
        <>
          {/* 구분선 */}
          <span className="text-gray-200 flex-shrink-0 select-none" aria-hidden="true">
            |
          </span>

          {/* 반경 옵션 버튼들 */}
          {RADIUS_OPTIONS.map(({ km, label }) => (
            <button
              key={km}
              type="button"
              onClick={() => handleRadiusClick(km)}
              className={[
                'flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                selectedRadius === km
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border border-transparent hover:border-blue-200',
              ].join(' ')}
              aria-pressed={selectedRadius === km}
              aria-label={`${label} 반경 내 행사 보기`}
            >
              {label}
            </button>
          ))}
        </>
      )}

      {/* GPS 권한 거부 안내 (비활성 상태에서 denied일 때) */}
      {!isActive && geoStatus === 'denied' && (
        <span className="text-xs text-gray-400 flex-shrink-0">
          위치 권한을 허용하면 사용할 수 있어요
        </span>
      )}
    </div>
  );
}
