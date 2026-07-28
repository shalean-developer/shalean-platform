import type { Viewport } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { AppNotificationProviders } from "@/components/ui/notifications/AppNotificationProviders";
import { DeferredGrowthCtaTracking } from "@/components/analytics/DeferredGrowthCtaTracking";
import { Ga4RouteGuard } from "@/components/analytics/Ga4RouteGuard";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GoogleAds } from "@/components/analytics/GoogleAds";
import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { MetaPixel } from "@/components/analytics/MetaPixel";
import { SessionReplayProvider } from "@/components/analytics/SessionReplayProvider";
import { NonProductionBanner } from "@/components/env/NonProductionBanner";
import { GlobalTopNav } from "@/components/nav/GlobalTopNav";
import { geistSans } from "@/lib/fonts/appFonts";
import { ROOT_METADATA } from "@/lib/site/rootMetadata";
import "./globals.css";

/**
 * Static import (not `dynamic`) so the above-the-fold header renders in the initial HTML and stays
 * mounted through hydration. A lazy `loading: () => null` fallback briefly unmounts the header on the
 * client, which shoves `<main>` up then back down ~152px — the ~0.12 CLS seen on all nav pages.
 */
const ReferralCapture = dynamic(
  () => import("@/components/referrals/ReferralCapture").then((m) => ({ default: m.ReferralCapture })),
  { loading: () => null },
);

/** `metadataBase` must stay `metadataBaseUrl()` — never `new URL(process.env.…)` here (bad prod env → global 500). */
export const metadata = ROOT_METADATA;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <AppNotificationProviders>
          <NonProductionBanner />
          <SessionReplayProvider />
          <GlobalTopNav />
          {children}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
        <Ga4RouteGuard />
        <GoogleAnalytics />
        <GoogleAds />
        <GoogleTagManager />
        <MetaPixel />
          <DeferredGrowthCtaTracking />
        </AppNotificationProviders>
      </body>
    </html>
  );
}
