import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260816044500_cr16_batched_system_log_retention.sql"),
  "utf8",
);

const route = readFileSync(
  resolve(process.cwd(), "app/api/cron/prune-system-logs/route.ts"),
  "utf8",
);

describe("CR-16 system log retention", () => {
  it("uses bounded deletes with tiered retention", () => {
    expect(migration).toContain("limit batch_size");
    expect(migration).toContain("p_error_retention_days integer default 90");
    expect(migration).toContain("p_protected_retention_days integer default 180");
    expect(migration).toContain("'0 4 * * *'");
  });

  it("drains bounded batches rather than issuing one unbounded RPC", () => {
    expect(route).toContain("SYSTEM_LOG_PRUNE_BATCH_SIZE");
    expect(route).toContain("SYSTEM_LOG_PRUNE_MAX_BATCHES");
    expect(route).toContain("for (let i = 0; i < maxBatches; i += 1)");
    expect(route).toContain("if (batchDeleted < batchSize) break");
  });
});
