import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260927162000_site_e2e_07_disable_unconfigured_seo_crons.sql"),
  "utf8",
);
const setupScript = readFileSync(join(process.cwd(), "scripts/print-setup-supabase-crons.sql.mjs"), "utf8");

describe("SITE-E2E-07 provider-dependent SEO cron disable", () => {
  it("disables the three failing provider-dependent SEO jobs idempotently", () => {
    expect(migration).toContain("'gsc-sync'");
    expect(migration).toContain("'seo-indexing'");
    expect(migration).toContain("'seo-competitors'");
    expect(migration).toContain("and active = true");
    expect(migration).toContain("cron.alter_job");
    expect(migration).toContain("active := false");
  });

  it("does not remove the jobs, preserving a reversible re-enable path", () => {
    expect(migration).not.toContain("cron.unschedule");
    expect(migration).not.toContain("delete from cron.job");
  });

  it("does not let the generated production cron setup re-enable gsc-sync", () => {
    expect(setupScript).not.toContain('["gsc-sync", "15 5 * * *", "/api/cron/gsc-sync"]');
    expect(setupScript).toContain("provider-dependent SEO jobs are intentionally omitted");
  });
});
