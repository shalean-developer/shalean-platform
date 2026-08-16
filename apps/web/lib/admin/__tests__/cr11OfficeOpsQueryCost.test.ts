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
});
