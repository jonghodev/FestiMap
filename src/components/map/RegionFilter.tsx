'use client';

/**
 * RegionFilter
 *
 * 서울·수도권 지역 기반 필터 컴포넌트.
 * 사용자의 GPS 위치와 무관하게 원하는 지역을 직접 선택할 수 있습니다.
 *
 * 구성:
 * - 가로 스크롤 가능한 지역 칩 행 (빠른 선택)
 * - "📍 지역" 토글 버튼 → 서울 / 경기·인천 그룹으로 묶인 드롭다운 패널
 * - 현재 선택된 지역 이름을 토글 버튼에 표시
 * - Escape 키 및 바깥 영역 클릭으로 패널 닫기
 * - 모바일 퍼스트 디자인
 */

import { useEffect, useRef, useCallback } from 'react';

export interface SeoulRegion {
  id: string;
  /** 표시 이름 (한국어) */
  label: string;
  /** 지역 중심 위도 */
  lat: number;
  /** 지역 중심 경도 */
  lng: number;
  /** Kakao 지도 줌 레벨 (낮을수록 확대; 6 = 구 단위, 8 = 서울 전체) */
  level: number;
  /** 목록 모드에서 이벤트 조회에 사용하는 영역 경계 */
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
  /** 그룹 분류: 'seoul' | 'gyeonggi' */
  group: 'seoul' | 'gyeonggi';
}

/**
 * 서울 자치구 및 주요 생활권, 경기·인천 주요 도시를 포함한
 * 수도권 지역 목록. GPS 없이 원하는 지역을 직접 탐색할 수 있습니다.
 *
 * 서울: 서울 전체 + 14개 주요 생활권 (서울 25개 자치구를 생활권별로 묶음)
 * 경기·인천: 6개 주요 도시
 */
export const SEOUL_REGIONS: SeoulRegion[] = [
  // ─── 서울 전체 ────────────────────────────────────────────────────────────
  {
    id: 'seoul',      label: '서울 전체',
    lat: 37.5665, lng: 126.978,  level: 8,
    swLat: 37.41, swLng: 126.76, neLat: 37.70, neLng: 127.18,
    group: 'seoul',
  },

  // ─── 서울 주요 생활권 ──────────────────────────────────────────────────────
  {
    id: 'jongno',     label: '종로/광화문',
    lat: 37.5796, lng: 126.9770, level: 6,
    swLat: 37.55, swLng: 126.94, neLat: 37.61, neLng: 127.01,
    group: 'seoul',
  },
  {
    id: 'junggu',     label: '중구/을지로',
    lat: 37.5640, lng: 126.9975, level: 6,
    swLat: 37.54, swLng: 126.97, neLat: 37.58, neLng: 127.02,
    group: 'seoul',
  },
  {
    id: 'hongdae',    label: '홍대/마포',
    lat: 37.5563, lng: 126.9244, level: 6,
    swLat: 37.52, swLng: 126.88, neLat: 37.59, neLng: 126.96,
    group: 'seoul',
  },
  {
    id: 'sinchon',    label: '신촌/서대문',
    lat: 37.5594, lng: 126.9366, level: 6,
    swLat: 37.53, swLng: 126.90, neLat: 37.59, neLng: 126.97,
    group: 'seoul',
  },
  {
    id: 'itaewon',    label: '이태원/용산',
    lat: 37.5347, lng: 126.9946, level: 6,
    swLat: 37.50, swLng: 126.96, neLat: 37.57, neLng: 127.03,
    group: 'seoul',
  },
  {
    id: 'gangnam',    label: '강남/서초',
    lat: 37.4979, lng: 127.0276, level: 6,
    swLat: 37.45, swLng: 126.99, neLat: 37.54, neLng: 127.07,
    group: 'seoul',
  },
  {
    id: 'seongsu',    label: '성수/건대',
    lat: 37.5449, lng: 127.0572, level: 6,
    swLat: 37.51, swLng: 127.02, neLat: 37.58, neLng: 127.09,
    group: 'seoul',
  },
  {
    id: 'yeouido',    label: '여의도/영등포',
    lat: 37.5219, lng: 126.9245, level: 6,
    swLat: 37.49, swLng: 126.88, neLat: 37.56, neLng: 126.96,
    group: 'seoul',
  },
  {
    id: 'jamsil',     label: '잠실/송파',
    lat: 37.5100, lng: 127.1000, level: 6,
    swLat: 37.47, swLng: 127.07, neLat: 37.55, neLng: 127.13,
    group: 'seoul',
  },
  {
    id: 'dongdaemun', label: '동대문/중랑',
    lat: 37.5744, lng: 127.0397, level: 6,
    swLat: 37.54, swLng: 127.00, neLat: 37.61, neLng: 127.08,
    group: 'seoul',
  },
  {
    id: 'nowon',      label: '노원/도봉',
    lat: 37.6542, lng: 127.0568, level: 6,
    swLat: 37.62, swLng: 127.02, neLat: 37.70, neLng: 127.10,
    group: 'seoul',
  },
  {
    id: 'gangbuk',    label: '강북/성북',
    lat: 37.6370, lng: 127.0256, level: 6,
    swLat: 37.60, swLng: 126.98, neLat: 37.67, neLng: 127.07,
    group: 'seoul',
  },
  {
    id: 'eunpyeong',  label: '은평/서북',
    lat: 37.6176, lng: 126.9227, level: 6,
    swLat: 37.58, swLng: 126.88, neLat: 37.66, neLng: 126.97,
    group: 'seoul',
  },
  {
    id: 'gwanak',     label: '관악/동작',
    lat: 37.4784, lng: 126.9516, level: 6,
    swLat: 37.45, swLng: 126.91, neLat: 37.52, neLng: 126.99,
    group: 'seoul',
  },
  {
    id: 'gangseo',    label: '강서/양천',
    lat: 37.5509, lng: 126.8495, level: 6,
    swLat: 37.52, swLng: 126.80, neLat: 37.58, neLng: 126.90,
    group: 'seoul',
  },
  {
    id: 'gangdong',   label: '강동/하남',
    lat: 37.5301, lng: 127.1238, level: 6,
    swLat: 37.49, swLng: 127.08, neLat: 37.57, neLng: 127.18,
    group: 'seoul',
  },

  // ─── 경기·인천 ────────────────────────────────────────────────────────────
  {
    id: 'goyang',     label: '고양/일산',
    lat: 37.6584, lng: 126.8320, level: 7,
    swLat: 37.60, swLng: 126.77, neLat: 37.72, neLng: 126.90,
    group: 'gyeonggi',
  },
  {
    id: 'bucheon',    label: '부천/광명',
    lat: 37.5036, lng: 126.7660, level: 7,
    swLat: 37.45, swLng: 126.71, neLat: 37.55, neLng: 126.83,
    group: 'gyeonggi',
  },
  {
    id: 'seongnam',   label: '성남/분당',
    lat: 37.4449, lng: 127.1388, level: 7,
    swLat: 37.39, swLng: 127.09, neLat: 37.50, neLng: 127.19,
    group: 'gyeonggi',
  },
  {
    id: 'suwon',      label: '수원',
    lat: 37.2636, lng: 127.0286, level: 7,
    swLat: 37.21, swLng: 126.98, neLat: 37.32, neLng: 127.09,
    group: 'gyeonggi',
  },
  {
    id: 'hanam',      label: '하남/남양주',
    lat: 37.5399, lng: 127.2148, level: 7,
    swLat: 37.48, swLng: 127.14, neLat: 37.61, neLng: 127.32,
    group: 'gyeonggi',
  },
  {
    id: 'incheon',    label: '인천',
    lat: 37.4563, lng: 126.7052, level: 7,
    swLat: 37.39, swLng: 126.62, neLat: 37.53, neLng: 126.80,
    group: 'gyeonggi',
  },
];

interface RegionFilterProps {
  /** 현재 선택된 지역 id (예: 'gangnam', 'seoul') */
  selectedRegion: string;
  /** 지역 선택 시 호출되는 콜백 */
  onSelect: (region: SeoulRegion) => void;
  /** 드롭다운 패널 열림 여부 */
  isPanelOpen: boolean;
  /** 드롭다운 패널 토글 */
  onTogglePanel: () => void;
  /** 드롭다운 패널 닫기 */
  onClosePanel: () => void;
  /** 추가 className */
  className?: string;
}

export default function RegionFilter({
  selectedRegion,
  onSelect,
  isPanelOpen,
  onTogglePanel,
  onClosePanel,
  className = '',
}: RegionFilterProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);

  // 활성 지역 정보 조회
  const activeRegion = SEOUL_REGIONS.find((r) => r.id === selectedRegion);
  const activeLabel = activeRegion?.label ?? '서울 전체';

  // 서울 / 경기·인천 그룹 분리
  const seoulRegions = SEOUL_REGIONS.filter((r) => r.group === 'seoul');
  const gyeonggiRegions = SEOUL_REGIONS.filter((r) => r.group === 'gyeonggi');

  // Escape 키로 패널 닫기
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPanelOpen) {
        onClosePanel();
        toggleBtnRef.current?.focus();
      }
    },
    [isPanelOpen, onClosePanel]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 패널이 열릴 때 첫 번째 버튼으로 포커스 이동 (접근성)
  useEffect(() => {
    if (isPanelOpen) {
      const firstBtn = panelRef.current?.querySelector<HTMLButtonElement>('button');
      firstBtn?.focus();
    }
  }, [isPanelOpen]);

  const handleRegionClick = useCallback(
    (region: SeoulRegion) => {
      onSelect(region);
    },
    [onSelect]
  );

  return (
    <div className={`relative flex-shrink-0 border-b border-gray-100 bg-white ${className}`}>
      {/* ── 가로 스크롤 칩 행 ── */}
      <div
        className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-hide momentum-scroll snap-x-proximity"
        role="toolbar"
        aria-label="지역 선택"
      >
        {/* 지역 패널 토글 버튼 – 현재 선택 지역 이름 표시 */}
        <button
          ref={toggleBtnRef}
          type="button"
          onClick={onTogglePanel}
          className={[
            'flex-shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all border',
            isPanelOpen
              ? 'bg-yellow-400 text-white border-yellow-400 shadow-sm'
              : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-700 border-gray-200 hover:border-yellow-200',
          ].join(' ')}
          aria-expanded={isPanelOpen}
          aria-haspopup="dialog"
          aria-label={`지역 선택 패널 열기. 현재 선택: ${activeLabel}`}
        >
          📍
          <span className="max-w-[5rem] truncate">{activeLabel}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-3 h-3 flex-shrink-0 transition-transform duration-200 ${isPanelOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* 세로 구분선 */}
        <span className="text-gray-200 flex-shrink-0 select-none" aria-hidden="true">|</span>

        {/* 개별 지역 칩 */}
        {SEOUL_REGIONS.map((region) => {
          const isActive = selectedRegion === region.id;
          return (
            <button
              key={region.id}
              type="button"
              onClick={() => handleRegionClick(region)}
              className={[
                'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all',
                isActive
                  ? 'bg-yellow-400 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 hover:text-yellow-700 border border-transparent hover:border-yellow-200',
              ].join(' ')}
              aria-pressed={isActive}
              aria-label={`${region.label} 지역 선택`}
            >
              {region.label}
            </button>
          );
        })}
      </div>

      {/* 오른쪽 페이드 그라데이션 – 더 많은 칩이 있음을 시각적으로 표시 */}
      <div
        className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white to-transparent"
        aria-hidden="true"
      />

      {/* ── 지역 선택 드롭다운 패널 ── */}
      {isPanelOpen && (
        <>
          {/* 투명 백드롭 – 바깥 클릭 시 패널 닫기 */}
          <div
            className="fixed inset-0 z-20"
            aria-hidden="true"
            onClick={onClosePanel}
          />

          {/* 그룹별 지역 패널 */}
          <div
            ref={panelRef}
            className="absolute top-full left-0 right-0 z-30 bg-white border border-gray-100 shadow-xl rounded-b-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label="지역 선택"
          >
            <div className="p-4 space-y-4 max-h-72 overflow-y-auto momentum-scroll">
              {/* 서울 섹션 */}
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  🏙️ 서울
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {seoulRegions.map((region) => {
                    const isActive = selectedRegion === region.id;
                    return (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => handleRegionClick(region)}
                        className={[
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                          isActive
                            ? 'bg-yellow-400 text-white border-yellow-400 shadow-sm'
                            : 'bg-gray-50 text-gray-600 hover:bg-yellow-50 hover:text-yellow-700 border-gray-200 hover:border-yellow-300',
                        ].join(' ')}
                        aria-pressed={isActive}
                      >
                        {region.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 경기·인천 섹션 */}
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  🗺️ 경기·인천
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {gyeonggiRegions.map((region) => {
                    const isActive = selectedRegion === region.id;
                    return (
                      <button
                        key={region.id}
                        type="button"
                        onClick={() => handleRegionClick(region)}
                        className={[
                          'px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                          isActive
                            ? 'bg-yellow-400 text-white border-yellow-400 shadow-sm'
                            : 'bg-gray-50 text-gray-600 hover:bg-yellow-50 hover:text-yellow-700 border-gray-200 hover:border-yellow-300',
                        ].join(' ')}
                        aria-pressed={isActive}
                      >
                        {region.label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* 푸터: 선택된 지역 이름 + 닫기 버튼 */}
            <div className="border-t border-gray-100 px-4 py-2.5 flex items-center justify-between bg-gray-50">
              <span className="text-xs text-gray-400">
                선택된 지역:{' '}
                <strong className="text-gray-700">{activeLabel}</strong>
              </span>
              <button
                type="button"
                onClick={onClosePanel}
                className="text-xs text-gray-500 hover:text-gray-800 font-medium transition-colors"
                aria-label="지역 선택 패널 닫기"
              >
                닫기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
