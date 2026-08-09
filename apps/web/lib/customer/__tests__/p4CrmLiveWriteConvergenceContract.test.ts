import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("P4 canonical CRM live-write convergence", () => {
  const root = resolve(process.cwd(), "../..");
  const migration = readFileSync(
    resolve(root, "supabase/migrations/20260809083000_crm_customer_write_convergence.sql"),
    "utf8",
  );
  const loader = readFileSync(resolve(process.cwd(), "lib/admin/loadAdminCustomersList.ts"), "utf8");

  it("installs convergence triggers on all customer-owned finance/ops entities", () => {
    expect(migration).toContain("bookings_crm_customer_convergence");
    expect(migration).toContain("monthly_invoices_crm_customer_convergence");
    expect(migration).toContain("sales_documents_crm_customer_convergence");
    expect(migration).toContain("customer_care_cases_crm_customer_convergence");
    expect(migration).toContain("resolve_crm_customer_for_write");
  });

  it("fails closed when an email or phone alias maps to multiple CRM customers", () => {
    expect(migration).toMatch(/if v_count > 1 then\s+return null;/);
  });

  it("makes Office Customers read identity and booking facts from the CRM source of truth", () => {
    expect(loader).toContain('.from("customers")');
    expect(loader).toContain('crm_customer_id');
    expect(loader).toContain('.not("crm_customer_id", "is", null)');
    expect(loader).not.toContain('loadAllCustomerProfiles');
  });
});
