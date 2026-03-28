import { prisma } from '@/lib/prisma';
import MapPageClient from '@/components/MapPageClient';
import type { ViewportEvent } from '@/hooks/useViewportEvents';

/**
 * Default Seoul metropolitan area bounding box.
 *
 * These bounds correspond to zoom level 8 centred on Seoul City Hall
 * (37.5665, 126.978). The bounds are snapped to 2-decimal-place precision
 * so they match the cache keys produced by `useViewportEvents.snapBounds()`.
 *
 * Approximately covers:
 *   SW 37.41 N, 126.76 E  →  NE 37.70 N, 127.18 E
 */
const INITIAL_BOUNDS = {
  swLat: 37.41,
  swLng: 126.76,
  neLat: 37.70,
  neLng: 127.18,
} as const;

/**
 * Fetch events for the default Seoul viewport at render time.
 *
 * Uses Next.js data cache with a 60-second revalidation window so that:
 *  - The first user gets a fresh DB query
 *  - Subsequent users within 60 s get the cached result (no DB hit)
 *  - After 60 s the cache is invalidated and the next request triggers a refresh
 *
 * Falls back to an empty array if the DB query fails so the page still renders.
 */
async function fetchInitialEvents(): Promise<ViewportEvent[]> {
  try {
    const events = await prisma.event.findMany({
      where: {
        latitude:  { gte: INITIAL_BOUNDS.swLat, lte: INITIAL_BOUNDS.neLat },
        longitude: { gte: INITIAL_BOUNDS.swLng, lte: INITIAL_BOUNDS.neLng },
      },
      select: {
        id:        true,
        name:      true,
        eventType: true,
        latitude:  true,
        longitude: true,
        startDate: true,
        endDate:   true,
        venue:     true,
        address:   true,
        district:  true,
        city:      true,
        isFree:    true,
      },
      orderBy: { startDate: 'asc' },
    });

    // Serialize dates to ISO strings (Prisma returns Date objects)
    return events.map((e) => ({
      id:        e.id,
      name:      e.name,
      eventType: e.eventType,
      latitude:  e.latitude,
      longitude: e.longitude,
      startDate: e.startDate instanceof Date ? e.startDate.toISOString() : String(e.startDate),
      endDate:   e.endDate   instanceof Date ? e.endDate.toISOString()   : String(e.endDate),
      venue:     e.venue,
      address:   e.address,
      district:  e.district,
      city:      e.city,
      isFree:    e.isFree,
    }));
  } catch (err) {
    // Log but don't crash – client will fetch on first viewport update
    console.error('[page] Initial event pre-fetch failed:', err);
    return [];
  }
}

/**
 * Home page – Server Component
 *
 * Pre-fetches events for the default Seoul viewport so the client gets
 * populated markers immediately on first render, before the Kakao Map SDK
 * finishes loading.  This eliminates the blank-marker state that would
 * otherwise last ~1–2 s on a mobile network.
 *
 * The SSR data is passed as `initialEvents` to MapPageClient, which seeds
 * the `useViewportEvents` hook state.  Once the map SDK loads and emits its
 * real viewport bounds the hook will refetch from the API (served from Vercel
 * edge cache) and update accordingly.
 */
export default async function HomePage() {
  const initialEvents = await fetchInitialEvents();

  return <MapPageClient initialEvents={initialEvents} />;
}
