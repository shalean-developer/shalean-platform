import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");
const migration = readFileSync(
  resolve(
    root,
    "supabase/migrations/20261004162436_master_00a_function_source_truth_convergence.sql",
  ),
  "utf8",
).toLowerCase();

describe("MASTER-00A function source-of-truth convergence", () => {
  it.each([
    "populate_daily_analytics_rollups",
    "reserve_cleaning_credit_for_booking",
    "settle_cleaning_credit_for_booking",
    "release_cleaning_credit_for_booking",
    "invoke_nextjs_cron",
    "retry_unassigned_jobs",
  ])("reasserts canonical function %s", (name) => {
    expect(migration).toContain(`create or replace function public.${name}`);
  });

  it("routes retry-failed-jobs through governed cron_http_targets", () => {
    expect(migration).toContain("from public.cron_http_targets");
    expect(migration).toContain("public.invoke_nextjs_cron('/api/cron/retry-failed-jobs')");
    expect(migration).not.toContain("https://your_domain/api/cron/retry-failed-jobs");
    expect(migration).not.toContain("bearer your_cron_secret");
  });

  it("keeps privileged helpers service-role only", () => {
    for (const signature of [
      "public.invoke_nextjs_cron(text)",
      "public.retry_unassigned_jobs()",
      "public.reserve_cleaning_credit_for_booking(uuid,uuid,numeric)",
      "public.settle_cleaning_credit_for_booking(uuid)",
      "public.release_cleaning_credit_for_booking(uuid)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
  });

  it("contains no direct business-row reconciliation dml", () => {
    expect(migration).not.toMatch(/\bupdate\s+public\.bookings\b/);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.bookings\b/);
    expect(migration).not.toMatch(/\binsert\s+into\s+public\.monthly_invoices\b/);
    expect(migration).not.toMatch(/\bupdate\s+public\.sales_documents\b/);
  });
});
