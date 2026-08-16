import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CR-11 Office Ops query cost contract", () => {
  it("uses a daily aggregate for normal 30-day cron history and keeps the raw 10k path fallback-only", () => {
    const collector = read("lib/admin/collectOfficeOpsHealthSignals.ts");
    expect(collector).toContain('admin.rpc("office_ops_booking_cron_daily_status"');
    expect(collector).toContain('.eq("status", "error")');
    expect(collector).toContain("OFFICE_OPS_CRON_ERROR_LIMIT = 2_000");
    expect(collector).toContain("OFFICE_OPS_CRON_FALLBACK_LIMIT = 10_000");
    expect(collector).toContain("if (bookingCronDailyStatusRes.error)");
    expect(collector).toContain("formatIsoInJohannesburgYmd");
    expect(collector).toContain("representedErrorDays");
  });

  it("aggregates booking-engine success and error presence by Johannesburg day in SQL", () => {
    const migration = read("../../supabase/migrations/20260816034500_cr11_aggregate_office_ops_cron_success_days.sql");
    expect(migration).toContain("office_ops_booking_cron_daily_status");
    expect(migration).toContain("at time zone 'Africa/Johannesburg'");
    expect(migration).toContain("in ('success', 'error')");
    expect(migration).toContain("group by");
    expect(migration).toContain("'retry-failed-jobs'");
    expect(migration).toContain("grant execute on function public.office_ops_booking_cron_daily_status(timestamptz) to service_role");
  });

  it("uses a server-side Office Notifications rollup on the normal path", () => {
    const route = read("app/api/admin/office-notifications/route.ts");
    expect(route).toContain('admin.rpc("office_notifications_dashboard_rollup"');
    expect(route).toContain("Additive migration rollout safety");
    expect(route).toContain("ROLLUP_FALLBACK_TODAY_LIMIT = 20_000");
    expect(route).toContain("ROLLUP_FALLBACK_CUSTOMER_LIMIT = 10_000");
  });

  it("aggregates notification counters and unique customers in SQL", () => {
    const migration = read("../../supabase/migrations/20260816080000_cr11b_office_notification_dashboard_rollup.sql");
    expect(migration).toContain("office_notifications_dashboard_rollup");
    expect(migration).toContain("count(distinct lower(trim(b.customer_email)))");
    expect(migration).toContain("count(*) filter");
    expect(migration).toContain("grant execute on function public.office_notifications_dashboard_rollup(timestamptz) to service_role");
  });

  it("uses one cached booking trust rollup on the normal public booking path", () => {
    const route = read("app/api/booking/trust-stats/route.ts");
    expect(route).toContain('admin.rpc("booking_trust_stats_rollup"');
    expect(route).toContain("s-maxage=300");
    expect(route).toContain("ROLLUP_FALLBACK_TODAY_LIMIT = 1_000");
    expect(route).toContain("ROLLUP_FALLBACK_WEEK_LIMIT = 5_000");
    expect(route).toContain("isMissingRollupRpcError");
  });

  it("aggregates booking trust counters in SQL", () => {
    const migration = read("../../supabase/migrations/20260816083000_cr11c_booking_trust_stats_rollup.sql");
    expect(migration).toContain("booking_trust_stats_rollup");
    expect(migration).toContain("count(*) filter");
    expect(migration).toContain("completed_this_week");
    expect(migration).toContain("grant execute on function public.booking_trust_stats_rollup(timestamptz, timestamptz) to service_role");
  });
});
