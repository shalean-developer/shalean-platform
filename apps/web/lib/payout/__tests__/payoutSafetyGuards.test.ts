import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { updateCleanerPayoutAmount } from "@/lib/payout/updatePayoutAmount";
import { approveCleanerPayout } from "@/lib/payout/approvePayout";

vi.mock("@/lib/payout/payoutAudit", () => ({
  logPayoutAuditEvent: vi.fn(async () => undefined),
}));

describe("payout amount override + maker-checker", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects amount change without a reason when differing from calculated", async () => {
    const admin = {
      from() {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "p1",
                  status: "pending",
                  calculated_amount_cents: 25000,
                  total_amount_cents: 25000,
                  adjustment_note: null,
                },
                error: null,
              }),
            }),
          }),
        };
      },
    };

    const res = await updateCleanerPayoutAmount(admin as never, {
      payoutId: "p1",
      totalAmountCents: 30000,
      adjustmentNote: "",
      adjustedBy: "admin-a",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/reason/i);
  });

  it("blocks self-approve when PAYOUT_MAKER_CHECKER=true", async () => {
    vi.stubEnv("PAYOUT_MAKER_CHECKER", "true");
    const admin = {
      from(table: string) {
        if (table === "bookings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "cleaner_payouts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "p1", created_by: "admin-a", amount_adjusted_by: null },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => ({ data: [{ id: "p1" }], error: null }),
                }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    const res = await approveCleanerPayout(admin as never, { payoutId: "p1", approvedBy: "admin-a" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Maker/i);
  });
});
