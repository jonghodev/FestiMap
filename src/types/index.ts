export type EventType = "FESTIVAL" | "FLEA_MARKET" | "NIGHT_MARKET";

export interface EventSummary {
  id: string;
  name: string;
  eventType: EventType;
  startDate: string;
  endDate: string;
  venue: string;
  address: string;
  latitude: number;
  longitude: number;
  district?: string | null;
  city: string;
  imageUrl?: string | null;
  isFree: boolean;
  price?: string | null;
  tags: string[];
}

export interface EventDetail extends EventSummary {
  description?: string | null;
  sourceUrl?: string | null;
  organizer?: string | null;
}

export interface UserSession {
  userId: string;
  email: string;
  name?: string | null;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  FESTIVAL: "축제",
  FLEA_MARKET: "플리마켓",
  NIGHT_MARKET: "야시장",
};
