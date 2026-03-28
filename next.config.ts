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
      // Security header for all routes
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
      // Long-lived cache for Next.js static chunks (_next/static/*).
      // These files are content-hashed so they can be cached indefinitely.
      // The browser serves them from cache on repeat visits, which cuts tile
      // and SDK asset round-trips significantly.
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // PWA manifest – short-lived so updates are picked up quickly
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
