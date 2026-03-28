'use client';

/**
 * ShareButton – Social sharing component for event detail pages.
 *
 * Sharing strategy (priority order):
 *   1. On mobile: Web Share API (navigator.share) → native OS share sheet
 *      which includes KakaoTalk, SMS, Instagram, etc. on Korean phones
 *   2. On desktop / unsupported browsers: expand a mini share panel with:
 *        • Copy link (clipboard, with "복사됨!" toast)
 *        • KakaoTalk share (rendered as a sibling KakaoShareButton)
 *
 * The button label changes state:
 *   공유하기  →  (expanded panel)  →  링크가 복사되었습니다!
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import KakaoShareButton from './KakaoShareButton';

interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  /** Passed to KakaoShareButton for richer link cards */
  description?: string;
  imageUrl?: string;
  /** Optional extra className for the outer wrapper */
  className?: string;
}

export default function ShareButton({
  title,
  text,
  url,
  description,
  imageUrl,
  className = '',
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const shareUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const shareText = text ?? title;

  // Close the panel when clicking outside
  useEffect(() => {
    if (!panelOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [panelOpen]);

  /** Copy shareUrl to clipboard and show a toast */
  const copyToClipboard = useCallback(async () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);

    let success = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      success = true;
    } catch {
      // Legacy execCommand fallback
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
        // silently ignore
      }
    }

    if (success) {
      setCopied(true);
      setPanelOpen(false);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2500);
    }
  }, [shareUrl]);

  const handleShare = useCallback(async () => {
    if (sharing) return;

    // 1st choice: native Web Share API (mobile OS share sheet)
    if (typeof navigator !== 'undefined' && navigator.share) {
      setSharing(true);
      try {
        await navigator.share({ title, text: shareText, url: shareUrl });
      } catch (err) {
        // AbortError = user cancelled; not an error worth surfacing
        if (!(err instanceof Error && err.name === 'AbortError')) {
          // Fallback to panel
          setPanelOpen(true);
        }
      } finally {
        setSharing(false);
      }
      return;
    }

    // 2nd choice: show mini share panel (desktop / unsupported)
    setPanelOpen((prev) => !prev);
  }, [sharing, title, shareText, shareUrl]);

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Main share button */}
      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        aria-label="행사 공유하기"
        aria-expanded={panelOpen}
        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-colors
          ${copied
            ? 'bg-green-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700'
          }
          disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {copied ? (
          <>
            <span aria-hidden="true">✅</span>
            <span>링크가 복사되었습니다!</span>
          </>
        ) : sharing ? (
          <>
            <svg
              className="animate-spin w-4 h-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>공유 중…</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">📤</span>
            <span>공유하기</span>
          </>
        )}
      </button>

      {/* Mini share panel (shown when Web Share API is unavailable) */}
      {panelOpen && (
        <div
          role="menu"
          aria-label="공유 옵션"
          className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">공유하기</span>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="닫기"
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1 rounded-lg hover:bg-gray-100"
            >
              ✕
            </button>
          </div>

          <div className="p-3 space-y-2">
            {/* KakaoTalk share (uses KakaoShareButton internally) */}
            <KakaoShareButton
              title={title}
              description={description}
              imageUrl={imageUrl}
              url={shareUrl}
            />

            {/* Copy link */}
            <button
              type="button"
              onClick={copyToClipboard}
              role="menuitem"
              className="flex items-center justify-center gap-2 w-full py-3 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-semibold text-sm rounded-xl transition-colors"
            >
              <span aria-hidden="true">🔗</span>
              <span>링크 복사</span>
            </button>

            {/* Share via URL bar / other apps */}
            <a
              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="flex items-center justify-center gap-2 w-full py-3 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] font-semibold text-sm rounded-xl transition-colors"
            >
              <span aria-hidden="true">𝕏</span>
              <span>X (트위터)로 공유</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
