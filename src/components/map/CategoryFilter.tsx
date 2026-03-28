'use client';

/**
 * CategoryFilter
 *
 * 지도 화면 상단에 표시되는 카테고리 필터 탭 컴포넌트.
 * 축제 / 플리마켓 / 야시장 / 전체 카테고리를 선택하면
 * 지도 마커 및 목록이 해당 카테고리로 필터링됩니다.
 *
 * 특징:
 * - 각 카테고리 버튼에 지도 마커 색상과 동일한 컬러 닷 표시
 * - 현재 뷰포트에 표시된 행사 수를 배지로 표시
 * - aria-pressed 속성으로 접근성 지원
 * - 모바일 첫 번째 디자인 (가로 스크롤 가능)
 */

export type FilterType = 'ALL' | 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

export const EVENT_TYPE_COLORS: Record<Exclude<FilterType, 'ALL'>, string> = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
};

const ALL_FILTER_COLOR = '#F59E0B'; // yellow-500, matches app accent

interface FilterOption {
  type: FilterType;
  label: string;
  icon: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { type: 'ALL', label: '전체', icon: '📍' },
  { type: 'FESTIVAL', label: '축제', icon: '🎉' },
  { type: 'FLEA_MARKET', label: '플리마켓', icon: '🛍️' },
  { type: 'NIGHT_MARKET', label: '야시장', icon: '🌙' },
];

interface CategoryFilterProps {
  /** 현재 선택된 필터 */
  activeFilter: FilterType;
  /** 필터 선택 시 호출되는 콜백 */
  onFilterChange: (filter: FilterType) => void;
  /** 각 카테고리별 행사 수 (지도/목록에 표시된 이벤트 기준) */
  countByType: Record<string, number>;
  /** 전체 행사 수 (ALL 필터 배지용) */
  totalCount: number;
  /** 데이터 로딩 중 여부 (배지에 시각적 피드백 표시) */
  isLoading?: boolean;
  /** 추가 className */
  className?: string;
}

export default function CategoryFilter({
  activeFilter,
  onFilterChange,
  countByType,
  totalCount,
  isLoading = false,
  className = '',
}: CategoryFilterProps) {
  return (
    <div
      className={`flex items-center gap-1.5 px-4 py-2 bg-white border-b border-gray-100 overflow-x-auto scrollbar-hide flex-shrink-0 momentum-scroll snap-x-proximity ${className}`}
      role="group"
      aria-label="카테고리 필터"
    >
      {FILTER_OPTIONS.map(({ type, label, icon }) => {
        const isActive = activeFilter === type;
        const accentColor =
          type === 'ALL'
            ? ALL_FILTER_COLOR
            : EVENT_TYPE_COLORS[type as Exclude<FilterType, 'ALL'>];

        // 배지 count: ALL이면 totalCount, 나머지는 카테고리별 count
        const badgeCount = type === 'ALL' ? totalCount : (countByType[type] ?? 0);

        return (
          <button
            key={type}
            type="button"
            onClick={() => onFilterChange(type)}
            aria-pressed={isActive}
            aria-label={`${label} 카테고리 필터${isActive ? ' (선택됨)' : ''}`}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              'whitespace-nowrap transition-all duration-200 flex-shrink-0',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              isActive
                ? 'text-white shadow-md'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              isActive
                ? { backgroundColor: accentColor }
                : {}
            }
          >
            {/* 카테고리 아이콘 */}
            <span aria-hidden="true">{icon}</span>

            {/* 카테고리 이름 */}
            <span>{label}</span>

            {/* 카테고리 색상 닷 - 비활성 상태에서 마커 색상을 미리보기로 표시 */}
            {type !== 'ALL' && !isActive && (
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: accentColor }}
                aria-hidden="true"
              />
            )}

            {/* 행사 수 배지 */}
            <span
              className={[
                'ml-0.5 tabular-nums',
                isActive ? 'text-white/80' : 'text-gray-400',
                isLoading ? 'opacity-50' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${badgeCount}개`}
            >
              ({badgeCount})
            </span>
          </button>
        );
      })}
    </div>
  );
}
