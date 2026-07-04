import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const payoutDir = path.resolve(__dirname, "..");

const command = path.join(payoutDir, "persistBookingEarningsSnapshotCommand.ts");
const core = path.join(payoutDir, "persistCleanerPayout.ts");
const backfill = path.join(payoutDir, "backfillCompletedMissingDisplayEarnings.ts");
const stuckZeroRepair = path.join(payoutDir, "repairCompletedStuckZeroDisplayFromSignals.ts");

const intentionallyUnmigrated = [
  path.resolve(__dirname, "../../dispatch/ensureBookingAssignment.ts"),
  path.resolve(__dirname, "../../dispatch/notifyCleanerAssigned.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../cleaner/scheduleStuckEarningsRecompute.ts"),
  path.resolve(__dirname, "../../admin/adminBookingPostCreatePipeline.ts"),
  path.resolve(__dirname, "../../booking/adminMarkBookingPaid.ts"),
  path.resolve(__dirname, "../../booking/adminEditBookingDetails.ts"),
  path.resolve(__dirname, "../../booking/upsertBookingFromPaystack.ts"),
  path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/route.ts"),
  path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/fix-earnings/route.ts"),
  path.resolve(__dirname, "../../../app/api/admin/bookings/[id]/reset-earnings/route.ts"),
  path.join(payoutDir, "generateWeeklyPayouts.ts"),
];

describe("booking earnings snapshot command convergence (Phase 1B)", () => {
  it("exposes a named command boundary that delegates to existing persist logic unchanged", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toMatch(/export\s+async\s+function\s+persistBookingEarningsSnapshotCommand\s*\(/);
    expect(src).toContain("persistCleanerPayoutIfUnset");
    expect(src).toMatch(/return\s+persistCleanerPayoutIfUnset\(params\)/);
    expect(src).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(/);
    expect(src).not.toMatch(/display_earnings_cents:\s*/);
    expect(src).not.toMatch(/payout_earnings_cents:\s*/);
    expect(src).not.toMatch(/earnings_model_version:\s*/);
  });

  it("migrates only the repair/backfill earnings snapshot callers selected for Phase 1B", () => {
    for (const p of [backfill, stuckZeroRepair]) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must use the Phase 1B command`).toContain(
        "persistBookingEarningsSnapshotCommand",
      );
      expect(src, `${path.basename(p)} must not call the legacy persist entrypoint directly`).not.toMatch(
        /\bpersistCleanerPayoutIfUnset\(/,
      );
    }
  });

  it("leaves lifecycle, dispatch, admin patch, and weekly payout call sites intentionally unmigrated", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} remains out of Phase 1B scope`).toMatch(/\bpersistCleanerPayoutIfUnset\(/);
      expect(src, `${path.basename(p)} must not use the Phase 1B command yet`).not.toContain(
        "persistBookingEarningsSnapshotCommand",
      );
    }
  });

  it("keeps direct booking earnings column writes inside the existing core persist implementation", () => {
    const coreSrc = readFileSync(core, "utf8");
    expect(coreSrc).toMatch(/display_earnings_cents:\s*(?:earnings\.display_earnings_cents|c\.displayEarningsCents)/);
    expect(coreSrc).toMatch(/payout_earnings_cents:\s*(?:earnings\.payout_earnings_cents|c\.payoutEarningsCents)/);
    expect(coreSrc).toMatch(/internal_earnings_cents:\s*(?:earnings\.internal_earnings_cents|c\.internalEarningsCents)/);
    expect(coreSrc).toMatch(/earnings_model_version:\s*(?:earnings\.earnings_model_version|c\.earningsModelVersion)/);
    expect(coreSrc).toMatch(
      /earnings_percentage_applied:\s*(?:earnings\.earnings_percentage_applied|c\.earningsPercentageApplied)/,
    );
    expect(coreSrc).toMatch(
      /earnings_cap_cents_applied:\s*(?:earnings\.earnings_cap_cents_applied|c\.earningsCapCentsApplied)/,
    );
    expect(coreSrc).toMatch(
      /earnings_tenure_months_at_assignment:\s*(?:earnings\.earnings_tenure_months_at_assignment|c\.tenureMonths)/,
    );
  });
});
