import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..", "..", "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..", "..");

function read(rel: string): string {
  return readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

const migration = read("supabase/migrations/20260812065000_p0_01_harden_finance_rls.sql");

describe("P0-01 finance RLS hardening contract", () => {
  it("enables RLS on both internal finance tables", () => {
    expect(migration).toContain(
      "alter table public.refund_accounting_records enable row level security",
    );
    expect(migration).toContain(
      "alter table public.customer_monthly_billing_terms enable row level security",
    );
  });

  it("revokes direct client privileges, including operations RLS does not cover", () => {
    expect(migration).toContain(
      "revoke all privileges on table public.refund_accounting_records from anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all privileges on table public.customer_monthly_billing_terms from anon, authenticated",
    );
  });

  it("keeps explicit deny policies for anon and authenticated roles", () => {
    expect(migration).toContain("refund_accounting_records_client_deny");
    expect(migration).toContain("customer_monthly_billing_terms_client_deny");
    expect(migration.match(/to anon, authenticated/g)?.length).toBe(2);
    expect(migration.match(/using \(false\)/g)?.length).toBe(2);
    expect(migration.match(/with check \(false\)/g)?.length).toBe(2);
  });

  it("keeps refund accounting on the server-side admin client", () => {
    const source = read("apps/web/lib/accounting/recordUnifiedRefundAccounting.ts");
    expect(source).toContain('import "server-only"');
    expect(source).toContain("recordUnifiedRefundAccounting(\n  admin: SupabaseClient");
    expect(source).toContain('admin\n    .from("refund_accounting_records")');
  });
});
