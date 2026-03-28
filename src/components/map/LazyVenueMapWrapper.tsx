'use client';

import { useEffect, useRef, useState } from 'react';
import EventVenueMapClient from './EventVenueMapClient';

/**
 * Props mirror EventVenueMap / EventVenueMapClient exactly.
 * Kept inline here to avoid a runtime import of EventVenueMap just for the type.
 */
interface VenueMapProps {
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
 * Static placeholder shown while the map section is outside the viewport.
 * Matches the approximate height of EventVenueMap to avoid layout shift when
 * the real map swaps in.
 */
function VenueMapIntersectionPlaceholder() {
  return (
    <section className="px-4 py-4 bg-white border-t border-gray-100">
      {/* Section heading placeholder */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-4 h-4 bg-gray-100 rounded" />
        <div className="w-10 h-3.5 bg-gray-100 rounded" />
      </div>
      {/* Map area placeholder – same height as the real map embed */}
      <div className="h-60 w-full rounded-xl bg-gray-50 border border-gray-200" />
      {/* Address row placeholder */}
      <div className="mt-2.5 h-3 bg-gray-50 rounded w-3/4" />
    </section>
  );
}

/**
 * LazyVenueMapWrapper
 *
 * Wraps EventVenueMapClient with an IntersectionObserver that defers the
 * render (and therefore the Kakao SDK initialisation) until the map section
 * is about to enter the viewport.
 *
 * ## Why this matters
 *
 * On the event detail page the venue map sits below the event header, hero
 * image, and info section.  Without this wrapper, the Kakao SDK would be
 * initialised immediately on page load – even when the user has not yet
 * scrolled to the map.  Kakao SDK initialisation involves:
 *
 *   1. Downloading and parsing the SDK script (~140 kB gzip)
 *   2. Creating internal canvas / tile-loading contexts
 *   3. Inserting map DOM nodes and registering event listeners
 *
 * All of these operations compete with the critical rendering path and slow
 * down Time-to-Interactive on mobile devices.
 *
 * ## How it works
 *
 * A sentinel `<div>` is rendered in place of the map.  An IntersectionObserver
 * watches the sentinel with a 200 px `rootMargin` so the real component begins
 * loading 200 px before it becomes visible – giving the Kakao SDK enough time
 * to download without any perceptible delay once the user actually scrolls down.
 *
 * Once the threshold is crossed the observer disconnects and the sentinel is
 * replaced by `<EventVenueMapClient>`, which in turn triggers the dynamic
 * import of `EventVenueMap` (already prefetched in the background thanks to
 * `webpackPrefetch: true` inside EventVenueMapClient.tsx).
 *
 * ## Fallback
 *
 * If `IntersectionObserver` is not available (extremely old browsers) the map
 * renders immediately so the user experience degrades gracefully.
 */
export default function LazyVenueMapWrapper(props: VenueMapProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    // Graceful degradation: render immediately if the API is unavailable
    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const el = sentinelRef.current;
    if (!el) {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      {
        // Start loading 200 px before the sentinel enters the viewport so the
        // Kakao SDK has time to initialise before the section is actually visible.
        rootMargin: '200px',
      }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!shouldRender) {
    return (
      <div ref={sentinelRef}>
        <VenueMapIntersectionPlaceholder />
      </div>
    );
  }

  return <EventVenueMapClient {...props} />;
}
