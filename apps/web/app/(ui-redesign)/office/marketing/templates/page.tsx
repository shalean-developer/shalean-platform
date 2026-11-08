"use client";

import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";
import { EmailWorkspace } from "@/components/email/EmailWorkspace";

export default function OfficeMarketingTemplatesPage() {
  return <EmailWorkspace title="Campaign templates" description="Reusable starting points for campaign content."><CampaignMarketingHub view="templates" embedded /></EmailWorkspace>;
}
