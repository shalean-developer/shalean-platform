"use client";

import dynamic from "next/dynamic";

const MarketingHomeStickyCta = dynamic(
  () =>
    import("@/components/marketing-home/MarketingHomeStickyCta").then((m) => ({
      default: m.MarketingHomeStickyCta,
    })),
  { ssr: false },
);

/** Client shell — lazy-loads the sticky mobile bar after hydration. */
export function MarketingHomeStickyCtaClient() {
  return <MarketingHomeStickyCta />;
}
