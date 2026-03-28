'use client';

import dynamic from 'next/dynamic';

/**
 * Loading skeleton for the venue map section.
 * Matches the visual shape of EventVenueMap so there is no layout shift
 * when the real component swaps in.
 */
function VenueMapSkeleton() {
  return (
    <section className="px-4 py-4 bg-white border-t border-gray-100">
      {/* Section heading placeholder */}
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-4 h-4 bg-gray-200 rounded animate-pulse" />
        <div className="w-16 h-3.5 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Map embed placeholder */}
      <div className="relative h-60 w-full rounded-xl overflow-hidden bg-gray-100 animate-pulse flex items-center justify-center border border-gray-200">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-xs">지도 불러오는 중…</p>
        </div>
      </div>

      {/* Address row placeholder */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="flex-1 h-3 bg-gray-100 rounded animate-pulse" />
        <div className="w-14 h-3 bg-gray-100 rounded animate-pulse" />
      </div>

      {/* Hint text placeholder */}
      <div className="mt-2 mx-auto w-40 h-3 bg-gray-100 rounded animate-pulse" />
    </section>
  );
}

/**
 * Lazily-loaded EventVenueMap for use in the event detail page.
 *
 * The event detail page is a Next.js Server Component, so any client component
 * it imports is included in the page's initial JavaScript bundle — even if the
 * component itself is marked 'use client'.  By wrapping EventVenueMap in a
 * next/dynamic call here we defer the map bundle (Kakao SDK loader, hooks,
 * SVG marker utilities, etc.) until the client hydrates and actually needs to
 * render the map, keeping the initial page payload smaller.
 *
 * Usage: import this file instead of EventVenueMap in server-component pages.
 */
const EventVenueMapClient = dynamic(() => import('./EventVenueMap'), {
  ssr: false,
  loading: () => <VenueMapSkeleton />,
});

export default EventVenueMapClient;
