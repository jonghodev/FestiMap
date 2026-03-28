import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import BackButton from '@/components/BackButton';
import BookmarkButton from '@/components/BookmarkButton';
import EventInfoSection from '@/components/EventInfoSection';
// LazyVenueMapWrapper defers Kakao SDK initialisation until the map section
// scrolls into view (via IntersectionObserver), keeping page load fast on
// mobile.  The underlying EventVenueMap chunk is prefetched in the background
// so there is no perceptible delay when the user does scroll to the map.
import EventVenueMap from '@/components/map/LazyVenueMapWrapper';
import SocialSharePanel from '@/components/SocialSharePanel';

const EVENT_TYPE_COLORS = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
} as const;

interface EventPageProps {
  params: Promise<{ id: string }>;
}

/** Generate dynamic page title and description for SEO / social sharing */
export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      name: true,
      description: true,
      venue: true,
      city: true,
      district: true,
      imageUrl: true,
      startDate: true,
      endDate: true,
      isFree: true,
      price: true,
    },
  });

  if (!event) {
    return { title: '행사를 찾을 수 없습니다 | FestiMap' };
  }

  const description = event.description
    ? event.description.slice(0, 120)
    : `${event.venue} (${event.district ?? event.city})`;

  const priceText = event.isFree ? '무료 입장' : event.price ? `입장료: ${event.price}` : null;
  const fullDescription = priceText ? `${description} · ${priceText}` : description;

  return {
    title: `${event.name} | FestiMap`,
    description: fullDescription,
    openGraph: {
      title: `${event.name} | FestiMap`,
      description: fullDescription,
      type: 'article',
      ...(event.imageUrl ? { images: [{ url: event.imageUrl, alt: event.name }] } : {}),
    },
    twitter: {
      card: event.imageUrl ? 'summary_large_image' : 'summary',
      title: `${event.name} | FestiMap`,
      description: fullDescription,
      ...(event.imageUrl ? { images: [event.imageUrl] } : {}),
    },
  };
}

export default async function EventDetailPage({ params }: EventPageProps) {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
  });

  if (!event) {
    notFound();
  }

  // ── 서버 사이드 북마크 상태 조회 ────────────────────────────────────────────
  // 로그인한 사용자라면 DB에서 북마크 여부를 미리 확인하여 클라이언트에 전달합니다.
  // 덕분에 클라이언트가 별도 API 요청 없이 초기 상태를 즉시 반영할 수 있습니다.
  let initialIsBookmarked: boolean | undefined;
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) {
      const payload = await verifyToken(token);
      if (payload) {
        const bookmark = await prisma.bookmark.findUnique({
          where: { userId_eventId: { userId: payload.userId, eventId: id } },
          select: { id: true },
        });
        initialIsBookmarked = bookmark !== null;
      }
    }
  } catch {
    // 쿠키 또는 DB 오류 시 클라이언트에서 조회하도록 undefined 유지
  }

  const typeColor =
    EVENT_TYPE_COLORS[event.eventType as keyof typeof EVENT_TYPE_COLORS] || '#6B7280';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Sticky header ─────────────────────────────────────────────────────
          Full-width on all breakpoints; inner content is max-width capped and
          centred on desktop so it stays aligned with the two-column content area.
          xl: max-width expands with the wider content container.

          will-change-transform: forces GPU compositing on iOS Safari, preventing
          the common artefact where the sticky header flickers or briefly
          disappears during high-speed momentum scroll. The new stacking context
          is harmless here because all z-index-sensitive children (BookmarkButton
          error tooltip) are descendants of this same element.                   */}
      {/* pt-safe-top: on iPhones with a notch or Dynamic Island, viewport-fit=cover
          extends the page under the status bar.  Without this padding the header
          content overlaps the system time/battery indicators.
          env(safe-area-inset-top) is 0 on non-notched devices – no side effects. */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm will-change-transform pt-safe-top">
        <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex items-center gap-2 px-3 py-1.5 lg:px-6 xl:px-8 2xl:px-12 lg:py-3">
          {/* BackButton uses router.back() so pressing it does NOT add an extra
              forward-history entry.  This ensures the native back gesture / swipe
              returns the user to the map rather than bouncing back to this page.

              min-h-[44px] min-w-[44px]: meets the iOS Human Interface Guidelines
              minimum touch target recommendation (44 × 44 pt), preventing missed
              taps on small-screen devices.  The -ml-1 pull compensates for the
              px-2 padding so the button's visual left edge aligns with the
              container gutter.                                                   */}
          <BackButton
            fallbackHref="/"
            className="flex items-center gap-1 min-h-[44px] min-w-[44px] px-2 -ml-1 text-sm text-gray-600 hover:text-gray-900 active:text-gray-900 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="지도로 돌아가기"
          >
            ← 뒤로
          </BackButton>
          <h1
            className="font-bold text-gray-900 text-base flex-1 truncate lg:text-lg xl:text-xl 2xl:text-2xl"
            title={event.name}
          >
            {event.name}
          </h1>
          {/* 북마크 버튼 – 로그인 여부와 무관하게 항상 표시;
              미인증 상태에서 탭하면 /login으로 리다이렉트됩니다. */}
          <BookmarkButton
            eventId={event.id}
            initialIsBookmarked={initialIsBookmarked}
          />
        </div>
      </header>

      {/* ── Page content ──────────────────────────────────────────────────────
          Mobile:  single-column stacked layout
          lg (≥1024px):  max-w-5xl, two-column grid (1fr + 340px sidebar), gap-6
          xl (≥1280px):  max-w-6xl, two-column grid (1fr + 400px sidebar), gap-8
          · Left column  — hero image + event info sections
          · Right column — venue map + action buttons + social share
                           (sticky so it stays visible while user reads the left) */}
      <main className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto lg:px-6 xl:px-8 2xl:px-12 lg:py-8 xl:py-10 2xl:py-14">
        <div className="lg:grid lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px] 2xl:grid-cols-[1fr_500px] lg:gap-6 xl:gap-8 2xl:gap-12 lg:items-start">

          {/* ── LEFT COLUMN: hero + event information ──────────────────────── */}
          <div className="min-w-0">

            {/* Hero image or emoji placeholder
                Mobile:  full-width, 208 px tall, no rounding
                Desktop: rounded-2xl, 288 px tall, matches card style */}
            {event.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={event.imageUrl}
                alt={event.name}
                className="w-full h-52 object-cover lg:h-72 xl:h-80 2xl:h-96 lg:rounded-2xl lg:shadow-sm"
                loading="eager"
                fetchPriority="high"
              />
            ) : (
              <div
                className="w-full h-52 flex items-center justify-center text-7xl lg:h-72 xl:h-80 2xl:h-96 lg:rounded-2xl lg:shadow-sm"
                style={{ backgroundColor: typeColor + '20' }}
                aria-hidden="true"
              >
                {event.eventType === 'FESTIVAL'
                  ? '🎉'
                  : event.eventType === 'FLEA_MARKET'
                  ? '🛍️'
                  : '🌙'}
              </div>
            )}

            {/* Core event information display section ────────────────────────
                Mobile:  renders as separate white cards with mb-2 gaps (default)
                Desktop: wrapped inside a single rounded card to unify the sections
                         visually.  The inner sections keep their own padding so the
                         spacing inside the card is consistent.                     */}
            <div className="lg:mt-4 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:overflow-hidden">
              <EventInfoSection
                event={{
                  name: event.name,
                  eventType: event.eventType,
                  startDate: event.startDate,
                  endDate: event.endDate,
                  venue: event.venue,
                  address: event.address,
                  district: event.district,
                  city: event.city,
                  description: event.description,
                  organizer: event.organizer,
                  isFree: event.isFree,
                  price: event.price,
                  website: event.website,
                  contactInfo: event.contactInfo,
                  sourceUrl: event.sourceUrl,
                }}
              />
            </div>

            {/* Venue map – shown inline on mobile below the info sections.
                On desktop it moves to the right sidebar (rendered there in the DOM). */}
            <div className="lg:hidden">
              {event.latitude != null && event.longitude != null && (
                <EventVenueMap
                  lat={event.latitude}
                  lng={event.longitude}
                  name={event.name}
                  eventType={event.eventType}
                  venue={event.venue}
                  address={event.address}
                />
              )}

              {/* Primary action buttons (mobile only – desktop version in sidebar) */}
              <div className="px-4 py-4 bg-white space-y-2">
                <a
                  href={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-white font-semibold text-sm rounded-xl transition-colors"
                >
                  <span aria-hidden="true">🗺️</span>
                  <span>카카오맵에서 길찾기</span>
                </a>
                {(event.website || event.sourceUrl) && (
                  <a
                    href={event.website ?? event.sourceUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
                  >
                    <span aria-hidden="true">🔗</span>
                    <span>공식 사이트 방문</span>
                  </a>
                )}
              </div>

              {/* Social sharing panel (mobile) */}
              <SocialSharePanel
                title={event.name}
                description={
                  event.description
                    ? event.description.slice(0, 100)
                    : `${event.venue} (${event.district ?? event.city})`
                }
                imageUrl={event.imageUrl}
              />

              {/* Back to map button (mobile) */}
              <div className="px-4 pb-4 bg-white mt-px">
                <BackButton
                  fallbackHref="/"
                  className="flex items-center justify-center gap-2 w-full py-3 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-600 font-medium text-sm rounded-xl transition-colors"
                  aria-label="지도로 돌아가기"
                >
                  ← 지도로 돌아가기
                </BackButton>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (desktop sidebar) ─────────────────────────────────
              Hidden on mobile (content is rendered inline in the left column above).
              Sticky so the user can always see the map and CTA buttons while reading
              the event description.
              top offset = header height (≈73 px) + 8 px breathing room           */}
          {/* max-h + overflow-y: prevents sidebar from overflowing viewport on small-height
              monitors (e.g. 768 px laptop screens). Content is still reachable by scrolling
              within the sidebar column when it exceeds the available vertical space. */}
          {/* momentum-scroll: adds -webkit-overflow-scrolling:touch for iOS kinetic
              flick-scroll within the sidebar overflow container, overscroll-behavior:
              contain to stop sidebar-edge scroll from propagating to the main page,
              and will-change:scroll-position for GPU raster pre-allocation.         */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-[81px] 2xl:top-[89px] lg:max-h-[calc(100vh-97px)] 2xl:max-h-[calc(100vh-105px)] lg:overflow-y-auto lg:pb-4 momentum-scroll">

            {/* Venue map embed */}
            {event.latitude != null && event.longitude != null && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                <EventVenueMap
                  lat={event.latitude}
                  lng={event.longitude}
                  name={event.name}
                  eventType={event.eventType}
                  venue={event.venue}
                  address={event.address}
                />
              </div>
            )}

            {/* Primary action buttons */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-4 2xl:px-6 2xl:py-5 space-y-2">
              {/* Kakao Map navigation */}
              <a
                href={`https://map.kakao.com/?q=${encodeURIComponent(event.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 2xl:py-4 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 text-white font-semibold text-sm 2xl:text-base rounded-xl transition-colors"
              >
                <span aria-hidden="true">🗺️</span>
                <span>카카오맵에서 길찾기</span>
              </a>

              {/* Official site link */}
              {(event.website || event.sourceUrl) && (
                <a
                  href={event.website ?? event.sourceUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 2xl:py-4 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-semibold text-sm 2xl:text-base rounded-xl transition-colors"
                >
                  <span aria-hidden="true">🔗</span>
                  <span>공식 사이트 방문</span>
                </a>
              )}
            </div>

            {/* Social sharing */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <SocialSharePanel
                title={event.name}
                description={
                  event.description
                    ? event.description.slice(0, 100)
                    : `${event.venue} (${event.district ?? event.city})`
                }
                imageUrl={event.imageUrl}
              />
            </div>

            {/* Back to map link (desktop sidebar) */}
            <BackButton
              fallbackHref="/"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-500 hover:text-gray-700 font-medium text-sm rounded-2xl shadow-sm transition-colors border border-gray-100"
              aria-label="지도로 돌아가기"
            >
              ← 지도로 돌아가기
            </BackButton>
          </div>
        </div>
      </main>

      {/* iOS safe-area bottom spacing: respects the home indicator inset with a
          minimum of h-8 (2 rem) so content never clips on any device. */}
      <div className="safe-area-bottom" style={{ minHeight: '2rem' }} aria-hidden="true" />
    </div>
  );
}
