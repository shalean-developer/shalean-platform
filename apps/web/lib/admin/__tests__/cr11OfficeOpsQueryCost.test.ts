import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CR-11 Office Ops query cost contract", () => {
  it("does not fetch 10,000 raw cron rows for the 30-day booking-engine uptime strip", () => {
    const collector = read("lib/admin/collectOfficeOpsHealthSignals.ts");
    expect(collector).toContain('admin.rpc("office_ops_booking_cron_success_days"');
    expect(collector).toContain('.eq("status", "error")');
    expect(collector).toContain("OFFICE_OPS_CRON_ERROR_LIMIT = 2_000");

    const cronRunsBlock = collector.match(/admin\s*\.from\("cron_runs"\)[\s\S]*?\.limit\(([^)]+)\)/)?.[0] ?? "";
    expect(cronRunsBlock).not.toContain("10000");
  });

  it("aggregates booking-engine successes by Johannesburg day in SQL", () => {
    const migration = read("../../supabase/migrations/20260816034500_cr11_aggregate_office_ops_cron_success_days.sql");
    expect(migration).toContain("office_ops_booking_cron_success_days");
    expect(migration).toContain("at time zone 'Africa/Johannesburg'");
    expect(migration).toContain("group by");
    expect(migration).toContain("'retry-failed-jobs'");
    expect(migration).toContain("grant execute on function public.office_ops_booking_cron_success_days(timestamptz) to service_role");
  });
});
