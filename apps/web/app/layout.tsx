import type { Viewport } from "next";
import { Suspense } from "react";
import { DeferredGrowthCtaTracking } from "@/components/analytics/DeferredGrowthCtaTracking";
import { GoogleAnalytics } from "@/components/analytics/GoogleAnalytics";
import { GoogleTagManager } from "@/components/analytics/GoogleTagManager";
import { SessionReplayProvider } from "@/components/analytics/SessionReplayProvider";
import { GlobalTopNav } from "@/components/nav/GlobalTopNav";
import { ReferralCapture } from "@/components/referrals/ReferralCapture";
import { geistSans } from "@/lib/fonts/appFonts";
import { ROOT_METADATA } from "@/lib/site/rootMetadata";
import "./globals.css";

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
