import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "FestiMap - 내 주변 축제 지도",
  description: "서울 수도권 축제, 플리마켓, 야시장을 지도에서 한눈에 확인하세요",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",   // iOS safe-area support for notch / home indicator
  themeColor: "#FACC15",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        {/* Prefetch Kakao DNS early so SDK download starts sooner */}
        <link rel="dns-prefetch" href="//dapi.kakao.com" />
        <link rel="preconnect" href="https://dapi.kakao.com" crossOrigin="anonymous" />
        {/* Kakao tile servers */}
        <link rel="dns-prefetch" href="//map.kakao.com" />
        <link rel="dns-prefetch" href="//t1.daumcdn.net" />
        <link rel="dns-prefetch" href="//t2.daumcdn.net" />
        <link rel="dns-prefetch" href="//t3.daumcdn.net" />
      </head>
      <body className="min-h-full flex flex-col bg-white">{children}</body>
    </html>
  );
}
