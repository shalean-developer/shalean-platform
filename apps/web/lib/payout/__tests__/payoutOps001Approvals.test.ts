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
    vi.doUnmock("@/lib/payout/claimMoneyActionProposal");
    vi.doUnmock("@/lib/payout/payoutAudit");
  });

  const rejectedProposal = {
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
    status: "rejected" as const,
    reviewed_by: "admin-b",
    reviewed_at: "2026-07-21T10:00:00.000Z",
    review_note: "incorrect rate",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };

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

  it("KI-OPS-003: first rejection creates one reject audit (transitionApplied)", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      visitEarningsRejectAuditReference: (id: string) => `vea_rejected:${id}`,
      rejectMoneyActionProposalAtomic: vi.fn(async () => ({
        ok: true,
        transitionApplied: true,
        alreadyProcessed: false,
        proposal: rejectedProposal,
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
      expect(res.transitionApplied).toBe(true);
      expect(res.alreadyProcessed).toBe(false);
    }
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "visit_earnings_adjustment_rejected",
        reference: "vea_rejected:p1",
        context: expect.objectContaining({ proposal_id: "p1", transition_applied: true }),
      }),
    );
  });

  it("KI-OPS-003: already_processed / sequential retry does not write audit", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      visitEarningsRejectAuditReference: (id: string) => `vea_rejected:${id}`,
      rejectMoneyActionProposalAtomic: vi.fn(async () => ({
        ok: true,
        transitionApplied: false,
        alreadyProcessed: true,
        proposal: {
          ...rejectedProposal,
          review_note: "original note kept",
          reviewed_by: "admin-b",
          reviewed_at: "2026-07-21T10:00:00.000Z",
        },
      })),
    }));

    const insert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: (table: string) => {
        if (table === "payout_audit_events") return { insert };
        throw new Error(`unexpected table ${table}`);
      },
    };

    const { rejectMoneyActionProposal } = await import("@/lib/payout/rejectMoneyActionProposal");
    const res = await rejectMoneyActionProposal(admin as never, {
      proposalId: "p1",
      actorUserId: "admin-c",
      reviewNote: "retry with different note",
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.alreadyProcessed).toBe(true);
      expect(res.transitionApplied).toBe(false);
    }
    expect(insert).not.toHaveBeenCalled();
  });

  it("KI-OPS-003: concurrent double reject — only winner writes audit", async () => {
    let call = 0;
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      visitEarningsRejectAuditReference: (id: string) => `vea_rejected:${id}`,
      rejectMoneyActionProposalAtomic: vi.fn(async () => {
        call += 1;
        if (call === 1) {
          return {
            ok: true,
            transitionApplied: true,
            alreadyProcessed: false,
            proposal: rejectedProposal,
          };
        }
        return {
          ok: true,
          transitionApplied: false,
          alreadyProcessed: true,
          proposal: rejectedProposal,
        };
      }),
    }));

    const insert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: (table: string) => {
        if (table === "payout_audit_events") return { insert };
        throw new Error(table);
      },
    };

    const { rejectMoneyActionProposal } = await import("@/lib/payout/rejectMoneyActionProposal");
    const [a, b] = await Promise.all([
      rejectMoneyActionProposal(admin as never, {
        proposalId: "p1",
        actorUserId: "admin-b",
        reviewNote: "incorrect rate",
      }),
      rejectMoneyActionProposal(admin as never, {
        proposalId: "p1",
        actorUserId: "admin-b",
        reviewNote: "race note",
      }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const applied = [a, b].filter((r) => r.ok && r.transitionApplied === true);
    const idempotent = [a, b].filter((r) => r.ok && r.alreadyProcessed === true);
    expect(applied).toHaveLength(1);
    expect(idempotent).toHaveLength(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("KI-OPS-003: concurrent multi-request reject — exactly one audit", async () => {
    let winners = 0;
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      visitEarningsRejectAuditReference: (id: string) => `vea_rejected:${id}`,
      rejectMoneyActionProposalAtomic: vi.fn(async () => {
        if (winners === 0) {
          winners = 1;
          return {
            ok: true,
            transitionApplied: true,
            alreadyProcessed: false,
            proposal: rejectedProposal,
          };
        }
        return {
          ok: true,
          transitionApplied: false,
          alreadyProcessed: true,
          proposal: rejectedProposal,
        };
      }),
    }));

    const insert = vi.fn(async () => ({ error: null }));
    const admin = {
      from: (table: string) => {
        if (table === "payout_audit_events") return { insert };
        throw new Error(table);
      },
    };

    const { rejectMoneyActionProposal } = await import("@/lib/payout/rejectMoneyActionProposal");
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        rejectMoneyActionProposal(admin as never, {
          proposalId: "p1",
          actorUserId: "admin-b",
          reviewNote: `race-${i}-note`,
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.transitionApplied).length).toBe(1);
    expect(results.filter((r) => r.ok && r.alreadyProcessed).length).toBe(4);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("KI-OPS-003: unique-violation on audit insert is treated as exactly-once success", async () => {
    vi.doMock("@/lib/payout/claimMoneyActionProposal", () => ({
      visitEarningsRejectAuditReference: (id: string) => `vea_rejected:${id}`,
      rejectMoneyActionProposalAtomic: vi.fn(async () => ({
        ok: true,
        transitionApplied: true,
        alreadyProcessed: false,
        proposal: rejectedProposal,
      })),
    }));
    vi.doMock("@/lib/payout/payoutAudit", () => ({
      logPayoutAuditEvent: vi.fn(),
    }));

    const insert = vi.fn(async () => ({
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    }));
    const { logPayoutAuditEvent } = await import("@/lib/payout/payoutAudit");
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
    expect(logPayoutAuditEvent).not.toHaveBeenCalled();
  });

  it("maps reject RPC transition_applied for audit gating", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: "already_rejected",
        already_processed: true,
        transition_applied: false,
        proposal: rejectedProposal,
      },
      error: null,
    }));

    const { rejectMoneyActionProposalAtomic } = await import("@/lib/payout/claimMoneyActionProposal");
    const mapped = await rejectMoneyActionProposalAtomic(
      { rpc } as never,
      { proposalId: "p1", actorUserId: "admin-b", reviewNote: "incorrect rate" },
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.transitionApplied).toBe(false);
      expect(mapped.alreadyProcessed).toBe(true);
    }

    const rpcWin = vi.fn(async () => ({
      data: {
        ok: true,
        code: "ok",
        already_processed: false,
        transition_applied: true,
        proposal: rejectedProposal,
      },
      error: null,
    }));
    const win = await rejectMoneyActionProposalAtomic(
      { rpc: rpcWin } as never,
      { proposalId: "p1", actorUserId: "admin-b", reviewNote: "incorrect rate" },
    );
    expect(win.ok).toBe(true);
    if (win.ok) {
      expect(win.transitionApplied).toBe(true);
      expect(win.alreadyProcessed).toBe(false);
    }
  });
});

describe("PAYOUT-OPS-001 KI-OPS-003 migration contract", () => {
  it("migration returns transition_applied and unique reject audit index", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "../../supabase/migrations/20260721140000_payout_ops_001_reject_audit_idempotency.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("transition_applied");
    expect(sql).toContain("payout_audit_events_vea_rejected_ref_uidx");
    expect(sql).toContain("vea_rejected:");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reject_admin_money_action_proposal");
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
