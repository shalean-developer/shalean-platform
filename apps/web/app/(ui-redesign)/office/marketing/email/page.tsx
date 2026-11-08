"use client";

import Link from "next/link";
import { EmailDeliveryReadiness } from "@/components/admin/email/EmailDeliveryReadiness";
import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";

export default function OfficeMarketingEmailPage() {
  return <>
    <section className="mx-4 mt-4 rounded-2xl border bg-card p-5 sm:mx-6" aria-labelledby="email-journey-title">
      <h2 id="email-journey-title" className="font-semibold">Email marketing workflow</h2>
      <p className="mt-2 text-sm text-muted-foreground">Create a campaign, review its email draft, confirm customer consent and suppression status, then follow delivery events and reconciliation. A saved draft does not mean an email was sent.</p>
      <EmailDeliveryReadiness />
      <nav className="mt-4 flex flex-wrap gap-3 text-sm font-semibold" aria-label="Email marketing workflow">
        {process.env.NEXT_PUBLIC_SHALEAN_APP_ENV === "staging" && <Link className="rounded-lg border px-4 py-3" href="/office/marketing/email/test">Owner staging tests</Link>}
        <Link className="rounded-lg border px-4 py-3" href="/office/marketing/campaigns">Campaigns</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/lifecycle-emails">Lifecycle emails</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/email-operations">Delivery operations</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/email-operations/retry">Retries and recovery</Link>
      </nav>
    </section>
    <CampaignMarketingHub view="email" />
  </>;
}
