import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "../../supabase/migrations/20260815153000_cr06_reduce_high_frequency_crons.sql",
);

function scheduleFor(sql: string, jobName: string): string | null {
  const re = new RegExp(
    `cron\\.schedule\\(\\s*['\"]${jobName}['\"]\\s*,\\s*['\"]([^'\"]+)['\"]`,
    "m",
  );
  return sql.match(re)?.[1] ?? null;
}

describe("CR-06 high-frequency cron cadence", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("runs dispatch-timeouts every 2 minutes, not every minute", () => {
    expect(scheduleFor(sql, "dispatch-timeouts")).toBe("*/2 * * * *");
  });

  it("runs whatsapp-worker every 2 minutes, not every minute", () => {
    expect(scheduleFor(sql, "whatsapp-worker")).toBe("*/2 * * * *");
  });

  it("keeps both canonical HTTP routes intact", () => {
    expect(sql).toContain("/api/cron/dispatch-timeouts");
    expect(sql).toContain("/api/cron/whatsapp-worker");
  });
});
