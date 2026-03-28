/**
 * Loading skeleton for the event detail page.
 * Displayed by Next.js while the server component fetches event data from the DB.
 * Mirrors the layout of EventInfoSection + page.tsx so the UI does not shift on hydration.
 *
 * Mobile:  single-column stacked layout (hero → info → map → actions)
 * Desktop: two-column layout matching page.tsx (left: hero + info, right: map + CTA)
 */
export default function EventDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      {/* ── Sticky header – matches page.tsx header ───────────────────────── */}
      {/* pt-safe-top mirrors the same class on page.tsx so the skeleton and the
          real header have identical heights on notched iPhones (Dynamic Island). */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm pt-safe-top">
        {/* Padding and gap match page.tsx header exactly to prevent layout shifts */}
        <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto flex items-center gap-2 px-3 py-1.5 lg:px-6 xl:px-8 2xl:px-12 lg:py-3">
          {/* Back button placeholder – h-11 (44 px) matches min-h-[44px] of real button */}
          <div className="w-14 h-11 bg-gray-200 rounded-lg" />
          {/* Title placeholder */}
          <div className="flex-1 h-5 bg-gray-200 rounded-md max-w-xs" />
          {/* Bookmark button placeholder */}
          <div className="w-8 h-8 bg-gray-200 rounded-lg" />
        </div>
      </header>

      {/* ── Page content – mirrors page.tsx container breakpoints ─────────── */}
      <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl mx-auto lg:px-6 xl:px-8 2xl:px-12 lg:py-8 xl:py-10 2xl:py-14">
        <div className="lg:grid lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px] 2xl:grid-cols-[1fr_500px] lg:gap-6 xl:gap-8 2xl:gap-12 lg:items-start">

          {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
          <div className="min-w-0">
            {/* Hero image skeleton – matches page.tsx hero heights */}
            <div className="w-full h-52 bg-gray-200 lg:h-72 xl:h-80 2xl:h-96 lg:rounded-2xl" />

            {/* Info card wrapper (desktop: single rounded card) */}
            <div className="lg:mt-4 lg:bg-white lg:rounded-2xl lg:shadow-sm lg:overflow-hidden">
              {/* Card 1: name · category · status · description */}
              <div className="px-4 py-5 bg-white mb-2 space-y-3 lg:mb-0 lg:border-b lg:border-gray-100 xl:px-8 xl:py-7 2xl:px-12 2xl:py-10">
                {/* Badges row (category + status + free) */}
                <div className="flex gap-2 flex-wrap">
                  <div className="w-20 h-6 bg-gray-200 rounded-full" />
                  <div className="w-14 h-6 bg-gray-200 rounded-full" />
                  <div className="w-10 h-6 bg-gray-200 rounded-full" />
                </div>
                {/* Event name – xl:h-9 matches xl:text-3xl, 2xl:h-11 matches 2xl:text-4xl */}
                <div className="h-7 bg-gray-200 rounded-md w-3/4 lg:h-8 xl:h-9 2xl:h-11" />
                {/* Description lines */}
                <div className="space-y-2 pt-1">
                  <div className="h-4 bg-gray-200 rounded-md w-full" />
                  <div className="h-4 bg-gray-200 rounded-md w-5/6" />
                  <div className="h-4 bg-gray-200 rounded-md w-2/3" />
                </div>
              </div>

              {/* Card 2: structured event info */}
              <div className="px-4 py-4 bg-white mb-2 space-y-4 lg:mb-0 xl:px-8 xl:py-7 2xl:px-12 2xl:py-10">
                {/* Section heading – xl:h-6 matches xl:text-lg heading */}
                <div className="h-4 bg-gray-200 rounded-md w-16 lg:h-5 xl:h-6 xl:w-20" />

                {/* Date row */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-gray-200 rounded-md flex-shrink-0 lg:w-8 lg:h-8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-gray-200 rounded w-8 lg:h-4" />
                    <div className="h-4 bg-gray-200 rounded w-52 lg:h-5" />
                    <div className="h-4 bg-gray-200 rounded w-44 lg:h-5" />
                  </div>
                </div>

                {/* Location row */}
                <div className="flex items-start gap-3 pt-3">
                  <div className="w-7 h-7 bg-gray-200 rounded-md flex-shrink-0 lg:w-8 lg:h-8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-gray-200 rounded w-8 lg:h-4" />
                    <div className="h-4 bg-gray-200 rounded w-36 lg:h-5" />
                    <div className="h-4 bg-gray-200 rounded w-52 lg:h-5" />
                    <div className="h-3 bg-gray-200 rounded w-28 lg:h-4" />
                  </div>
                </div>

                {/* Organizer row */}
                <div className="flex items-start gap-3 pt-3">
                  <div className="w-7 h-7 bg-gray-200 rounded-md flex-shrink-0 lg:w-8 lg:h-8" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 bg-gray-200 rounded w-8 lg:h-4" />
                    <div className="h-4 bg-gray-200 rounded w-40 lg:h-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile-only: map + action buttons skeleton */}
            <div className="lg:hidden">
              {/* Map skeleton */}
              <div className="px-4 py-4 bg-white border-t border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-16 mb-3" />
                <div className="h-60 bg-gray-200 rounded-xl" />
                <div className="mt-2.5 h-3 bg-gray-200 rounded w-3/4" />
              </div>

              {/* Action buttons skeleton */}
              <div className="px-4 py-4 bg-white space-y-2">
                <div className="w-full h-12 bg-gray-200 rounded-xl" />
                <div className="w-full h-12 bg-gray-200 rounded-xl" />
              </div>

              {/* Social share skeleton */}
              <div className="px-4 pt-4 pb-5 bg-white">
                <div className="h-3 bg-gray-200 rounded w-12 mb-3" />
                <div className="flex gap-3">
                  <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
                  <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
                  <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN (desktop sidebar skeleton) ─────────────────────── */}
          {/* momentum-scroll mirrors page.tsx sidebar: kinetic scroll + overscroll-contain */}
          <div className="hidden lg:flex lg:flex-col lg:gap-4 lg:sticky lg:top-[81px] 2xl:top-[89px] lg:max-h-[calc(100vh-97px)] 2xl:max-h-[calc(100vh-105px)] lg:overflow-y-auto lg:pb-4 momentum-scroll">
            {/* Map skeleton */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-4">
                <div className="h-4 bg-gray-200 rounded w-16 mb-3" />
                <div className="h-60 bg-gray-200 rounded-xl" />
                <div className="mt-2.5 h-3 bg-gray-200 rounded w-3/4" />
              </div>
            </div>

            {/* Action buttons skeleton */}
            <div className="bg-white rounded-2xl shadow-sm px-4 py-4 space-y-2">
              <div className="w-full h-12 bg-gray-200 rounded-xl" />
              <div className="w-full h-12 bg-gray-200 rounded-xl" />
            </div>

            {/* Social share skeleton */}
            <div className="bg-white rounded-2xl shadow-sm px-4 pt-4 pb-5">
              <div className="h-3 bg-gray-200 rounded w-12 mb-3" />
              <div className="flex gap-3">
                <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
                <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
                <div className="flex-1 h-16 bg-gray-200 rounded-2xl" />
              </div>
            </div>

            {/* Back button skeleton */}
            <div className="w-full h-10 bg-gray-200 rounded-2xl" />
          </div>
        </div>
      </div>

      {/* Bottom safe-area spacer */}
      <div className="h-8" />
    </div>
  );
}
