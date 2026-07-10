"use client";

import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";

/** Legacy path — same campaign management hub. */
export default function OfficePromotionsPage() {
  return <CampaignMarketingHub view="campaigns" />;
}
