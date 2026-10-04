import { describe, expect, it } from "vitest";

import { billingDocumentNeedsZohoSync } from "@/lib/admin/billing/loadAdminBillingDocuments";
import { billingDocumentCanManualSync } from "@/lib/admin/billing/syncBillingDocumentToZoho";

describe("Zoho sync actionability", () => {
  it("excludes a held positive document from Needs sync", () => {
    expect(
      billingDocumentNeedsZohoSync({
        zoho_linked: false,
        amount_cents: 37000,
        status: "draft",
        sync_eligible: false,
      }),
    ).toBe(false);
  });

  it("includes an actionable positive document missing Zoho", () => {
    expect(
      billingDocumentNeedsZohoSync({
        zoho_linked: false,
        amount_cents: 102500,
        status: "sent",
        sync_eligible: true,
      }),
    ).toBe(true);
  });

  it("server-side manual sync rejects a held document", () => {
    expect(
      billingDocumentCanManualSync({
        kind: "monthly_invoice",
        zoho_linked: false,
        amount_cents: 950000,
        status: "draft",
        sync_eligible: false,
      }),
    ).toBe(false);
  });

  it("never treats requested or zero-value documents as actionable", () => {
    expect(
      billingDocumentNeedsZohoSync({
        zoho_linked: false,
        amount_cents: 10000,
        status: "requested",
        sync_eligible: true,
      }),
    ).toBe(false);
    expect(
      billingDocumentNeedsZohoSync({
        zoho_linked: false,
        amount_cents: 0,
        status: "sent",
        sync_eligible: true,
      }),
    ).toBe(false);
  });
});
