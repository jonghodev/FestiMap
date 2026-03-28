'use client';

/**
 * KakaoShareButton – KakaoTalk native sharing component.
 *
 * Uses the Kakao JavaScript SDK (Share API) to trigger the native
 * KakaoTalk share dialog.  The same JavaScript App Key used for
 * Kakao Maps is reused here.
 *
 * SDK loading strategy:
 *   - Lazily injects <script> on first user interaction (not page load)
 *   - Uses singleton promise to avoid double-loading
 *   - Gracefully degrades to a hidden button when appKey is missing
 *
 * Reference: https://developers.kakao.com/docs/latest/ko/message/js-link
 */

import { useState, useCallback, useRef } from 'react';

// Minimal type declarations for the Kakao Share SDK
declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: {
        sendDefault: (options: KakaoShareOptions) => void;
      };
    };
  }
}

interface KakaoShareOptions {
  objectType: 'feed';
  content: {
    title: string;
    description?: string;
    imageUrl?: string;
    link: {
      mobileWebUrl: string;
      webUrl: string;
    };
  };
  buttons?: Array<{
    title: string;
    link: {
      mobileWebUrl: string;
      webUrl: string;
    };
  }>;
}

interface KakaoShareButtonProps {
  title: string;
  description?: string;
  imageUrl?: string;
  /** The URL to share.  Defaults to the current page URL. */
  url?: string;
  className?: string;
}

// Singleton SDK load promise
let sdkLoadPromise: Promise<void> | null = null;

/**
 * Lazily loads the Kakao JS SDK and initializes it with the app key.
 * Resolves when the SDK is ready for use.
 */
function loadKakaoSDK(appKey: string): Promise<void> {
  if (typeof window !== 'undefined' && window.Kakao?.isInitialized()) {
    return Promise.resolve();
  }

  if (sdkLoadPromise) return sdkLoadPromise;

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경에서만 사용할 수 있습니다.'));
      return;
    }

    // Check if already present (e.g. Maps SDK shares the same window.Kakao)
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        window.Kakao.init(appKey);
      }
      resolve();
      return;
    }

    const script = document.createElement('script');
    // Kakao SDK v2 – includes Share functionality
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    script.crossOrigin = 'anonymous';
    script.async = true;

    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(appKey);
      }
      resolve();
    };

    script.onerror = () => {
      sdkLoadPromise = null;
      reject(new Error('카카오 SDK 로드 실패'));
    };

    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

export default function KakaoShareButton({
  title,
  description,
  imageUrl,
  url,
  className = '',
}: KakaoShareButtonProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleShare = useCallback(async () => {
    if (!appKey || loading) return;

    // Clear previous error state
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(false);
    setLoading(true);

    try {
      await loadKakaoSDK(appKey);

      const shareUrl = url ?? window.location.href;

      if (!window.Kakao?.Share) {
        throw new Error('카카오 Share API를 사용할 수 없습니다.');
      }

      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title,
          ...(description ? { description } : {}),
          ...(imageUrl ? { imageUrl } : {}),
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl,
          },
        },
        buttons: [
          {
            title: '자세히 보기',
            link: {
              mobileWebUrl: shareUrl,
              webUrl: shareUrl,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('카카오톡 공유 실패:', err);
      setError(true);
      errorTimerRef.current = setTimeout(() => setError(false), 3000);
    } finally {
      setLoading(false);
    }
  }, [appKey, loading, title, description, imageUrl, url]);

  // Hide button entirely when the Kakao app key is not configured
  if (!appKey) return null;

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={loading}
      aria-label="카카오톡으로 공유하기"
      className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-colors
        ${error
          ? 'bg-red-50 text-red-600 border border-red-200'
          : 'bg-[#FEE500] hover:bg-[#F5DC00] active:bg-[#EDD100] text-[#3C1E1E]'
        }
        disabled:opacity-60 disabled:cursor-not-allowed
        ${className}`}
    >
      {loading ? (
        <>
          {/* Spinner */}
          <svg
            className="animate-spin w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          <span>불러오는 중…</span>
        </>
      ) : error ? (
        <>
          <span aria-hidden="true">⚠️</span>
          <span>공유 실패 – 다시 시도해주세요</span>
        </>
      ) : (
        <>
          {/* KakaoTalk bubble icon (SVG) */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3C6.477 3 2 6.701 2 11.25c0 2.878 1.736 5.41 4.375 6.938L5.25 21l4.063-2.063C10.086 19.28 11.03 19.5 12 19.5c5.523 0 10-3.701 10-8.25S17.523 3 12 3z" />
          </svg>
          <span>카카오톡으로 공유</span>
        </>
      )}
    </button>
  );
}
