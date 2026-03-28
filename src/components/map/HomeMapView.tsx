'use client';

import { useRouter } from 'next/navigation';
import MapContainer from './MapContainer';
import type { MapMarker } from './KakaoMap';

export interface EventMapData {
  id: string;
  name: string;
  eventType: string;
  latitude: number;
  longitude: number;
  venue: string;
  isFree: boolean;
  district?: string | null;
}

interface HomeMapViewProps {
  events: EventMapData[];
}

/**
 * HomeMapView — client component wrapping the map with navigation.
 *
 * Accepts serialisable event data from the server component (page.tsx)
 * and attaches router.push click handlers to each marker.
 */
export default function HomeMapView({ events }: HomeMapViewProps) {
  const router = useRouter();

  const markers: MapMarker[] = events.map((event) => ({
    id: event.id,
    lat: event.latitude,
    lng: event.longitude,
    title: event.name,
    onClick: (id: string) => {
      router.push(`/events/${id}`);
    },
  }));

  return (
    <MapContainer
      lat={37.5665}
      lng={126.978}
      level={8}
      markers={markers}
      className="w-full h-full"
    />
  );
}
