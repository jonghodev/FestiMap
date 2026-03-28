'use client';

/**
 * DateRangeFilter
 *
 * 지도 화면에 표시되는 날짜 범위 필터 컴포넌트.
 * 전체 / 오늘 / 이번 주 / 이번 달 프리셋을 선택하면
 * 해당 기간에 진행 중이거나 예정된 행사만 지도 마커 및 목록에 표시됩니다.
 *
 * 특징:
 * - 모바일 첫 번째 디자인 (가로 스크롤 가능한 칩 목록)
 * - 현재 선택된 범위를 노란색 강조로 표시
 * - aria-pressed 속성으로 접근성 지원
 */

export type DateRangePreset = 'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';

/** 날짜 범위 값 (ISO 날짜 문자열 YYYY-MM-DD) */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/** 현지 날짜를 YYYY-MM-DD 형식으로 변환 (시간대 오프셋 적용) */
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 프리셋으로부터 날짜 범위를 계산합니다.
 * 'ALL'은 null을 반환합니다 (필터 없음).
 */
export function getDateRangeFromPreset(preset: DateRangePreset): DateRange | null {
  if (preset === 'ALL') return null;

  const today = new Date();

  if (preset === 'TODAY') {
    const todayStr = formatLocalDate(today);
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'THIS_WEEK') {
    // 한국은 월요일 시작 주
    const dayOfWeek = today.getDay(); // 0=일, 1=월, ..., 6=토
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { startDate: formatLocalDate(monday), endDate: formatLocalDate(sunday) };
  }

  if (preset === 'THIS_MONTH') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { startDate: formatLocalDate(firstDay), endDate: formatLocalDate(lastDay) };
  }

  return null;
}

/** 프리셋 표시 라벨 */
export function getPresetLabel(preset: DateRangePreset): string {
  const labels: Record<DateRangePreset, string> = {
    ALL: '전체',
    TODAY: '오늘',
    THIS_WEEK: '이번 주',
    THIS_MONTH: '이번 달',
  };
  return labels[preset];
}

interface DateRangeOption {
  preset: DateRangePreset;
  label: string;
  icon: string;
}

const DATE_RANGE_OPTIONS: DateRangeOption[] = [
  { preset: 'ALL',        label: '전체',    icon: '📅' },
  { preset: 'TODAY',      label: '오늘',    icon: '🌟' },
  { preset: 'THIS_WEEK',  label: '이번 주', icon: '📆' },
  { preset: 'THIS_MONTH', label: '이번 달', icon: '🗓️' },
];

interface DateRangeFilterProps {
  /** 현재 선택된 날짜 범위 프리셋 */
  activePreset: DateRangePreset;
  /** 프리셋 선택 시 호출되는 콜백 */
  onPresetChange: (preset: DateRangePreset) => void;
  /** 추가 className */
  className?: string;
}

/** 날짜를 MM.DD 형식으로 표시 (같은 월이면 한쪽 생략) */
function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-');
  return `${parseInt(month, 10)}.${parseInt(day, 10)}`;
}

/** 활성 프리셋에 대한 날짜 범위 표시 문자열을 생성합니다 */
function getActiveDateLabel(preset: DateRangePreset): string | null {
  const range = getDateRangeFromPreset(preset);
  if (!range) return null;
  if (range.startDate === range.endDate) {
    return formatShortDate(range.startDate);
  }
  return `${formatShortDate(range.startDate)} ~ ${formatShortDate(range.endDate)}`;
}

export default function DateRangeFilter({
  activePreset,
  onPresetChange,
  className = '',
}: DateRangeFilterProps) {
  const activeDateLabel = getActiveDateLabel(activePreset);

  return (
    <div className={`bg-white border-b border-gray-100 flex-shrink-0 ${className}`}>
      <div
        className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto scrollbar-hide momentum-scroll snap-x-proximity"
        role="group"
        aria-label="날짜 범위 필터"
      >
        {/* 라벨 */}
        <span
          className="text-xs text-gray-400 font-medium whitespace-nowrap flex-shrink-0"
          aria-hidden="true"
        >
          기간
        </span>

        {DATE_RANGE_OPTIONS.map(({ preset, label, icon }) => {
          const isActive = activePreset === preset;

          return (
            <button
              key={preset}
              type="button"
              onClick={() => onPresetChange(preset)}
              aria-pressed={isActive}
              aria-label={`${label} 기간 필터${isActive ? ' (선택됨)' : ''}`}
              className={[
                'flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium',
                'whitespace-nowrap transition-all duration-200 flex-shrink-0',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1',
                isActive
                  ? 'bg-yellow-400 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300',
              ].join(' ')}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
            </button>
          );
        })}

        {/* 활성 날짜 범위 표시 (전체 이외의 프리셋 선택 시) */}
        {activeDateLabel && (
          <span
            className="flex-shrink-0 text-xs text-yellow-600 font-medium whitespace-nowrap ml-1"
            aria-live="polite"
            aria-label={`선택된 기간: ${activeDateLabel}`}
          >
            {activeDateLabel}
          </span>
        )}
      </div>
    </div>
  );
}
