import type { Viewport } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { DeferredGrowthCtaTracking } from "@/components/analytics/DeferredGrowthCtaTracking";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { SessionReplayProvider } from "@/components/analytics/SessionReplayProvider";
import { geistSans } from "@/lib/fonts/appFonts";
import { ROOT_METADATA } from "@/lib/site/rootMetadata";
import "./globals.css";

/** Split heavy client nav from the root layout chunk to avoid dev ChunkLoadError timeouts. */
const GlobalTopNav = dynamic(
  () => import("@/components/nav/GlobalTopNav").then((m) => ({ default: m.GlobalTopNav })),
  { loading: () => null },
);

const ReferralCapture = dynamic(
  () => import("@/components/referrals/ReferralCapture").then((m) => ({ default: m.ReferralCapture })),
  { loading: () => null },
);

/** `metadataBase` must stay `metadataBaseUrl()` — never `new URL(process.env.…)` here (bad prod env → global 500). */
export const metadata = ROOT_METADATA;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      className={`${geistSans.variable} h-full antialiased`}
    >
      <head />
      <body className="min-h-full flex flex-col">
        <SessionReplayProvider />
        <GlobalTopNav />
        {children}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
        <GoogleAnalytics />
        <GoogleTagManager />
        <DeferredGrowthCtaTracking />
      </body>
    </html>
  );
}
