"use client";

import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";

/**
 * Compatibility wrapper for public routes that still import SiteFooter.
 * RD-PUBLIC-01 makes the homepage marketing footer the canonical public footer
 * without forcing every page route to change imports in the same slice.
 */
export function SiteFooter({
  stackFloats = false,
  showFloatingWhatsApp = true,
}: {
  stackFloats?: boolean;
  showFloatingWhatsApp?: boolean;
}) {
  return (
    <MarketingHomeFooter
      stackFloats={stackFloats}
      showFloatingWhatsApp={showFloatingWhatsApp}
    />
  );
}
