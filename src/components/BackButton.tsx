'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

interface BackButtonProps {
  /** CSS class string applied to the button element */
  className?: string;
  /** Where to navigate if there is no browser history to go back to
   *  (e.g. the user opened the page directly from an external link). */
  fallbackHref?: string;
  children: React.ReactNode;
  'aria-label'?: string;
}

/**
 * BackButton – a back-navigation button that mirrors the native browser/gesture back.
 *
 * Uses `router.back()` (browser history pop) so pressing it does NOT create an
 * additional forward history entry.  This ensures that subsequent native back
 * gestures / swipes return the user to the correct place rather than bouncing
 * them back to the detail page they just left.
 *
 * Fallback: when there is no prior same-origin page in the history stack (e.g.
 * the user opened the detail page directly from a search engine), the button
 * navigates to `fallbackHref` (defaults to the map home page `/`).
 *
 * Usage:
 *   <BackButton fallbackHref="/" className="...">← 뒤로</BackButton>
 */
export default function BackButton({
  className,
  fallbackHref = '/',
  children,
  'aria-label': ariaLabel,
}: BackButtonProps) {
  const router = useRouter();

  const handleClick = useCallback(() => {
    // Check whether there is a meaningful previous page within this app to
    // go back to.  `document.referrer` is set on full-page loads / hard
    // navigations; it is empty when the page was opened as the very first
    // entry of a new tab/session.  Client-side (soft) navigations via
    // Next.js Link keep the referrer of the original hard navigation, so
    // the referrer check is still a reliable proxy for "user arrived here
    // from within FestiMap".
    const hasSameOriginReferrer =
      typeof document !== 'undefined' &&
      typeof window !== 'undefined' &&
      document.referrer.length > 0 &&
      document.referrer.startsWith(window.location.origin);

    // Additionally use history.length as a secondary signal.  A fresh tab
    // opened directly to a detail URL will have length ≤ 1.
    const hasHistory =
      typeof window !== 'undefined' && window.history.length > 1;

    if (hasSameOriginReferrer || hasHistory) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className}
      aria-label={ariaLabel ?? '뒤로 가기'}
    >
      {children}
    </button>
  );
}
