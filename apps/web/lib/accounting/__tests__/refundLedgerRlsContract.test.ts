import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const migration = fs.readFileSync(
  path.join(repoRoot, "supabase/migrations/20260809204500_refund_accounting_records_rls.sql"),
  "utf8",
);
const recorder = fs.readFileSync(
  path.join(repoRoot, "apps/web/lib/accounting/recordUnifiedRefundAccounting.ts"),
  "utf8",
);
const zohoSync = fs.readFileSync(
  path.join(repoRoot, "apps/web/lib/accounting/syncRefundCreditNoteToZoho.ts"),
  "utf8",
);

describe("refund ledger RLS boundary", () => {
  it("enables RLS and removes browser-role grants", () => {
    expect(migration).toContain("alter table public.refund_accounting_records enable row level security");
    expect(migration).toContain("revoke all on table public.refund_accounting_records from anon, authenticated");
    expect(migration).toContain("grant all on table public.refund_accounting_records to service_role");
  });

  it("keeps refund ledger writers server-only", () => {
    expect(recorder).toContain('import "server-only"');
    expect(zohoSync).toContain('import "server-only"');
    expect(recorder).toContain('.from("refund_accounting_records")');
    expect(zohoSync).toContain('.from("refund_accounting_records")');
  });
});
