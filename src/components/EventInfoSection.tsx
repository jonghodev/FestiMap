/**
 * EventInfoSection – Core event information display component.
 *
 * Renders the structured event detail panel including:
 *   - Event name (h2 heading)
 *   - Category badge (축제 / 플리마켓 / 야시장) with color coding
 *   - Price / free badge
 *   - Status badge (진행 중 / 예정 / 종료)
 *   - Description text
 *   - Date / time range (time shown only when not midnight)
 *   - Venue + full address + district / city
 *   - Organizer (if available)
 *   - Admission price (if not free, with pricing tiers if present)
 *   - Official website / source URL (with readable domain display)
 *   - Contact info (phone numbers → tel: links, emails → mailto: links)
 *
 * This is a pure server-compatible component (no client hooks) so it can be
 * rendered as part of a Next.js Server Component page.
 */

import { EVENT_TYPE_LABELS, type EventType } from '@/types/index';

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPE_COLORS: Record<string, string> = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
};

const EVENT_TYPE_EMOJIS: Record<string, string> = {
  FESTIVAL: '🎉',
  FLEA_MARKET: '🛍️',
  NIGHT_MARKET: '🌙',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when a Date has a non-midnight time component. */
function hasSignificantTime(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

/** Format a Date in Korean locale.  Optionally appends HH:MM when showTime=true. */
function formatKoreanDate(date: Date, showTime = false): string {
  const datePart = date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  if (!showTime) return datePart;

  const timePart = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return `${datePart} ${timePart}`;
}

/** Derive human-readable event status for today's date. */
function getEventStatus(startDate: Date, endDate: Date, now: Date): '진행 중' | '예정' | '종료' {
  if (now < startDate) return '예정';
  if (now > endDate) return '종료';
  return '진행 중';
}

/**
 * Extract the readable hostname from a URL string.
 * Falls back to the raw URL if parsing fails.
 * Strips "www." prefix for cleaner display.
 */
function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // Not a valid absolute URL – trim for display
    return url.length > 40 ? url.slice(0, 37) + '…' : url;
  }
}

/**
 * Korean phone number pattern: handles formats like
 *   010-1234-5678   010-12345678
 *   02-123-4567     02-1234-5678
 *   031-123-4567    031-1234-5678
 *   1544-xxxx       120
 * Returns a tel: href-friendly string (digits + hyphens only).
 */
const PHONE_REGEX =
  /(?:0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}|1[0-9]{3}[-\s]?\d{4}|120)/g;

/** Simple RFC-5322 reduced email pattern */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Parse a contact info string and return an array of React-renderable segments:
 * plain text, phone links, or email links.
 */
function parseContactInfo(
  raw: string
): Array<{ type: 'text' | 'phone' | 'email'; value: string }> {
  // Build a combined regex that matches either phones or emails
  const combined = new RegExp(
    `(${PHONE_REGEX.source})|(${EMAIL_REGEX.source})`,
    'g'
  );

  const segments: Array<{ type: 'text' | 'phone' | 'email'; value: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(raw)) !== null) {
    // Push any plain text before this match
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: raw.slice(lastIndex, match.index) });
    }

    const matchedValue = match[0];
    if (match[1]) {
      // Phone number matched (first capture group)
      segments.push({ type: 'phone', value: matchedValue });
    } else {
      // Email matched (second capture group)
      segments.push({ type: 'email', value: matchedValue });
    }

    lastIndex = match.index + matchedValue.length;
  }

  // Remaining plain text
  if (lastIndex < raw.length) {
    segments.push({ type: 'text', value: raw.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: raw }];
}

/** Render contact info with clickable phone/email links */
function ContactInfoContent({ value }: { value: string }) {
  const segments = parseContactInfo(value);

  return (
    <p className="text-sm text-gray-900 font-medium pt-3 whitespace-pre-line lg:text-base 2xl:text-lg">
      {segments.map((seg, i) => {
        if (seg.type === 'phone') {
          // Normalize phone number for tel: href (remove spaces/hyphens)
          const telHref = `tel:${seg.value.replace(/[\s\-]/g, '')}`;
          return (
            <a
              key={i}
              href={telHref}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors"
            >
              {seg.value}
            </a>
          );
        }
        if (seg.type === 'email') {
          return (
            <a
              key={i}
              href={`mailto:${seg.value}`}
              className="text-blue-600 underline underline-offset-2 hover:text-blue-800 transition-colors"
            >
              {seg.value}
            </a>
          );
        }
        return <span key={i}>{seg.value}</span>;
      })}
    </p>
  );
}

// ─── Status badge colour mapping ──────────────────────────────────────────────

const STATUS_STYLES = {
  '진행 중': 'bg-green-50 text-green-700 border border-green-200',
  '예정': 'bg-blue-50 text-blue-700 border border-blue-200',
  '종료': 'bg-gray-100 text-gray-500 border border-gray-200',
} as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 xl:gap-4 2xl:gap-5">
      <span className="text-xl mt-0.5 flex-shrink-0 w-7 text-center lg:text-2xl lg:w-8 xl:w-9 2xl:text-3xl 2xl:w-10" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-0.5 lg:text-sm xl:text-sm xl:font-medium xl:text-gray-400 2xl:text-base">{label}</p>
        {children}
      </div>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EventInfoData {
  name: string;
  eventType: string;
  startDate: Date;
  endDate: Date;
  venue: string;
  address: string;
  district?: string | null;
  city: string;
  description?: string | null;
  organizer?: string | null;
  isFree: boolean;
  price?: string | null;
  /** Official event website URL (may differ from source/API URL) */
  website?: string | null;
  /** Contact phone number or email for the event */
  contactInfo?: string | null;
  /** Source/reference URL used for data seeding */
  sourceUrl?: string | null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EventInfoSection({ event }: { event: EventInfoData }) {
  const typeLabel =
    EVENT_TYPE_LABELS[event.eventType as EventType] ?? event.eventType;
  const typeColor = EVENT_TYPE_COLORS[event.eventType] ?? '#6B7280';
  const typeEmoji = EVENT_TYPE_EMOJIS[event.eventType] ?? '📌';

  // Determine status relative to now.
  const now = new Date();
  const status = getEventStatus(event.startDate, event.endDate, now);

  // Date / time formatting
  const startShowTime = hasSignificantTime(event.startDate);
  const endShowTime = hasSignificantTime(event.endDate);
  const isMultiDay =
    event.startDate.toDateString() !== event.endDate.toDateString();
  // Show end time if either side has meaningful time data
  const showEndTime = endShowTime || startShowTime;

  const formattedStart = formatKoreanDate(event.startDate, startShowTime);
  const formattedEnd = formatKoreanDate(event.endDate, showEndTime);

  // Determine the primary URL to display
  const primaryUrl = event.website ?? event.sourceUrl;
  // Show source URL as reference only when different from website
  const refUrl =
    event.sourceUrl && event.sourceUrl !== event.website ? event.sourceUrl : null;

  return (
    <>
      {/* ── Card 1: name · category · status · description ─────────────────── */}
      {/* Mobile:  standalone white card with bottom margin (mb-2)
          Desktop: first section inside the parent rounded card (no bottom margin needed
                   since the parent lg:bg-white wrapper handles the card boundary).
          xl:      more generous padding for comfortable reading on large screens.  */}
      <section className="px-4 py-5 bg-white mb-2 lg:mb-0 lg:border-b lg:border-gray-100 xl:px-8 xl:py-7 2xl:px-12 2xl:py-10" aria-label="행사 기본 정보">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {/* Category badge */}
          <span
            className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1 rounded-full text-white"
            style={{ backgroundColor: typeColor }}
          >
            <span aria-hidden="true">{typeEmoji}</span>
            {typeLabel}
          </span>

          {/* Status badge */}
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[status]}`}
          >
            {status}
          </span>

          {/* Free / price badge */}
          {event.isFree ? (
            <span className="text-sm font-medium text-green-600 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
              무료 입장
            </span>
          ) : event.price ? (
            <span className="text-sm text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1 rounded-full">
              유료
            </span>
          ) : null}
        </div>

        {/* Event name – larger on desktop for visual hierarchy; xl gets another step up */}
        <h2 className="text-xl font-bold text-gray-900 mb-3 leading-snug lg:text-2xl lg:mb-4 xl:text-3xl xl:mb-5 xl:leading-tight 2xl:text-4xl 2xl:mb-6">
          {event.name}
        </h2>

        {/* Description – slightly larger line-height on desktop for readability;
            xl: max-width on the prose block for comfortable 60-75 char line length */}
        {event.description ? (
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line lg:text-base lg:leading-loose xl:text-base xl:leading-loose xl:max-w-prose 2xl:text-lg 2xl:leading-loose">
            {event.description}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic lg:text-base xl:text-base 2xl:text-lg">상세 설명이 없습니다.</p>
        )}
      </section>

      {/* ── Card 2: structured metadata ────────────────────────────────────── */}
      {/* Mobile:  standalone white card with bottom margin
          Desktop: second section inside the parent card, separated by a top border
          xl:      more generous padding to match Card 1 */}
      <section
        className="px-4 py-4 bg-white mb-2 space-y-4 lg:mb-0 xl:px-8 xl:py-7 2xl:px-12 2xl:py-10"
        aria-label="행사 상세 정보"
      >
        <h3 className="font-semibold text-gray-900 text-sm tracking-wide lg:text-base xl:text-lg xl:font-bold xl:tracking-normal 2xl:text-xl">
          행사 정보
        </h3>

        <div className="space-y-4 divide-y divide-gray-50">
          {/* Date / time -------------------------------------------------- */}
          <InfoRow icon="📅" label="기간">
            <p className="text-sm text-gray-900 font-medium lg:text-base 2xl:text-lg">{formattedStart}</p>
            {(isMultiDay || showEndTime) && (
              <p className="text-sm text-gray-600 mt-0.5 lg:text-base 2xl:text-lg">
                {isMultiDay ? `~ ${formattedEnd}` : `종료 ${formattedEnd}`}
              </p>
            )}
            {/* Duration label for multi-day events */}
            {isMultiDay && (() => {
              const diffMs = event.endDate.getTime() - event.startDate.getTime();
              const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
              return (
                <p className="text-xs text-gray-400 mt-0.5 lg:text-sm 2xl:text-base">총 {diffDays}일간</p>
              );
            })()}
          </InfoRow>

          {/* Location ----------------------------------------------------- */}
          <InfoRow icon="📍" label="장소">
            <p className="text-sm text-gray-900 font-medium pt-3 lg:text-base 2xl:text-lg">{event.venue}</p>
            <p className="text-sm text-gray-600 mt-0.5 lg:text-base 2xl:text-lg">{event.address}</p>
            {(event.district || event.city) && (
              <p className="text-xs text-gray-400 mt-0.5 lg:text-sm 2xl:text-base">
                {[event.district, event.city].filter(Boolean).join(' · ')}
              </p>
            )}
          </InfoRow>

          {/* Organizer ---------------------------------------------------- */}
          {event.organizer && (
            <InfoRow icon="🏢" label="주최">
              <p className="text-sm text-gray-900 font-medium pt-3 lg:text-base 2xl:text-lg">{event.organizer}</p>
            </InfoRow>
          )}

          {/* Admission fee ------------------------------------------------ */}
          {event.isFree ? (
            <InfoRow icon="🎟️" label="입장료">
              <div className="pt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg lg:text-base 2xl:text-lg">
                  <span aria-hidden="true">✅</span> 무료 입장
                </span>
              </div>
            </InfoRow>
          ) : event.price ? (
            <InfoRow icon="🎟️" label="입장료">
              <div className="pt-3 space-y-1">
                {/* Support multi-line price tiers (split by newlines or semicolons) */}
                {event.price.split(/[\n;]/).map((tier, i) => (
                  <p key={i} className="text-sm text-gray-900 font-medium lg:text-base 2xl:text-lg">
                    {tier.trim()}
                  </p>
                ))}
              </div>
            </InfoRow>
          ) : (
            <InfoRow icon="🎟️" label="입장료">
              <p className="text-sm text-gray-400 pt-3 lg:text-base 2xl:text-lg">정보 없음</p>
            </InfoRow>
          )}

          {/* Official website -------------------------------------------- */}
          {primaryUrl && (
            <InfoRow icon="🌐" label="공식 웹사이트">
              <a
                href={primaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline underline-offset-2 pt-3 block hover:text-blue-800 transition-colors lg:text-base 2xl:text-lg"
              >
                {getDisplayUrl(primaryUrl)}
              </a>
              {/* Show the original source URL as a secondary reference when different */}
              {refUrl && (
                <a
                  href={refUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 underline underline-offset-2 mt-1 block hover:text-gray-600 transition-colors lg:text-sm 2xl:text-base"
                >
                  참고: {getDisplayUrl(refUrl)}
                </a>
              )}
            </InfoRow>
          )}

          {/* Contact info ------------------------------------------------- */}
          {event.contactInfo && (
            <InfoRow icon="📞" label="문의">
              <ContactInfoContent value={event.contactInfo} />
            </InfoRow>
          )}
        </div>
      </section>
    </>
  );
}
