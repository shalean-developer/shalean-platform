import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { SessionReplayProvider } from "@/components/analytics/SessionReplayProvider";
import { GlobalTopNav } from "@/components/nav/GlobalTopNav";
import { ReferralCapture } from "@/components/referrals/ReferralCapture";
import { metadataBaseUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** `metadataBase` must stay `metadataBaseUrl()` — never `new URL(process.env.…)` here (bad prod env → global 500). */
export const metadata: Metadata = {
  metadataBase: metadataBaseUrl(),
  robots: SEO_INDEX_FOLLOW,
  title: {
    default: "Shalean Cleaning Services",
    template: "%s",
  },
  description: "Book vetted home cleaners across Cape Town with instant pricing and secure online checkout.",
  // Tab + PWA icons: `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` (same-origin; avoids metadataBase pinning icons to production in dev).
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#5A73D8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <GoogleAnalytics />
      </head>
      <body className="min-h-full flex flex-col">
        <GoogleTagManager />
        <SessionReplayProvider />
        <GlobalTopNav />
        {children}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
      </body>
    </html>
  );
}
