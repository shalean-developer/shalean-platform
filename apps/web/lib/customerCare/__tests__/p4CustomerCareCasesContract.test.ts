import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8");

describe("P4 Customer Care Case Management", () => {
  it("creates a durable case ledger and append-only timeline", () => {
    const sql = read("supabase/migrations/20260809235000_customer_care_cases.sql");
    expect(sql).toContain("create table if not exists public.customer_care_cases");
    expect(sql).toContain("create table if not exists public.customer_care_case_events");
    expect(sql).toContain("booking_id uuid references public.bookings");
    expect(sql).toContain("refund_accounting_id uuid references public.refund_accounting_records");
    expect(sql).toContain("first_response_due_at");
    expect(sql).toContain("resolution_due_at");
    expect(sql).toContain("resolution_summary");
    expect(sql).toContain("evidence jsonb");
  });

  it("keeps customer-care data service-role only at the database boundary", () => {
    const sql = read("supabase/migrations/20260809235000_customer_care_cases.sql");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("revoke all on public.customer_care_cases from anon, authenticated");
    expect(sql).toContain("grant all on public.customer_care_cases to service_role");
  });

  it("requires an explicit customer-care permission after generic admin auth", () => {
    const listRoute = read("apps/web/app/api/admin/customer-care-cases/route.ts");
    const itemRoute = read("apps/web/app/api/admin/customer-care-cases/[id]/route.ts");
    for (const src of [listRoute, itemRoute]) {
      expect(src).toContain("requireAdminApi");
      expect(src).toContain("admin_has_permission");
      expect(src).toContain('"customer.contact"');
      expect(src).toContain('"incident.manage"');
    }
  });

  it("requires a resolution summary before resolving or closing", () => {
    const route = read("apps/web/app/api/admin/customer-care-cases/[id]/route.ts");
    expect(route).toContain("resolutionSummary is required to resolve or close a case");
    const service = read("apps/web/lib/customerCare/customerCareCases.ts");
    expect(service).toContain('patch.resolved_at = now');
    expect(service).toContain('patch.closed_at = now');
  });

  it("assigns priority-based first-response and resolution SLAs", () => {
    const service = read("apps/web/lib/customerCare/customerCareCases.ts");
    expect(service).toContain('priority === "critical"');
    expect(service).toContain("firstResponse: 1, resolution: 4");
    expect(service).toContain("firstResponse: 4, resolution: 24");
    expect(service).toContain("first_response_due_at");
    expect(service).toContain("resolution_due_at");
  });
});
