import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14B.5 paid pre-reserved team promotion", () => {
  it("promotes only a paid pending booking whose reserved and operational team ids match", () => {
    const src = read("lib/booking/assignmentBookingStateCommands.ts");

    expect(src).toContain("promotePaidReservedTeamBookingAssignment");
    expect(src).toContain('.eq("payment_status", "success")');
    expect(src).toContain('.eq("status", "pending")');
    expect(src).toContain('.eq("team_id", params.teamId)');
    expect(src).toContain('.eq("assigned_team_id", params.teamId)');
    expect(src).toContain('.eq("is_team_job", true)');
    expect(src).toContain('.eq("payout_owner_cleaner_id", params.payoutOwnerCleanerId)');
    expect(src).toContain('.is("cleaner_id", null)');
  });

  it("writes the canonical assigned lifecycle and team lead without touching payment", () => {
    const src = read("lib/booking/assignmentBookingStateCommands.ts");

    expect(src).toContain('status: "assigned"');
    expect(src).toContain('dispatch_status: "assigned"');
    expect(src).toContain("assigned_at: params.assignedAtIso");
    expect(src).toContain('cleaner_response_status: "pending"');
    expect(src).toContain("cleaner_id: params.payoutOwnerCleanerId");
    expect(src).not.toMatch(/payment_status\s*:/);
    expect(src).not.toMatch(/amount_paid_cents\s*:/);
  });

  it("uses the guarded promotion instead of re-claiming capacity for an already reserved team", () => {
    const src = read("lib/booking/promoteV2TeamBookingAfterPayment.ts");

    expect(src).toContain("promotePaidReservedTeamBookingAssignment");
    expect(src).toContain("syncBookingCleanersForTeamBooking");
    expect(src).toContain("reserved_team_post_payment_promotion_noop");
    expect(src).toContain("v2_reserved_team_promoted_after_payment");
  });

  it("triggers the existing idempotent earnings snapshot after assignment convergence", () => {
    const src = read("lib/booking/promoteV2TeamBookingAfterPayment.ts");

    expect(src).toContain("triggerAssignmentEarningsSnapshotForBooking");
    expect(src).toContain("promoteV2TeamBookingAfterPayment:reserved");
    expect(src).toContain("promoteV2TeamBookingAfterPayment:fresh");
  });
});
