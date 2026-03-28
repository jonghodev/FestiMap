'use client';

import { useEffect, useRef, useState } from 'react';
import { useKakaoMapInstance } from '@/hooks/useKakaoMap';

/** Zoom level for the venue map embed – street/neighbourhood scale */
const VENUE_MAP_ZOOM = 4;

/**
 * Maximum vertical finger movement (in CSS pixels) that still counts as a tap
 * rather than a scroll on the tap-to-activate map overlay.
 * Matches the micro-slop tolerance used by native iOS/Android tap recognisers.
 */
const TAP_THRESHOLD_PX = 10;

/** Color per event type – matches the detail-page hero palette */
const EVENT_TYPE_COLORS: Record<string, string> = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
};

/**
 * Generates a colored pin SVG as a data URL for use as a Kakao MarkerImage.
 * Identical to the pin style used on the main map for visual consistency.
 */
function makeMarkerImageUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <circle cx="14" cy="13" r="11" fill="${color}" stroke="white" stroke-width="2.5"/>
    <polygon points="14,36 8,26 20,26" fill="${color}"/>
    <circle cx="14" cy="13" r="4.5" fill="white" opacity="0.45"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

/**
 * Creates the HTML string for the venue name CustomOverlay bubble.
 * Displayed above the marker pin on the venue map.
 */
function makeOverlayContent(venueName: string, color: string): string {
  // Encode potentially dangerous characters to prevent XSS
  const safeVenueName = venueName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `<div style="
    background: white;
    border: 2px solid ${color};
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    position: relative;
    transform: translateX(-50%);
    margin-bottom: 6px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  ">${safeVenueName}<div style="
    position: absolute;
    bottom: -7px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 7px solid ${color};
  "></div></div>`;
}

interface EventVenueMapProps {
  /** Event venue latitude */
  lat: number;
  /** Event venue longitude */
  lng: number;
  /** Event name – used as fallback label if venue is not provided */
  name: string;
  /** Event type – determines marker pin colour */
  eventType: string;
  /** Venue/place name shown in the map overlay bubble */
  venue?: string;
  /** Full address shown below the map and in error fallback */
  address?: string;
}

/**
 * EventVenueMap
 *
 * A compact, read-only Kakao Map embed for the event detail page.
 * Shows a single coloured pin marker at the event venue, with a name bubble
 * overlay that opens automatically when the map loads.
 *
 * Features:
 * – Coloured pin matching the main map's event-type palette
 * – Auto-opened venue name label above the marker (CustomOverlay)
 * – Address text shown below the map for quick reference
 * – Copy-to-clipboard button for the address
 * – Graceful error fallback showing address when map cannot load
 *
 * Map interactions (pan/zoom) are enabled so the user can explore
 * the surrounding neighbourhood before deciding to navigate.
 */
export default function EventVenueMap({
  lat,
  lng,
  name,
  eventType,
  venue,
  address,
}: EventVenueMapProps) {
  const markerColor = EVENT_TYPE_COLORS[eventType] ?? '#6B7280';
  const displayLabel = venue || name;

  // Initialize the Kakao Map instance directly (bypasses the generic KakaoMap
  // component wrapper) so we can manage the marker and overlay ourselves.
  const { containerRef, mapInstance, status } = useKakaoMapInstance({
    lat,
    lng,
    level: VENUE_MAP_ZOOM,
  });

  // Keep refs to Kakao objects so cleanup can remove them on unmount
  const markerRef = useRef<kakao.maps.Marker | null>(null);
  const overlayRef = useRef<kakao.maps.CustomOverlay | null>(null);

  // Copy-to-clipboard state
  const [copied, setCopied] = useState(false);

  // Keep a ref to the outer map wrapper so we can observe resize events.
  // This handles two mobile scenarios that leave grey tiles without relayout():
  //   1. Device orientation changes (portrait ↔ landscape)
  //   2. iOS Safari URL bar appearing / disappearing (dynamic viewport height)
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // ── Tap-to-activate scroll conflict resolution ──────────────────────────────
  // Problem: this map is embedded inside a vertically-scrollable event detail
  // page.  If we apply touch-action: none unconditionally, the browser passes
  // ALL touch events (including vertical swipes) to the Kakao SDK — the user
  // cannot scroll past the map at all, creating a "scroll trap".
  //
  // Solution: keep touch-action: pan-y by default so the page still scrolls
  // when the user swipes vertically over the map area.  Only switch to
  // touch-action: none (full Kakao control) AFTER the user explicitly taps
  // the map to activate it.  This matches the UX of Google Maps / Naver Maps
  // embeds and is the recommended approach for maps in scrollable pages.
  const [isMapActive, setIsMapActive] = useState(false);

  // ── Tap vs scroll disambiguation ─────────────────────────────────────────
  // When the user touches the tap-to-activate overlay, we must distinguish a
  // genuine tap (finger down → up with minimal movement) from a scroll gesture
  // (finger down → significant vertical movement → up).  With touch-action:
  // pan-y on the parent wrapper the browser handles the scroll natively, but
  // it still fires touchEnd on the overlay element.  Without this guard
  // a vertical scroll that ends over the map area would activate the map even
  // though the user only intended to scroll the page.
  //
  // Threshold: TAP_THRESHOLD_PX (10 px) matches the typical "micro-slop"
  // tolerance used by native iOS and Android tap recognisers.  Any movement
  // beyond that is treated as a scroll, not a tap.
  //
  // tapCancelledRef: set true during onTouchMove once dy ≥ TAP_THRESHOLD_PX so
  // that a slow scroll (which never exceeds threshold in a single touchmove
  // event but accumulates over several events) is still rejected as a tap.
  const tapStartRef = useRef<{ y: number } | null>(null);
  const tapCancelledRef = useRef(false);

  // ── Place marker + overlay once the map instance is available ──────────────
  useEffect(() => {
    if (!mapInstance || !window.kakao?.maps) return;

    const position = new window.kakao.maps.LatLng(lat, lng);

    // — Coloured pin marker —
    const imageUrl = makeMarkerImageUrl(markerColor);
    const imageSize = new window.kakao.maps.Size(28, 36);
    const imageOptions: kakao.maps.MarkerImageOptions = {
      // Anchor the image at the tip of the pin (bottom-centre)
      offset: new window.kakao.maps.Point(14, 36),
    };
    const markerImage = new window.kakao.maps.MarkerImage(
      imageUrl,
      imageSize,
      imageOptions
    );

    const marker = new window.kakao.maps.Marker({
      map: mapInstance,
      position,
      image: markerImage,
      title: displayLabel,
      clickable: false, // Venue map is read-only; tapping the map pans/zooms
    });
    markerRef.current = marker;

    // — Venue name label overlay —
    // Positioned at the same coordinate as the marker; yAnchor=1 means the
    // bottom of the overlay content aligns with the lat/lng point, and since
    // we add a downward-pointing arrow in the HTML, the bubble sits nicely
    // above the pin tip.
    const overlay = new window.kakao.maps.CustomOverlay({
      map: mapInstance,
      position,
      content: makeOverlayContent(displayLabel, markerColor),
      xAnchor: 0.5,   // Horizontally centred on the coordinate
      yAnchor: 1.55,  // Sits above the 36px marker pin with a small gap
      zIndex: 5,
      clickable: false,
    });
    overlayRef.current = overlay;

    // Cleanup: remove from map on unmount or when dependencies change
    return () => {
      overlay.setMap(null);
      marker.setMap(null);
      markerRef.current = null;
      overlayRef.current = null;
    };
  }, [mapInstance, lat, lng, markerColor, displayLabel]);

  // ── Auto-deactivate map when it scrolls off-screen ──────────────────────────
  // When the user scrolls the event detail page and the map container leaves
  // the visible viewport while isMapActive=true, the map stays "trapped" — the
  // user cannot scroll back past it.  An IntersectionObserver solves this by
  // switching back to scroll-through mode (isMapActive=false) the moment the
  // map div is no longer visible.  This mirrors the UX of Google Maps embeds.
  useEffect(() => {
    if (!wrapperRef.current || !isMapActive) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setIsMapActive(false);
        }
      },
      { threshold: 0 } // fire as soon as even 1 px leaves the viewport
    );

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, [isMapActive]);

  // ── Relayout on container resize ────────────────────────────────────────────
  // Observes the outer wrapper element for size changes and calls relayout() so
  // Kakao repaints its canvas to fill the new dimensions.  Without this, the map
  // leaves unpainted grey bands after orientation changes or iOS Safari URL bar
  // visibility transitions.
  useEffect(() => {
    if (!mapInstance || !wrapperRef.current || !window.kakao?.maps) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        mapInstance.relayout();
      });
    });

    observer.observe(wrapperRef.current);

    return () => {
      observer.disconnect();
    };
  }, [mapInstance]);

  // ── Copy address to clipboard ───────────────────────────────────────────────
  const handleCopyAddress = async () => {
    const textToCopy = address || displayLabel;
    try {
      await navigator.clipboard.writeText(textToCopy);
    } catch {
      // Fallback for browsers without Clipboard API (e.g. older WebViews)
      const el = document.createElement('textarea');
      el.value = textToCopy;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(el);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Error fallback ──────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <section className="px-4 py-4 bg-white border-t border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <span aria-hidden="true">📍</span>
          위치 안내
        </h2>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-gray-500 text-xs mb-2 text-center">지도를 불러올 수 없습니다</p>
          {address ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-sm text-gray-700 leading-relaxed">{address}</p>
              <button
                onClick={handleCopyAddress}
                className="shrink-0 flex items-center min-h-[44px] text-xs text-yellow-600 hover:text-yellow-700 active:text-yellow-800 font-medium px-2.5 rounded-lg hover:bg-yellow-50 active:bg-yellow-100 transition-colors"
                aria-label="주소 복사"
              >
                {copied ? '✓ 복사됨' : '복사'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-700 text-center">{displayLabel}</p>
          )}
        </div>
      </section>
    );
  }

  // ── Normal render ───────────────────────────────────────────────────────────
  return (
    <section className="px-4 py-4 bg-white border-t border-gray-100">
      {/* Section heading */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
        <span aria-hidden="true">📍</span>
        위치 안내
      </h2>

      {/* Map embed – 240 px tall, rounded corners, overflow hidden clips map UI chrome.
          Touch-action strategy (scroll-conflict resolution):
          • Inactive (default): touch-action: pan-y — vertical swipes scroll the page
            normally; a semi-transparent overlay prompts the user to tap to activate.
          • Active: touch-action: none — ALL touch events go to the Kakao SDK so
            drag-to-pan, pinch-to-zoom, and tap-on-marker all work correctly.
          This matches the UX pattern used by Google Maps / Naver Maps embeds. */}
      <div
        ref={wrapperRef}
        className="relative h-60 w-full rounded-xl overflow-hidden shadow-sm border border-gray-200"
        style={{ touchAction: isMapActive ? 'none' : 'pan-y' }}
        aria-label={`${displayLabel} 위치 지도`}
        role="region"
      >
        {/* Kakao Map container – map renders here after SDK loads */}
        <div
          ref={containerRef}
          className="w-full h-full"
          aria-label="카카오 지도"
          role="application"
        />

        {/* Loading skeleton overlay – hidden once map is ready */}
        {status !== 'ready' && (
          <div
            className="absolute inset-0 bg-gray-100 animate-pulse flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-gray-500 text-xs">지도 불러오는 중…</p>
            </div>
          </div>
        )}

        {/* Tap-to-activate overlay (shown when map is ready but not yet tapped).
            Sits above the map so that a casual vertical swipe over the map area
            still scrolls the page.  Once tapped, the overlay disappears and the
            map becomes fully interactive (touch-action: none kicks in).

            touch-action: pan-y on the overlay (not just the parent wrapper)
            makes the browser intent explicit: vertical swipes pass through to
            the page scroller while the overlay is visible.  A genuine tap
            (< TAP_THRESHOLD_PX movement) activates the map via onTouchEnd. */}
        {status === 'ready' && !isMapActive && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.08)', touchAction: 'pan-y' }}
            onClick={() => setIsMapActive(true)}
            onTouchStart={(e) => {
              // Record touch origin and reset the cancellation flag so we can
              // measure cumulative movement across multiple touchmove events.
              tapStartRef.current = { y: e.touches[0].clientY };
              tapCancelledRef.current = false;
            }}
            onTouchMove={(e) => {
              // Check cumulative vertical movement during the gesture.
              // Once the threshold is exceeded we mark the gesture as a scroll
              // (tapCancelledRef=true) so that a subsequent touchEnd will NOT
              // activate the map — even if the finger drifts back within 10 px
              // of the start point by the time touchEnd fires.
              if (tapStartRef.current !== null && !tapCancelledRef.current) {
                const dy = Math.abs(
                  e.touches[0].clientY - tapStartRef.current.y
                );
                if (dy >= TAP_THRESHOLD_PX) {
                  tapCancelledRef.current = true;
                }
              }
            }}
            onTouchEnd={(e) => {
              if (tapStartRef.current !== null) {
                const wasCancelled = tapCancelledRef.current;
                tapStartRef.current = null;
                tapCancelledRef.current = false;

                if (!wasCancelled) {
                  // Genuine tap – activate the map.
                  // preventDefault() stops the browser from also firing a
                  // synthetic click event after the touch sequence ends.
                  e.preventDefault();
                  setIsMapActive(true);
                }
                // If wasCancelled, user was scrolling the page; do nothing.
              }
            }}
            onTouchCancel={() => {
              // iOS/Android cancels touches when the OS takes over (e.g. system
              // gesture, incoming call, notification banner). Reset state so the
              // next touch sequence starts clean.
              tapStartRef.current = null;
              tapCancelledRef.current = false;
            }}
            role="button"
            aria-label="지도 활성화 — 탭하면 지도를 직접 조작할 수 있습니다"
          >
            <div className="flex items-center gap-2 bg-white/95 rounded-xl px-4 py-2.5 shadow-md border border-gray-200 pointer-events-none">
              <span className="text-base" aria-hidden="true">👆</span>
              <span className="text-sm font-semibold text-gray-700">탭하여 지도 사용</span>
            </div>
          </div>
        )}

        {/* Deactivation button – shown when map is active so the user can
            return the map to "scroll-through" mode and continue scrolling the page.
            min-h-[44px] meets the iOS HIG minimum touch target recommendation. */}
        {status === 'ready' && isMapActive && (
          <button
            type="button"
            className="absolute top-2 right-2 z-10 flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center bg-white/95 text-gray-600 text-xs font-medium rounded-lg px-3 py-2 shadow border border-gray-200 active:bg-gray-100 transition-colors"
            onClick={() => setIsMapActive(false)}
            aria-label="지도 조작 종료 — 탭하면 페이지 스크롤로 돌아갑니다"
            style={{ touchAction: 'manipulation' }}
          >
            <span aria-hidden="true">✕</span>
            <span>닫기</span>
          </button>
        )}
      </div>

      {/* Address row – shows address text + copy button */}
      {address && (
        <div className="mt-2.5 flex items-center gap-2">
          <p className="flex-1 text-xs text-gray-600 leading-relaxed">{address}</p>
          {/* min-h-[44px] ensures the copy button meets iOS 44×44 pt touch
              target requirement even though it is visually compact. */}
          <button
            onClick={handleCopyAddress}
            className="shrink-0 flex items-center min-h-[44px] text-xs text-yellow-600 hover:text-yellow-700 active:text-yellow-800 font-medium px-2.5 rounded-lg hover:bg-yellow-50 active:bg-yellow-100 transition-colors"
            aria-label="주소 복사하기"
          >
            {copied ? '✓ 복사됨' : '주소 복사'}
          </button>
        </div>
      )}

      {/* Hint text – adapts to active/inactive state */}
      <p className="mt-2 text-xs text-gray-400 text-center">
        {isMapActive
          ? '핀치로 확대·축소, 드래그로 이동 · 우측 상단 ✕ 탭 시 스크롤 복귀'
          : '지도를 탭하면 직접 확대·이동할 수 있어요'}
      </p>
    </section>
  );
}
