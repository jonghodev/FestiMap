export type EventType = 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

export interface EventSummary {
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
}

export interface EventDetail extends EventSummary {
  description: string | null;
  venue: string;
  address: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  price: string | null;
  organizer: string | null;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  FESTIVAL: '축제',
  FLEA_MARKET: '플리마켓',
  NIGHT_MARKET: '야시장',
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  FESTIVAL: '#FF6B6B',
  FLEA_MARKET: '#4ECDC4',
  NIGHT_MARKET: '#45B7D1',
};
