import { prisma } from '@/lib/prisma';
import MapPageClient from '@/components/MapPageClient';
import type { EventType } from '@/types/index';

interface EventData {
  id: string;
  name: string;
  eventType: EventType;
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  district: string | null;
  city: string;
  isFree: boolean;
  venue: string;
  address: string;
  price: string | null;
  imageUrl: string | null;
  description: string | null;
  tags: never[];
}

async function getEvents(): Promise<EventData[]> {
  try {
    const events = await prisma.event.findMany({
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
        price: true,
        imageUrl: true,
        description: true,
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((e) => ({
      ...e,
      eventType: e.eventType as EventType,
      startDate: e.startDate.toISOString(),
      endDate: e.endDate.toISOString(),
      tags: [] as never[],
    }));
  } catch (error) {
    console.error('Failed to fetch events:', error);
    return [];
  }
}

export default async function HomePage() {
  const events = await getEvents();

  return <MapPageClient events={events} />;
}
