import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from Kakao CDN
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.kakaocdn.net",
      },
      {
        protocol: "https",
        hostname: "*.kakao.com",
      },
    ],
  },

  async headers() {
    return [
      // ── Security + preconnect hints for all routes ───────────────────────
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Preconnect to Kakao CDNs so map tiles and the SDK load faster.
          // The browser starts the TCP+TLS handshake before the Kakao SDK
          // even requests its first tile, saving ~100–300 ms on mobile networks.
          {
            key: "Link",
            value: [
              "<https://dapi.kakao.com>; rel=preconnect",
              "<https://map.kakaocdn.net>; rel=preconnect",
              "<https://t1.kakaocdn.net>; rel=preconnect",
            ].join(", "),
          },
        ],
      },

      // ── Events API: edge-cacheable (60 s), stale-while-revalidate 5 min ──
      // Vercel edge nodes cache responses keyed by the full query string
      // (swLat, swLng, neLat, neLng, eventType, q), so identical viewport
      // requests never hit the database.
      {
        source: "/api/events",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },

      // ── Next.js static chunks: content-hashed, cache forever ────────────
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      // ── PWA manifest: short-lived so updates propagate quickly ───────────
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
