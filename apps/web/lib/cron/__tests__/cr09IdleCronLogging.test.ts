import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CR-09 idle cron logging", () => {
  it("keeps cron health rows while suppressing non-SEO successful mirrors", () => {
    const systemLog = read("lib/logging/systemLog.ts");
    expect(systemLog).toContain('SEO_AUTOMATION_HISTORY_JOBS.has(params.jobName)');
    expect(systemLog).toContain('.from("cron_runs").insert');
    expect(systemLog).toContain('"gsc-sync"');
    expect(systemLog).toContain('"seo-optimization"');
  });

  it("does not persist idle WhatsApp worker success ticks", () => {
    const route = read("app/api/cron/whatsapp-worker/route.ts");
    expect(route).toContain("if (result.processed > 0 || result.failed > 0)");
    expect(route).toContain('reportOperationalIssue("error", "cron/whatsapp-worker"');
  });

  it("does not persist idle social publish or dispatch timeout ticks", () => {
    const social = read("app/api/cron/process-social-publish-jobs/route.ts");
    const dispatch = read("app/api/cron/dispatch-timeouts/route.ts");
    expect(social).toContain("const meaningfulActivity =");
    expect(dispatch).toContain("const meaningfulActivity =");
    expect(dispatch).not.toContain('message: "cron.start"');
  });
});
