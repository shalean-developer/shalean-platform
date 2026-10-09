import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("A02-03-02 historical team ledger repair governance", () => {
  it("keeps the generic booking-line backfill away from team jobs", () => {
    const src = read("scripts/backfillBookingLineItems.ts");
    expect(src).toContain('.select("id, service, rooms, bathrooms, extras, total_paid_zar, amount_paid_cents, booking_snapshot, is_team_job")');
    expect(src).toContain("raw.is_team_job === true");
  });

  it("keeps the team repair bounded, dry-run by default, and dual-gated for writes", () => {
    const src = read("scripts/repairA02A03TeamLineItems.ts");
    expect(src).toContain("TARGET_IDS");
    expect(src).toContain("d860554e-c132-477b-bf15-557fb9c88a5e");
    expect(src).toContain("f6b2316e-2518-4f43-b6e8-b050c6d07483");
    expect(src).toContain('process.env.A02_03_02_APPLY !== "YES"');
    expect(src).toContain('process.argv.includes("--apply")');
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["repair:a02-03-02-team-lines"]).toContain("--env-file=.env.local");
    expect(pkg.scripts?.["repair:a02-03-02-team-lines"]).toContain("--conditions=react-server");
    expect(src).toContain('process.argv.includes("--fixture-check")');
    expect(src).toContain("existing booking_line_items block repair");
    expect(src).toContain("team payout ledger missing");
    expect(src).toContain("historical_team_snapshot_v1");
    expect(src).toContain("rollbackInsertedRepairRows");
    expect(src).toContain("verification read failed after rollback");
    expect(src).toContain("verification failed AND rollback failed");
  });
});
