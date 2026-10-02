import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-02 immutable accepted quote truth", () => {
  it("records an immutable snapshot before quote status becomes accepted", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const snapshotIndex = src.indexOf("recordSalesQuoteAcceptanceSnapshot");
    const acceptIndex = src.indexOf('.update({ status: "accepted" })', snapshotIndex);

    expect(snapshotIndex).toBeGreaterThanOrEqual(0);
    expect(acceptIndex).toBeGreaterThan(snapshotIndex);
    expect(src).toContain("if (!snapshot.ok) return snapshot");
  });

  it("covers the public existing-invoice acceptance retry path", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    expect(src).toContain("recordSalesQuoteAcceptanceSnapshot");
    const snapshotIndex = src.indexOf("recordSalesQuoteAcceptanceSnapshot");
    const acceptIndex = src.indexOf('.update({ status: "accepted" })', snapshotIndex);
    expect(acceptIndex).toBeGreaterThan(snapshotIndex);
  });

  it("freezes accepted quotes in application editability rules", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/types.ts"),
      "utf8",
    );

    expect(src).toContain('params.document_type === "quote" && st === "accepted"');
  });

  it("creates one immutable acceptance record per quote and invoice", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261002110500_quote_e2e_02_immutable_acceptance.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create table if not exists public.sales_quote_acceptance_snapshots");
    expect(sql).toContain("unique (quote_id)");
    expect(sql).toContain("unique (invoice_id)");
    expect(sql).toContain("prevent_sales_quote_acceptance_snapshot_mutation");
    expect(sql).toContain("accepted quote requires immutable acceptance snapshot");
    expect(sql).toContain("accepted quote terms are immutable");
  });

  it("does not fabricate snapshots for legacy already-accepted quotes", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/recordSalesQuoteAcceptanceSnapshot.ts"),
      "utf8",
    );

    expect(src).toContain('"legacy_accepted_quote_missing_snapshot"');
    expect(src).toContain('"acceptance_snapshot_invoice_mismatch"');
    expect(src).toContain("source_quote_updated_at");
  });

  it("shows verified snapshots and labels legacy accepted quotes in Office", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/[id]/page.tsx"),
      "utf8",
    );
    const route = readFileSync(
      join(root, "app/api/admin/sales-documents/[id]/route.ts"),
      "utf8",
    );

    expect(route).toContain("sales_quote_acceptance_snapshots");
    expect(page).toContain("Accepted quote snapshot");
    expect(page).toContain("Legacy accepted quote");
    expect(page).toContain("Current quote data must not be treated as a verified historical acceptance record.");
  });

  it("does not expose send/convert actions for accepted quotes", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/[id]/page.tsx"),
      "utf8",
    );

    expect(page).toContain('!(doc.document_type === "quote" && doc.status === "accepted")');
    expect(page).toContain('doc.status === "draft" || doc.status === "sent"');
  });
});
