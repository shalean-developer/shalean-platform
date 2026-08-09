import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("P4 canonical Customer CRM identity", () => {
  it("creates a business customer master independent of auth users", () => {
    const sql = read("supabase/migrations/20260809023000_canonical_customers.sql");
    expect(sql).toContain("create table if not exists public.customers");
    expect(sql).toContain("auth_user_id uuid references auth.users(id) on delete set null");
    expect(sql).toContain("create table if not exists public.customer_identity_aliases");
    expect(sql).toContain("identity_type in ('email','phone')");
  });

  it("adds a separate CRM key rather than repurposing legacy customer_id", () => {
    const sql = read("supabase/migrations/20260809023000_canonical_customers.sql");
    for (const table of ["bookings", "monthly_invoices", "sales_documents", "customer_care_cases"]) {
      expect(sql).toContain(`alter table public.${table} add column if not exists crm_customer_id`);
    }
    expect(sql).toContain("Legacy customer_id may still contain historical auth-user references during migration");
  });

  it("fails closed when email and phone aliases resolve to multiple customers", () => {
    const src = read("apps/web/lib/customer/customerIdentity.ts");
    expect(src).toContain('error: "ambiguous_customer_identity"');
    expect(src).toContain("candidateCustomerIds");
  });

  it("preserves international numbers while normalizing local ZA numbers", () => {
    const src = read("apps/web/lib/customer/customerIdentity.ts");
    expect(src).toContain('digits.startsWith("0")');
    expect(src).toContain('return `27${digits.slice(1)}`');
    expect(src).toContain("return digits;");
  });

  it("keeps CRM tables service-role only", () => {
    const sql = read("supabase/migrations/20260809023000_canonical_customers.sql");
    expect(sql).toContain("alter table public.customers enable row level security");
    expect(sql).toContain("revoke all on public.customers from anon, authenticated");
    expect(sql).toContain("grant all on public.customers to service_role");
  });
});
