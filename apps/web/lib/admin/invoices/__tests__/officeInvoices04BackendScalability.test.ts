import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("OFFICE-INVOICES-04 backend scalability", () => {
  it("uses one SQL RPC instead of a 500-row monthly_invoices scan", () => {
    const src = readFileSync(
      join(root, "lib/admin/invoices/loadAdminInvoiceList.ts"),
      "utf8",
    );

    expect(src).toContain('admin.rpc("admin_monthly_invoice_list_v1"');
    expect(src).not.toContain('.from("monthly_invoices")');
    expect(src).not.toContain(".limit(500)");
    expect(src).not.toContain("rows = rows.filter");
  });

  it("delegates search, filters, KPI summaries, and calendar-month pagination to SQL", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001193000_office_invoices_04_backend_scalability.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("p_search text");
    expect(sql).toContain("p_status text");
    expect(sql).toContain("p_balance_gt0 boolean");
    expect(sql).toContain("p_has_discount_lines boolean");
    expect(sql).toContain("p_has_missed_visit_lines boolean");
    expect(sql).toContain("dense_rank() over (order by f.month desc)");
    expect(sql).toContain("'collectible_outstanding_cents'");
    expect(sql).toContain("'draft_forecast_cents'");
    expect(sql).toContain("'total_outstanding_cents'");
  });

  it("keeps the RPC service-role only", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001193000_office_invoices_04_backend_scalability.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("security definer");
    expect(sql).toContain("revoke all on function public.admin_monthly_invoice_list_v1");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
  });

  it("keeps unpaginated export supported by p_paginate=false", () => {
    const loader = readFileSync(
      join(root, "lib/admin/invoices/loadAdminInvoiceList.ts"),
      "utf8",
    );
    const route = readFileSync(
      join(root, "app/api/admin/invoices/route.ts"),
      "utf8",
    );

    expect(loader).toContain("p_paginate: paginate");
    expect(route).toContain('const pageParam = searchParams.get("page")');
    expect(route).toContain("page != null");
  });
});
