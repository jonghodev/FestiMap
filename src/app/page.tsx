import MapPageClient from '@/components/MapPageClient';

/**
 * Home page
 *
 * Renders the map shell immediately (no server-side data fetch).
 * Event markers are loaded client-side based on the visible viewport via
 * the useViewportEvents hook, so only the markers currently on screen are
 * fetched – not the entire database.
 */
export default function HomePage() {
  return <MapPageClient />;
}
