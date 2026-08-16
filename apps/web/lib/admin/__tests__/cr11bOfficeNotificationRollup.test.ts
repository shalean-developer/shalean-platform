import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CR-11B Office Notifications query cost contract", () => {
  it("uses the dashboard rollup on the normal path and keeps oversized reads fallback-only", () => {
    const route = read("app/api/admin/office-notifications/route.ts");
    expect(route).toContain('admin.rpc("office_notifications_dashboard_rollup"');
    expect(route).toContain("Additive migration rollout safety");
    expect(route).toContain("ROLLUP_FALLBACK_TODAY_LIMIT = 20_000");
    expect(route).toContain("ROLLUP_FALLBACK_CUSTOMER_LIMIT = 10_000");
    expect(route.indexOf('admin.rpc("office_notifications_dashboard_rollup"')).toBeLessThan(
      route.indexOf("ROLLUP_FALLBACK_TODAY_LIMIT"),
    );
  });

  it("aggregates notification channel counters and distinct customers in SQL", () => {
    const migration = read("../../supabase/migrations/20260816080000_cr11b_office_notification_dashboard_rollup.sql");
    expect(migration).toContain("office_notifications_dashboard_rollup");
    expect(migration).toContain("count(distinct lower(trim(b.customer_email)))");
    expect(migration).toContain("count(*) filter");
    expect(migration).toContain("grant execute on function public.office_notifications_dashboard_rollup(timestamptz) to service_role");
  });
});
