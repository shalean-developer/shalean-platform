import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Zoho draft monthly invoice reconciliation", () => {
  it("matches only unlinked Shalean drafts against Zoho drafts", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/reconcileMonthlyDraftsWithZoho.ts"),
      "utf8",
    );

    expect(src).toContain('.eq("status", "draft")');
    expect(src).toContain('.is("zoho_invoice_id", null)');
    expect(src).toContain('norm(inv.status) === "draft"');
    expect(src).toContain("!linked.has(String(inv.invoice_id))");
  });

  it("requires exact amount and supports strong reference matching", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/reconcileMonthlyDraftsWithZoho.ts"),
      "utf8",
    );

    expect(src).toContain('formatZohoOrderReference(draft.id, "monthly")');
    expect(src).toContain("cents(inv.total) === draft.total_amount_cents");
    expect(src).toContain('"exact_reference"');
    expect(src).toContain('"customer_amount_month"');
    expect(src).toContain('"ambiguous"');
    expect(src).toContain('"conflict"');
  });

  it("revalidates live Zoho status and amount before linking", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/reconcileMonthlyDraftsWithZoho.ts"),
      "utf8",
    );

    expect(src).toContain("getZohoInvoice(row.candidate_zoho_invoice_id)");
    expect(src).toContain('norm(live.status) !== "draft"');
    expect(src).toContain("Math.round(live.totalCents) !== row.amount_cents");
    expect(src).toContain("zohoIdStillUnlinked");
  });

  it("records the link locally without sending customer email or changing Zoho", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/reconcileMonthlyDraftsWithZoho.ts"),
      "utf8",
    );

    expect(src).toContain('"zoho_draft_linked"');
    expect(src).toContain("customer_email_sent: false");
    expect(src).toContain("upsertInvoiceSyncMetadata");
    expect(src).not.toContain("sendMonthlyInvoiceEmail");
    expect(src).not.toContain("safeResendSend");
    expect(src).not.toContain("zohoBooksClient.put");
    expect(src).not.toContain("zohoBooksClient.post");
  });

  it("requires explicit confirmation for apply mode", () => {
    const route = readFileSync(
      join(root, "app/api/admin/invoices/draft-zoho-match/route.ts"),
      "utf8",
    );

    expect(route).toContain('"LINK_EXACT_DRAFTS"');
    expect(route).toContain('reconcileMonthlyDraftsWithZoho(admin, "dry_run")');
    expect(route).toContain('reconcileMonthlyDraftsWithZoho(admin, "apply")');
  });
});
