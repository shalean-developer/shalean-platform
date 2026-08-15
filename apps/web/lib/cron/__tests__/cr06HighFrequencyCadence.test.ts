import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "../../supabase/migrations/20260815153000_cr06_reduce_high_frequency_crons.sql",
);
const generatorPath = join(process.cwd(), "scripts/print-setup-supabase-crons.sql.mjs");

function scheduleFor(sql: string, jobName: string): string | null {
  const re = new RegExp(
    `cron\\.schedule\\(\\s*['\"]${jobName}['\"]\\s*,\\s*['\"]([^'\"]+)['\"]`,
    "m",
  );
  return sql.match(re)?.[1] ?? null;
}

function generatorScheduleFor(src: string, jobName: string): string | null {
  const re = new RegExp(
    `\\[\\s*["']${jobName}["']\\s*,\\s*["']([^"']+)["']`,
    "m",
  );
  return src.match(re)?.[1] ?? null;
}

describe("CR-06 high-frequency cron cadence", () => {
  const sql = readFileSync(migrationPath, "utf8");
  const generator = readFileSync(generatorPath, "utf8");

  it("runs dispatch-timeouts every 2 minutes, not every minute", () => {
    expect(scheduleFor(sql, "dispatch-timeouts")).toBe("*/2 * * * *");
    expect(generatorScheduleFor(generator, "dispatch-timeouts")).toBe("*/2 * * * *");
  });

  it("runs whatsapp-worker every 2 minutes, not every minute", () => {
    expect(scheduleFor(sql, "whatsapp-worker")).toBe("*/2 * * * *");
    expect(generatorScheduleFor(generator, "whatsapp-worker")).toBe("*/2 * * * *");
  });

  it("keeps CR-05 retry-failed-jobs reduction in the canonical setup generator", () => {
    expect(generatorScheduleFor(generator, "retry-failed-jobs")).toBe("*/2 * * * *");
  });

  it("keeps both canonical HTTP routes intact", () => {
    expect(sql).toContain("/api/cron/dispatch-timeouts");
    expect(sql).toContain("/api/cron/whatsapp-worker");
  });
});
