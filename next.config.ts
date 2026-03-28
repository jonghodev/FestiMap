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

  // Custom headers for Kakao Map SDK Content Security Policy
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
