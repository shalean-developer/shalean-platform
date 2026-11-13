"use client";

import { usePathname } from "next/navigation";
import { PromotionAnnouncementBar } from "./PromotionAnnouncementBar";
import { PromotionPopup } from "./PromotionPopup";

/** Keep the enquiry form free from promotions and their background requests. */
export function MarketingPromotions() {
  const pathname = usePathname();
  if (pathname === "/quote" || pathname?.startsWith("/quote/")) return null;

  return (
    <>
      <PromotionAnnouncementBar />
      <PromotionPopup />
    </>
  );
}
