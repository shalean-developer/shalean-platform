import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { computeMoneyActionProposalReviewability } from "@/lib/payout/moneyActionProposalReviewability";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PROPOSER = "5b03d864-1111-4111-8111-111111111101";
const OTHER_ADMIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-07-24T12:00:00.000Z");
const FUTURE = "2026-07-25T12:00:00.000Z";
const PAST = "2026-07-14T12:00:00.000Z";

describe("computeMoneyActionProposalReviewability", () => {
  it("proposer viewing unexpired pending → can_review=false, self_proposal", () => {
    const r = computeMoneyActionProposalReviewability({
      status: "pending",
      proposed_by: PROPOSER,
      expires_at: FUTURE,
      viewerUserId: PROPOSER,
      nowMs: NOW,
    });
    expect(r.can_review).toBe(false);
    expect(r.review_block_reason).toBe("self_proposal");
    expect(r.status).toBe("pending");
  });

  it("different admin viewing unexpired pending → can_review=true, reason null", () => {
    const r = computeMoneyActionProposalReviewability({
      status: "pending",
      proposed_by: PROPOSER,
      expires_at: FUTURE,
      viewerUserId: OTHER_ADMIN,
      nowMs: NOW,
    });
    expect(r.can_review).toBe(true);
    expect(r.review_block_reason).toBeNull();
    expect(r.status).toBe("pending");
  });

  it("any admin viewing overdue pending → expired status + expired reason (never self_proposal)", () => {
    for (const viewer of [PROPOSER, OTHER_ADMIN]) {
      const r = computeMoneyActionProposalReviewability({
        status: "pending",
        proposed_by: PROPOSER,
        expires_at: PAST,
        viewerUserId: viewer,
        nowMs: NOW,
      });
      expect(r.can_review).toBe(false);
      expect(r.status).toBe("expired");
      expect(r.review_block_reason).toBe("expired");
      expect(r.review_block_reason).not.toBe("self_proposal");
    }
  });

  it("persisted expired status → expired reason for any viewer", () => {
    const r = computeMoneyActionProposalReviewability({
      status: "expired",
      proposed_by: PROPOSER,
      expires_at: PAST,
      viewerUserId: OTHER_ADMIN,
      nowMs: NOW,
    });
    expect(r.can_review).toBe(false);
    expect(r.review_block_reason).toBe("expired");
  });

  it("approved/rejected/processing/failed → not_pending (not self_proposal)", () => {
    for (const status of ["approved", "rejected", "processing", "failed"] as const) {
      const r = computeMoneyActionProposalReviewability({
        status,
        proposed_by: PROPOSER,
        expires_at: FUTURE,
        viewerUserId: PROPOSER,
        nowMs: NOW,
      });
      expect(r.can_review).toBe(false);
      expect(r.review_block_reason).toBe("not_pending");
    }
  });

  it("does not infer self_proposal merely because can_review is false", () => {
    const expired = computeMoneyActionProposalReviewability({
      status: "pending",
      proposed_by: PROPOSER,
      expires_at: PAST,
      viewerUserId: OTHER_ADMIN,
      nowMs: NOW,
    });
    expect(expired.can_review).toBe(false);
    expect(expired.review_block_reason).toBe("expired");
  });
});

describe("expire_overdue_admin_money_action_proposals migration contract", () => {
  const sql = readFileSync(
    resolve(
      process.cwd(),
      "../../supabase/migrations/20260724120000_payout_ops_expire_overdue_money_action_proposals.sql",
    ),
    "utf8",
  );

  it("only updates pending AND expires_at <= now() to expired", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.expire_overdue_admin_money_action_proposals");
    expect(sql).toMatch(/WHERE\s+status\s*=\s*'pending'/);
    expect(sql).toMatch(/expires_at\s*<=\s*now\(\)/);
    expect(sql).toMatch(/SET\s+status\s*=\s*'expired'/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) TO service_role");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) FROM anon");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.expire_overdue_admin_money_action_proposals(integer) FROM authenticated");
  });

  it("does not touch payload, payout amounts, or non-pending statuses in SET clause", () => {
    const setMatches = [...sql.matchAll(/SET\s+status\s*=\s*'expired'/g)];
    expect(setMatches.length).toBeGreaterThanOrEqual(1);
    expect(sql).not.toMatch(/SET\s+payload\s*=/i);
    expect(sql).not.toMatch(/payout_cents|bonus_cents|cleaner_earnings/i);
    // Guard: CAS also requires pending + overdue on the UPDATE itself
    expect(sql).toMatch(
      /WHERE\s+p\.id\s*=\s*due\.id\s+AND\s+p\.status\s*=\s*'pending'\s+AND\s+p\.expires_at\s*<=\s*now\(\)/,
    );
  });
});

describe("expireOverdueMoneyActionProposals + listMoneyActionProposals", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls expire RPC before listing and maps review_block_reason for other admin", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, expired_count: 2, expired_ids: ["e1", "e2"] },
      error: null,
    }));

    const pendingRow = {
      id: "p-live",
      action_type: "adjust_payout_earnings",
      booking_id: "b1",
      payload: {
        payout_cents: 20000,
        bonus_cents: 0,
        cleaner_id: "c1",
        adjustment_note: null,
        edit_mode: "solo_owner",
        original_total_cents: 15000,
      },
      proposed_by: PROPOSER,
      proposed_by_email: "proposer@example.com",
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: "2026-07-24T10:00:00.000Z",
      expires_at: FUTURE,
    };

    const selectChain = {
      select: () => selectChain,
      in: () => selectChain,
      order: () => selectChain,
      range: async () => ({ data: [pendingRow], error: null, count: 1 }),
      eq: () => selectChain,
      gte: () => selectChain,
      lte: () => selectChain,
      contains: () => selectChain,
      maybeSingle: async () => ({ data: null, error: null }),
    };

    const admin = {
      rpc,
      from: (table: string) => {
        if (table === "admin_money_action_proposals") return selectChain;
        if (table === "bookings") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: "b1", date: "2026-07-20", customer_name: "Cust", service: "Standard" }],
                error: null,
              }),
            }),
          };
        }
        if (table === "cleaners") {
          return {
            select: () => ({
              in: async () => ({ data: [{ id: "c1", full_name: "Cleaner One" }], error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    const { listMoneyActionProposals } = await import("@/lib/payout/listMoneyActionProposals");
    const res = await listMoneyActionProposals(admin as never, {
      viewerUserId: OTHER_ADMIN,
      status: "pending",
    });

    expect(rpc).toHaveBeenCalledWith("expire_overdue_admin_money_action_proposals", {
      p_limit: 500,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].can_review).toBe(true);
    expect(res.items[0].review_block_reason).toBeNull();
  });

  it("proposer list item cannot review and gets self_proposal reason", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, expired_count: 0, expired_ids: [] },
      error: null,
    }));

    const pendingRow = {
      id: "p-self",
      action_type: "adjust_payout_earnings",
      booking_id: "b1",
      payload: {
        payout_cents: 20000,
        bonus_cents: 0,
        cleaner_id: null,
        adjustment_note: null,
        edit_mode: "solo_owner",
        original_total_cents: 15000,
      },
      proposed_by: PROPOSER,
      proposed_by_email: "proposer@example.com",
      status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      created_at: "2026-07-24T10:00:00.000Z",
      expires_at: FUTURE,
    };

    const selectChain: Record<string, unknown> = {};
    selectChain.select = () => selectChain;
    selectChain.in = () => selectChain;
    selectChain.order = () => selectChain;
    selectChain.range = async () => ({ data: [pendingRow], error: null, count: 1 });
    selectChain.eq = () => selectChain;

    const admin = {
      rpc,
      from: (table: string) => {
        if (table === "admin_money_action_proposals") return selectChain;
        if (table === "bookings") {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        if (table === "cleaners") {
          return {
            select: () => ({
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        throw new Error(table);
      },
    };

    const { listMoneyActionProposals } = await import("@/lib/payout/listMoneyActionProposals");
    const res = await listMoneyActionProposals(admin as never, {
      viewerUserId: PROPOSER,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].can_review).toBe(false);
    expect(res.items[0].review_block_reason).toBe("self_proposal");
  });

  it("expireOverdueMoneyActionProposals maps RPC result", async () => {
    const rpc = vi.fn(async () => ({
      data: { ok: true, expired_count: 3, expired_ids: ["a", "b", "c"] },
      error: null,
    }));
    const { expireOverdueMoneyActionProposals } = await import(
      "@/lib/payout/expireOverdueMoneyActionProposals"
    );
    const res = await expireOverdueMoneyActionProposals({ rpc } as never, { limit: 100 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.expired_count).toBe(3);
    expect(res.expired_ids).toEqual(["a", "b", "c"]);
    expect(rpc).toHaveBeenCalledWith("expire_overdue_admin_money_action_proposals", { p_limit: 100 });
  });
});

describe("OfficePayoutApprovalsClient review messages", () => {
  it("renders expired message from review_block_reason, not can_review alone", async () => {
    const src = readFileSync(
      resolve(
        process.cwd(),
        "app/(ui-redesign)/office/payouts/approvals/OfficePayoutApprovalsClient.tsx",
      ),
      "utf8",
    );
    expect(src).toContain('review_block_reason === "self_proposal"');
    expect(src).toContain('review_block_reason === "expired"');
    expect(src).toContain("This proposal expired and can no longer be reviewed.");
    expect(src).toContain("You proposed this — another admin must review.");
    // Must not show self-proposer message merely from !can_review && pending
    expect(src).not.toMatch(/!item\.can_review\s*&&\s*item\.status\s*===\s*"pending"/);
    expect(src).toContain("item.can_review && item.review_block_reason == null");
  });
});
