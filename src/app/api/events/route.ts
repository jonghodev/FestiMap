import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Route Handlers with dynamic query params are always dynamic (not statically cached
// by Next.js framework).  CDN-level caching is handled by the explicit Cache-Control
// response header below, which tells Vercel Edge to serve cached responses for 60 s.
export const dynamic = 'force-dynamic';

// Cache-Control header: edge CDN caches for 60s, browser revalidates up to 5 min stale
const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get('eventType');
    const query = searchParams.get('q');
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const radius = searchParams.get('radius'); // in km

    // Bounding box params for viewport-based loading
    const swLat = searchParams.get('swLat');
    const swLng = searchParams.get('swLng');
    const neLat = searchParams.get('neLat');
    const neLng = searchParams.get('neLng');

    // Build where clause
    const where: Record<string, unknown> = {};

    if (eventType && ['FESTIVAL', 'FLEA_MARKET', 'NIGHT_MARKET'].includes(eventType)) {
      where.eventType = eventType;
    }

    if (query) {
      where.name = {
        contains: query,
      };
    }

    // Bounding box filter: only fetch events within visible map viewport
    if (swLat && swLng && neLat && neLng) {
      const parsedSwLat = parseFloat(swLat);
      const parsedSwLng = parseFloat(swLng);
      const parsedNeLat = parseFloat(neLat);
      const parsedNeLng = parseFloat(neLng);

      if (
        !isNaN(parsedSwLat) && !isNaN(parsedSwLng) &&
        !isNaN(parsedNeLat) && !isNaN(parsedNeLng)
      ) {
        where.latitude = { gte: parsedSwLat, lte: parsedNeLat };
        where.longitude = { gte: parsedSwLng, lte: parsedNeLng };
      }
    }

    const events = await prisma.event.findMany({
      where,
      select: {
        id: true,
        name: true,
        eventType: true,
        latitude: true,
        longitude: true,
        startDate: true,
        endDate: true,
        district: true,
        city: true,
        isFree: true,
        venue: true,
        address: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    // Filter by radius if coordinates provided (applied after bbox for efficiency)
    let filteredEvents = events;
    if (lat && lng && radius) {
      const centerLat = parseFloat(lat);
      const centerLng = parseFloat(lng);
      const radiusKm = parseFloat(radius);

      filteredEvents = events.filter((event) => {
        const dist = getDistanceKm(centerLat, centerLng, event.latitude, event.longitude);
        return dist <= radiusKm;
      });
    }

    return NextResponse.json(
      { events: filteredEvents, total: filteredEvents.length },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('Events API error:', error);
    return NextResponse.json(
      { error: '이벤트 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
