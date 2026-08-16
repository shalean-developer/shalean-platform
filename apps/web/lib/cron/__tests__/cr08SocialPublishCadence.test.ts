import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "../../supabase/migrations/20260815183000_cr08_reduce_social_publish_cadence.sql"),
  "utf8",
);

describe("CR-08 social publish cadence", () => {
  it("runs social-publish-jobs every 15 minutes instead of every 5 minutes", () => {
    expect(migration).toContain("where jobname = 'social-publish-jobs'");
    expect(migration).toContain("'*/15 * * * *'");
    expect(migration).toContain("/api/cron/process-social-publish-jobs");
    expect(migration).not.toContain("'*/5 * * * *'");
  });
});
