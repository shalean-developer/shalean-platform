"use client";

import Link from "next/link";
import { OwnerInboxReadiness } from "@/components/admin/email/OwnerInboxReadiness";
import { EmailDeliveryReadiness } from "@/components/admin/email/EmailDeliveryReadiness";
import { CampaignMarketingHub } from "@/components/admin/promotions/CampaignMarketingHub";
import { EmailWorkspace } from "@/components/email/EmailWorkspace";
import styles from "@/components/email/email-ui.module.css";

export default function OfficeMarketingEmailPage() {
  return <EmailWorkspace title="Email campaigns" description="Prepare drafts, check consent and follow delivery.">
    <section className={styles.panel} aria-labelledby="email-journey-title">
      <h2 id="email-journey-title" className="font-semibold">Email marketing workflow</h2>
      <p className="mt-2 text-sm text-muted-foreground">Review a campaign draft and customer eligibility before sending. Saving a draft does not send it.</p>
      <EmailDeliveryReadiness />
      <nav className="mt-4 flex flex-wrap gap-3 text-sm font-semibold" aria-label="Email marketing workflow">
        <Link className="rounded-lg border px-4 py-3" href="/office/marketing/campaigns">Campaigns</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/lifecycle-emails">Lifecycle emails</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/email-operations">Delivery operations</Link>
        <Link className="rounded-lg border px-4 py-3" href="/office/email-operations/retry">Retries and recovery</Link>
      </nav>
      {process.env.NEXT_PUBLIC_SHALEAN_APP_ENV === "staging" && <>
        <OwnerInboxReadiness />
        <details className="mt-5 rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Staging diagnostics · synthetic account</summary>
          <p className="mt-2 text-sm text-muted-foreground">These tools check safety and recovery using the reserved synthetic customer. They do not represent your own inbox preferences or send email.</p>
          <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><Link className="underline" href="/office/marketing/email/test">Run synthetic checks</Link><Link className="underline" href="/office/marketing/email/preferences">Synthetic customer preferences</Link></div>
        </details>
      </>}
    </section>
    <CampaignMarketingHub view="email" />
  </EmailWorkspace>;
}
