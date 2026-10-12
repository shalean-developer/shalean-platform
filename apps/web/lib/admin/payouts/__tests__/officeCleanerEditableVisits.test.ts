import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveVisitEditBlockedReason } from "@/lib/admin/payouts/officeCleanerEditableVisits";
import { perCleanerAllocationsForBooking } from "@/lib/admin/payouts/officePayoutPeriodReport";

describe("resolveVisitEditBlockedReason", () => {
  const batchStatusById = new Map<string, string>([
    ["batch-pending", "pending"],
    ["batch-frozen", "frozen"],
    ["batch-approved", "approved"],
  ]);

  it("allows unbatched eligible visits including team jobs", () => {
    expect(
      resolveVisitEditBlockedReason(
        { payout_status: "eligible", payout_paid_at: null, payout_id: null },
        batchStatusById,
      ),
    ).toBeNull();
  });

  it("allows visits in pending or frozen batches", () => {
    expect(
      resolveVisitEditBlockedReason(
        { payout_status: "eligible", payout_paid_at: null, payout_id: "batch-pending" },
        batchStatusById,
      ),
    ).toBeNull();
    expect(
      resolveVisitEditBlockedReason(
        { payout_status: "eligible", payout_paid_at: null, payout_id: "batch-frozen" },
        batchStatusById,
      ),
    ).toBeNull();
  });

  it("blocks visits in approved batches", () => {
    expect(
      resolveVisitEditBlockedReason(
        { payout_status: "eligible", payout_paid_at: null, payout_id: "batch-approved" },
        batchStatusById,
      ),
    ).toMatch(/approved or paid/i);
  });

  it("blocks paid visits", () => {
    expect(
      resolveVisitEditBlockedReason(
        { payout_status: "paid", payout_paid_at: "2026-07-01", payout_id: null },
        batchStatusById,
      ),
    ).toMatch(/already paid/i);
  });
});


describe("loadOfficeCleanerEditableVisits payout-removal metadata contract", () => {
  it("selects booking metadata before resolving per-cleaner allocations", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/admin/payouts/officeCleanerEditableVisits.ts"),
      "utf8",
    );
    expect(source).toMatch(/\.select\([\s\S]*?earnings_summary, metadata/);
    expect(source).toContain("perCleanerAllocationsForBooking(b, roster");
  });
});


describe("AUDIT-03A02-01 paired-roster drill-down convergence", () => {
  it("uses the roster member payout total instead of the booking-wide freeze", () => {
    const lead = "11111111-1111-4111-8111-111111111111";
    const member = "22222222-2222-4222-8222-222222222222";
    const allocations = perCleanerAllocationsForBooking(
      {
        earnings_summary: {
          model_version: "v3_2026_earnings_rules",
          per_cleaner_earnings: [
            {
              cleaner_id: lead,
              role: "lead",
              base_earning_cents: 26000,
              bonus_cents: 0,
              deduction_cents: 0,
              total_cents: 26000,
            },
            {
              cleaner_id: member,
              role: "member",
              base_earning_cents: 25000,
              bonus_cents: 1000,
              deduction_cents: 0,
              total_cents: 26000,
            },
          ],
        },
        cleaner_id: lead,
        payout_owner_cleaner_id: lead,
        display_earnings_cents: 26000,
        cleaner_payout_cents: 26000,
        cleaner_earnings_total_cents: 52000,
        payout_frozen_cents: 52000,
      },
      [
        { cleaner_id: lead, role: "lead" },
        { cleaner_id: member, role: "member" },
      ],
      [
        { cleaner_id: lead, payout_cents: 26000 },
        { cleaner_id: member, payout_cents: 26000 },
      ],
    );

    expect(allocations.find((row) => row.cleaner_id === member)?.cents).toBe(26000);
    expect(allocations.find((row) => row.cleaner_id === lead)?.cents).toBe(26000);
  });

  it("hydrates roster payout ids and member-specific payout fields in the editable visit loader", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/admin/payouts/officeCleanerEditableVisits.ts"),
      "utf8",
    );
    expect(source).toContain("loadRosterMemberPayoutsByBookingIds");
    expect(source).toContain("rosterPayoutsByBooking");
    expect(source).toContain("rosterPayout.base_payout_cents");
    expect(source).toContain("rosterPayout.bonus_cents");
    expect(source).toContain("...rosterPayouts");
  });
});
