import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildUnifiedInsertDurationPatch } from "@/lib/booking/createBookingUnified";
import { resolveHealedBookingDurationMinutes } from "@/lib/booking/quote/healBookingDurationForScheduling";

/**
 * Contract + unit coverage for booking duration persistence / completion heal
 * (admin monthly + unified inserts, team scaling, repair CLI).
 */
describe("booking duration persistence contracts", () => {
  const root = process.cwd();

  it("admin monthly create path inserts via insertBookingRowUnified", () => {
    const src = readFileSync(join(root, "app/api/admin/bookings/route.ts"), "utf8");
    expect(src).toContain('source: "admin_monthly"');
    expect(src).toContain("insertBookingRowUnified");
    expect(src).toContain('billing_type: "recurring_invoice"');
  });

  it("unified insert always builds and spreads a duration patch", () => {
    const src = readFileSync(join(root, "lib/booking/createBookingUnified.ts"), "utf8");
    expect(src).toContain("buildUnifiedInsertDurationPatch");
    expect(src).toContain("...durationPatch");
    expect(src).toContain("team_scaled_duration_minutes");
    expect(src).toContain("durationExtraRooms");
    expect(src).toContain("home_widget_catalog");
  });

  it("cleaner complete heals missing duration before evaluateCleanerJobCompletionGate", () => {
    const src = readFileSync(join(root, "lib/cleaner/runCleanerBookingLifecycleAction.ts"), "utf8");
    expect(src).toContain('import { healBookingDurationForScheduling }');
    const healIdx = src.indexOf("healBookingDurationForScheduling(admin");
    const gateIdx = src.indexOf("evaluateCleanerJobCompletionGate(bRow)");
    expect(healIdx).toBeGreaterThan(0);
    expect(gateIdx).toBeGreaterThan(healIdx);
  });

  it("repair script npm entry supports dry-run and single-booking flags", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["repair:missing-booking-duration"]).toContain(
      "repairMissingBookingDuration.ts",
    );

    const script = readFileSync(join(root, "scripts/repairMissingBookingDuration.ts"), "utf8");
    expect(script).toContain('--dry-run');
    expect(script).toContain("--booking");
    expect(script).toContain("process.argv.includes(\"--dry-run\")");
    expect(script).toContain('process.argv.indexOf("--booking")');
    expect(script).toContain("healBookingDurationForScheduling");
    expect(script).toContain("resolveHealedBookingDurationMinutes");
  });

  it("unified insert derives team-scaled duration for team jobs", () => {
    const solo = buildUnifiedInsertDurationPatch({
      rowBase: {},
      rooms: 4,
      bathrooms: 3,
      extras: [],
      serviceSlugForFlat: "deep",
      dateForFlat: "2026-07-22",
      timeForFlat: "09:00",
    });
    const team = buildUnifiedInsertDurationPatch({
      rowBase: { is_team_job: true, team_member_count_snapshot: 6 },
      rooms: 4,
      bathrooms: 3,
      extras: [],
      serviceSlugForFlat: "deep",
      dateForFlat: "2026-07-22",
      timeForFlat: "09:00",
    });
    expect(solo.duration_minutes).toEqual(expect.any(Number));
    expect(team.duration_minutes).toEqual(expect.any(Number));
    expect(team.duration_minutes as number).toBeLessThan(solo.duration_minutes as number);
  });

  it("heal resolver uses team-scaled minutes matching completion wall-clock intent", () => {
    const minutes = resolveHealedBookingDurationMinutes({
      id: "00000000-0000-4000-8000-00000000d001",
      duration_minutes: null,
      rooms: 4,
      bathrooms: 3,
      service_slug: "deep",
      is_team_job: true,
      team_member_count_snapshot: 6,
    });
    expect(minutes).toBe(127);
  });
});
