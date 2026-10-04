import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

const bridgeFiles = [
  "20261004151006_master_00a_office_billing_sync_ignored.sql",
  "20261004151010_master_00a_office_invoices_financial_truth.sql",
  "20261004151013_master_00a_office_invoices_backend_scalability.sql",
  "20261004151017_master_00a_office_invoices_unified_registry.sql",
  "20261004151021_master_00a_quote_conversion_integrity.sql",
  "20261004151025_master_00a_quote_immutable_acceptance.sql",
  "20261004151028_master_00a_quote_public_dedupe.sql",
  "20261004151032_master_00a_quote_follow_up_lifecycle.sql",
];

describe("MASTER-00A migration ledger convergence", () => {
  it("keeps every governed staging ledger bridge represented in the repository", () => {
    for (const filename of bridgeFiles) {
      const sql = readFileSync(
        resolve(root, "supabase/migrations", filename),
        "utf8",
      ).toLowerCase();

      expect(sql).toContain("master-00a staging ledger bridge");
      expect(sql).toContain("intentionally no-op");
      expect(sql).toContain("select 1");
    }
  });

  it("preserves the canonical booking extras quantity map additively", () => {
    const sql = readFileSync(
      resolve(
        root,
        "supabase/migrations/20261004151311_master_00a_preserve_booking_extra_quantities.sql",
      ),
      "utf8",
    ).toLowerCase();

    expect(sql).toContain("add column if not exists extra_quantities");
    expect(sql).toContain("selected_extras remains the backwards-compatible id array");
  });

  it("does not promote the gated recurring prepayment tables through MASTER-00A", () => {
    const combined = bridgeFiles
      .map((filename) =>
        readFileSync(resolve(root, "supabase/migrations", filename), "utf8"),
      )
      .join("\n")
      .toLowerCase();

    expect(combined).not.toContain("create table if not exists public.recurring_prepaid_packages");
    expect(combined).not.toContain("create table if not exists public.recurring_prepaid_allocations");
  });
});
