import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CR-16 system log retention", () => {
  it("uses a bounded batch RPC instead of the monolithic prune function", () => {
    const route = read("app/api/cron/prune-system-logs/route.ts");
    expect(route).toContain('admin.rpc("prune_system_logs_batch"');
    expect(route).toContain("DEFAULT_BATCH_SIZE = 5_000");
    expect(route).toContain("DEFAULT_MAX_BATCHES = 10");
    expect(route).not.toContain('admin.rpc("prune_system_logs"');
  });

  it("creates an indexed bounded delete and runs retention daily", () => {
    const sql = read("../../supabase/migrations/20260816023000_cr16_batch_system_log_pruning.sql");
    expect(sql).toContain("create or replace function public.prune_system_logs_batch");
    expect(sql).toContain("order by created_at asc");
    expect(sql).toContain("limit v_batch");
    expect(sql).toContain("'0 4 * * *'");
    expect(sql).toContain("/api/cron/prune-system-logs");
  });
});
