import "./cr06HighFrequencyCadence.test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../supabase/migrations/20260815150000_cr05_reduce_retry_failed_jobs_cadence.sql",
);

describe("CR-05 retry-failed-jobs cadence", () => {
  it("reschedules retry-failed-jobs from minutely to every two minutes", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("where jobname = 'retry-failed-jobs'");
    expect(sql).toContain("'*/2 * * * *'");
    expect(sql).toContain("/api/cron/retry-failed-jobs");
    expect(sql).not.toContain("'retry-failed-jobs',\n    '* * * * *'");
  });
});
