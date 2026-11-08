"use client";

import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";

import { EmailWorkspace } from "@/components/email/EmailWorkspace";

export default function OfficeMarketingEmailPage() {
  return <EmailWorkspace title="Email campaigns" description="Prepare drafts and follow delivery."><CampaignMarketingHub view="email" /></EmailWorkspace>;
}
