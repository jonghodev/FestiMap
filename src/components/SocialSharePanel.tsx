'use client';

/**
 * SocialSharePanel – Multi-option social sharing for event detail pages.
 *
 * Sharing options provided (in priority order for Korean users):
 *   1. 카카오톡 (KakaoTalk) – Rich feed share via Kakao JS SDK. Opens the native
 *      KakaoTalk share sheet on mobile, or a QR-code popup on desktop.
 *      Degrades gracefully when the SDK fails (key not set, domain mismatch, etc.)
 *   2. 링크 복사 (Copy Link) – Writes the current URL to the clipboard.
 *      Shows a brief "복사됨!" toast on success.
 *   3. 더보기 (More / Native Share) – Calls the Web Share API on supported
 *      browsers (iOS Safari, Android Chrome) to open the OS share sheet.
 *      Shown only when navigator.share is available.
 *
 * All options fall back gracefully: if KakaoTalk sharing fails, the error
 * is suppressed and only the copy-link button remains visible.
 */

import { useState, useEffect, useCallback } from 'react';
import type { KakaoShareFeedParams } from '@/lib/kakao-share-loader';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SocialSharePanelProps {
  /** Event title – used as the share card title and native share title */
  title: string;
  /** Short event description for the KakaoTalk share card */
  description?: string | null;
  /**
   * Absolute HTTPS image URL for the KakaoTalk share card thumbnail.
   * If null/undefined the card is sent without an image.
   */
  imageUrl?: string | null;
  /** Override the share URL (defaults to window.location.href) */
  url?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SocialSharePanel({
  title,
  description,
  imageUrl,
  url,
}: SocialSharePanelProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);
  /** Whether KakaoTalk sharing encountered a fatal error this session */
  const [kakaoUnavailable, setKakaoUnavailable] = useState(false);
  /** True once the component has mounted in the browser (enables navigator checks) */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Resolve share URL once we're in the browser
  const shareUrl =
    url ?? (typeof window !== 'undefined' ? window.location.href : '');

  // ── KakaoTalk Share ────────────────────────────────────────────────────────

  const handleKakaoShare = useCallback(async () => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (!appKey) {
      setKakaoUnavailable(true);
      return;
    }

    try {
      // Dynamically import loader to keep it out of the initial JS bundle
      const { loadKakaoShareSDK } = await import('@/lib/kakao-share-loader');
      await loadKakaoShareSDK(appKey);

      const params: KakaoShareFeedParams = {
        objectType: 'feed',
        content: {
          title,
          description: description ?? title,
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
          // Only include imageUrl when it's a valid absolute HTTPS URL
          ...(imageUrl?.startsWith('https://') ? { imageUrl } : {}),
        },
        buttons: [
          {
            title: '행사 보기',
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ],
      };

      if (!window.Kakao?.Share) {
        throw new Error('카카오 Share API를 사용할 수 없습니다.');
      }
      window.Kakao.Share.sendDefault(params);
    } catch (err) {
      console.warn('[SocialSharePanel] KakaoTalk 공유 실패:', err);
      // Mark unavailable so the button is hidden; fall back to copy-link
      setKakaoUnavailable(true);
    }
  }, [title, description, imageUrl, shareUrl]);

  // ── Copy Link ──────────────────────────────────────────────────────────────

  const handleCopyLink = useCallback(async () => {
    let success = false;

    // Modern Clipboard API (HTTPS or localhost)
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        success = true;
      } catch {
        // May throw on non-HTTPS or permission denial – fall through to legacy
      }
    }

    // Legacy execCommand fallback
    if (!success) {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        success = true;
      } catch {
        // Nothing more we can do
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [shareUrl]);

  // ── Native Share ───────────────────────────────────────────────────────────

  const hasNativeShare = mounted && typeof navigator !== 'undefined' && !!navigator.share;

  const handleNativeShare = useCallback(async () => {
    if (!hasNativeShare) return;
    try {
      await navigator.share({
        title,
        text: description ?? title,
        url: shareUrl,
      });
    } catch (err) {
      // AbortError = user cancelled – not an error worth surfacing
      if (err instanceof Error && err.name !== 'AbortError') {
        // Unexpected error – silently fall back (copy link is still available)
        console.warn('[SocialSharePanel] navigator.share 실패:', err);
      }
    }
  }, [hasNativeShare, title, description, shareUrl]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="bg-white px-4 pt-4 pb-5" aria-label="공유하기">
      {/* Section heading */}
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
        공유하기
      </h3>

      {/* Share option grid */}
      <div className="flex gap-3">

        {/* ── 1. KakaoTalk ─────────────────────────────────────────────────── */}
        {!kakaoUnavailable && (
          <button
            type="button"
            onClick={handleKakaoShare}
            aria-label="카카오톡으로 공유"
            className="flex flex-col items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl
              bg-[#FEE500] hover:bg-[#F5DA00] active:bg-[#EBD000]
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FEE500] focus-visible:ring-offset-2"
          >
            {/* KakaoTalk speech bubble icon (SVG, no external dependency) */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 5.815 2 10.5c0 2.944 1.716 5.545 4.328 7.125L5.25 21.5l4.59-2.525A11.88 11.88 0 0012 19c5.523 0 10-3.815 10-8.5S17.523 2 12 2z"
                fill="#391B1B"
              />
            </svg>
            <span className="text-xs font-semibold text-[#391B1B]">카카오톡</span>
          </button>
        )}

        {/* ── 2. Copy Link ─────────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCopyLink}
          aria-label={copied ? '링크가 복사되었습니다' : '링크 복사'}
          className={`flex flex-col items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl
            transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
            ${
              copied
                ? 'bg-green-500 focus-visible:ring-green-500'
                : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 focus-visible:ring-gray-400'
            }`}
        >
          {copied ? (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xs font-semibold text-white">복사됨!</span>
            </>
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                  stroke="#374151"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                  stroke="#374151"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-xs font-semibold text-gray-700">링크 복사</span>
            </>
          )}
        </button>

        {/* ── 3. Native Share (Web Share API) ─────────────────────────────── */}
        {hasNativeShare && (
          <button
            type="button"
            onClick={handleNativeShare}
            aria-label="더 많은 공유 옵션"
            className="flex flex-col items-center justify-center gap-1.5 flex-1 py-3.5 rounded-2xl
              bg-gray-100 hover:bg-gray-200 active:bg-gray-300
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="18" cy="5" r="3" stroke="#374151" strokeWidth="2"/>
              <circle cx="6" cy="12" r="3" stroke="#374151" strokeWidth="2"/>
              <circle cx="18" cy="19" r="3" stroke="#374151" strokeWidth="2"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="#374151" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <span className="text-xs font-semibold text-gray-700">더보기</span>
          </button>
        )}

      </div>

      {/* Subtle helper text */}
      <p className="text-xs text-gray-400 text-center mt-3">
        지인에게 이 행사를 알려보세요
      </p>
    </section>
  );
}
