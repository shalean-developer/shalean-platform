import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = resolve(__dirname, "../../../..");
const repoRoot = resolve(webRoot, "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("P7 complete sales CRM contract", () => {
  it("keeps opportunity state on sales documents and activities service-role only", () => {
    const migration = read("supabase/migrations/20260810120000_p7_complete_sales_crm.sql");
    expect(migration).toContain("crm_next_follow_up_at");
    expect(migration).toContain("crm_lost_reason");
    expect(migration).toContain("sales_opportunity_activities");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.sales_opportunity_activities from anon, authenticated");
    expect(migration).toContain("set_sales_opportunity_crm");
    expect(migration).toContain("for update");
  });

  it("captures attribution and gates CRM APIs for operational roles", () => {
    const quote = read("apps/web/components/quote/QuoteRequestForm.tsx");
    const route = read("apps/web/app/api/admin/sales-documents/[id]/crm/route.ts");
    expect(quote).toContain("getAcquisitionPayloadFields");
    expect(route).toContain('"invoice.manage", "customer.contact", "marketing.view"');
    expect(route).toContain("lost_reason_required");
    expect(route).toContain('rpc("set_sales_opportunity_crm"');
    expect(route).toContain('["call", "email", "whatsapp"]');
  });
});
