"use client";

import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";
import { EmailWorkspace } from "@/components/email/EmailWorkspace";

export default function OfficeMarketingCampaignsPage() {
  return <EmailWorkspace title="Campaigns" description="Plan your campaigns and prepare customer email content."><CampaignMarketingHub view="campaigns" embedded /></EmailWorkspace>;
}
