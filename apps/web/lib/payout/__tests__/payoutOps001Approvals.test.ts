import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildEarningsAdjustProposePayload,
  parseEarningsAdjustPayload,
} from "@/lib/payout/moneyActionProposalPayload";
import { payoutMakerCheckerEnabled, allowSelfApproveMoneyAction } from "@/lib/payout/moneyActionProposalTypes";

describe("PAYOUT-OPS-001 payload parse (T18/T21 support)", () => {
  it("parses a complete earnings payload", () => {
    const parsed = parseEarningsAdjustPayload({
      payout_cents: 20000,
      bonus_cents: 0,
      cleaner_id: "a1111111-1111-4111-8111-111111111101",
      adjustment_note: "rate fix",
      edit_mode: "per_cleaner",
      original_total_cents: 15000,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload.payout_cents).toBe(20000);
    expect(parsed.payload.original_total_cents).toBe(15000);
  });

  it("rejects malformed payload (T21 malformed)", () => {
    const parsed = parseEarningsAdjustPayload({ payout_cents: -1 });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.code).toBe("malformed_payload");
  });

  it("builds propose payload with original snapshot", () => {
    const p = buildEarningsAdjustProposePayload({
      payoutCents: 17000,
      bonusCents: 0,
      cleanerId: "c1",
      adjustmentNote: null,
      editMode: "solo_owner",
      originalTotalCents: 15000,
      originalPayoutCents: 15000,
      originalBonusCents: 0,
    });
    expect(p.original_total_cents).toBe(15000);
    expect(p.snapshot_at).toBeTruthy();
  });
});

describe("PAYOUT-OPS-001 flag enforcement (T17)", () => {
  beforeEach(() => vi.unstubAllEnvs());
  afterEach(() => vi.unstubAllEnvs());

  it("reads PAYOUT_MAKER_CHECKER=true", () => {
    vi.stubEnv("PAYOUT_MAKER_CHECKER", "true");
    expect(payoutMakerCheckerEnabled()).toBe(true);
  });

  it("keeps self-approve off by default", () => {
    vi.stubEnv("PAYOUT_ALLOW_SELF_APPROVE", "");
    expect(allowSelfApproveMoneyAction()).toBe(false);
  });
});

describe("PAYOUT-OPS-001 approveMoneyActionProposal mocks", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("PAYOUT_MAKER_CHECKER", "true");
    vi.stubEnv("PAYOUT_ALLOW_SELF_APPROVE", "false");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("T03: self-approve blocked via claim code", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      claimMoneyActionProposalForApprove: vi.fn(async () => ({
        ok: false,
        error: "Maker–checker: the admin who proposed this adjustment cannot also approve it.",
        code: "maker_checker_self_approve",
      })),
    }));
    vi.doMock("@/lib/payout/adjustVisitPayoutEarnings", () => ({
      adjustVisitPayoutEarnings: vi.fn(async () => {
        throw new Error("must not apply");
      }),
    }));

    const { approveMoneyActionProposal } = await import("@/lib/payout/approveMoneyActionProposal");
    const res = await approveMoneyActionProposal({} as never, {
      proposalId: "p1",
      actorUserId: "admin-a",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("maker_checker_self_approve");
  });

  it("T18: applies stored payload amounts only (adjust called with payload cents)", async () => {
    const adjust = vi.fn(async () => ({
      ok: true as const,
      payoutId: null,
      batchTotalCents: 20000,
      mode: "solo_owner" as const,
    }));

    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      claimMoneyActionProposalForApprove: vi.fn(async () => ({
        ok: true,
        proposal: {
          id: "p1",
          action_type: "adjust_payout_earnings",
          booking_id: "b1",
          payload: {
            payout_cents: 20000,
            bonus_cents: 0,
            cleaner_id: null,
            adjustment_note: "from payload",
            edit_mode: "solo_owner",
            original_total_cents: 15000,
          },
          proposed_by: "admin-a",
          proposed_by_email: "a@test",
          status: "processing",
          reviewed_by: "admin-b",
          reviewed_at: new Date().toISOString(),
          review_note: null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      })),
    }));
    vi.doMock("@/lib/payout/adjustVisitPayoutEarnings", () => ({
      adjustVisitPayoutEarnings: adjust,
    }));

    const fromMock = vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "b1" }, error: null }),
            }),
          }),
        };
      }
      if (table === "admin_money_action_proposals") {
        return {
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
    });

    const { approveMoneyActionProposal } = await import("@/lib/payout/approveMoneyActionProposal");
    const res = await approveMoneyActionProposal({ from: fromMock } as never, {
      proposalId: "p1",
      actorUserId: "admin-b",
    });
    expect(res.ok).toBe(true);
    expect(adjust).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        bookingId: "b1",
        payoutCents: 20000,
        bonusCents: 0,
        adjustmentNote: "from payload",
        adminUserId: "admin-b",
      }),
    );
  });

  it("T09: already-approved claim returns idempotent success", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      claimMoneyActionProposalForApprove: vi.fn(async () => ({
        ok: false,
        alreadyApproved: true,
        code: "proposal_already_approved",
        error: "Proposal already approved.",
        proposal: {
          id: "p1",
          action_type: "adjust_payout_earnings",
          booking_id: "b1",
          payload: { payout_cents: 1, bonus_cents: 0, edit_mode: "solo_owner" },
          proposed_by: "admin-a",
          proposed_by_email: null,
          status: "approved",
          reviewed_by: "admin-b",
          reviewed_at: new Date().toISOString(),
          review_note: null,
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      })),
    }));
    const adjust = vi.fn();
    vi.doMock("@/lib/payout/adjustVisitPayoutEarnings", () => ({
      adjustVisitPayoutEarnings: adjust,
    }));

    const { approveMoneyActionProposal } = await import("@/lib/payout/approveMoneyActionProposal");
    const res = await approveMoneyActionProposal({} as never, {
      proposalId: "p1",
      actorUserId: "admin-b",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.alreadyProcessed).toBe(true);
    expect(adjust).not.toHaveBeenCalled();
  });
});

describe("PAYOUT-OPS-001 rejectMoneyActionProposal mocks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("T05/T07: reject requires note and does not call adjust", async () => {
    const { rejectMoneyActionProposal } = await import("@/lib/payout/rejectMoneyActionProposal");
    const res = await rejectMoneyActionProposal({} as never, {
      proposalId: "p1",
      actorUserId: "admin-b",
      reviewNote: "no",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("review_note_required");
  });

  it("T05: reject success path writes audit and skips earnings mutate", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      rejectMoneyActionProposalAtomic: vi.fn(async () => ({
        ok: true,
        proposal: {
          id: "p1",
          action_type: "adjust_payout_earnings",
          booking_id: "b1",
          payload: {
            payout_cents: 20000,
            bonus_cents: 0,
            cleaner_id: null,
            original_total_cents: 15000,
          },
          proposed_by: "admin-a",
          proposed_by_email: null,
          status: "rejected",
          reviewed_by: "admin-b",
          reviewed_at: new Date().toISOString(),
          review_note: "incorrect rate",
          created_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
      })),
    }));

    const insert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: (table: string) => {
        if (table === "payout_audit_events") return { insert };
        throw new Error(table);
      },
    };

    const { rejectMoneyActionProposal } = await import("@/lib/payout/rejectMoneyActionProposal");
    const res = await rejectMoneyActionProposal(admin as never, {
      proposalId: "p1",
      actorUserId: "admin-b",
      reviewNote: "incorrect rate",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.applied).toBe(false);
      expect(res.status).toBe("rejected");
    }
    expect(insert).toHaveBeenCalled();
  });
});

describe("PAYOUT-OPS-001 withMoneyActionMakerChecker propose duplicate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("PAYOUT_MAKER_CHECKER", "true");
    vi.resetModules();
  });

  it("T01 support: returns proposal_duplicate_pending when open proposal exists", async () => {
    const admin = {
      from: (table: string) => {
        if (table !== "admin_money_action_proposals") throw new Error(table);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () => ({
                  limit: async () => ({
                    data: [
                      {
                        id: "existing-1",
                        status: "pending",
                        payload: { cleaner_id: "c1" },
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: { message: "should not insert" } }),
            }),
          }),
        };
      },
      rpc: vi.fn(),
    };

    const { withMoneyActionMakerChecker } = await import("@/lib/payout/earningsAdjustMakerChecker");
    const res = await withMoneyActionMakerChecker(admin as never, {
      actionType: "adjust_payout_earnings",
      bookingId: "b1",
      payload: { payout_cents: 1, bonus_cents: 0, cleaner_id: "c1" },
      adminUserId: "admin-a",
      apply: async () => ({ ok: true as const }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("proposal_duplicate_pending");
      expect(res.existingProposalId).toBe("existing-1");
    }
  });
});
