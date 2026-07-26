import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  preferredCleanerIdsFromSnapshot,
  syncPreferredCleanerRoster,
  syncPreferredCleanerRosterFromBookingRow,
} from "@/lib/booking/persistPreferredCleaners";

const LEAD = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "22222222-2222-4222-8222-222222222222";
const MEMBER_B = "33333333-3333-4333-8333-333333333333";

function makeAdmin(rpcImpl?: (args: unknown) => Promise<{ error: { message: string } | null }>) {
  const rpc = vi.fn(async (_name: string, args: unknown) => {
    if (rpcImpl) return rpcImpl(args);
    return { error: null };
  });
  return { rpc, admin: { rpc } as never };
}

describe("syncPreferredCleanerRoster (payment-already-received / monthly parity)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("one cleaner: skips booking_cleaners write (lead remains on booking row)", async () => {
    const { rpc, admin } = makeAdmin();
    const result = await syncPreferredCleanerRoster(admin, "b1", [LEAD], "admin_payment_already_received");
    expect(result).toEqual({ ok: true, kind: "skipped_single_or_empty", cleanerCount: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("two cleaners: writes lead + member roster via atomic replace", async () => {
    const { rpc, admin } = makeAdmin();
    const result = await syncPreferredCleanerRoster(
      admin,
      "b1",
      [LEAD, MEMBER_A],
      "admin_payment_already_received",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "synced") return;
    expect(result.cleanerCount).toBe(2);
    expect(result.rows).toEqual([
      {
        cleaner_id: LEAD,
        role: "lead",
        payout_weight: 1,
        lead_bonus_cents: 0,
        source: "admin_payment_already_received",
      },
      {
        cleaner_id: MEMBER_A,
        role: "member",
        payout_weight: 1,
        lead_bonus_cents: 0,
        source: "admin_payment_already_received",
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("replace_booking_cleaners_admin_atomic", {
      p_booking_id: "b1",
      p_rows: result.rows,
    });
  });

  it("three cleaners: preserves lead first and two members for assignment visibility", async () => {
    const { rpc, admin } = makeAdmin();
    const result = await syncPreferredCleanerRoster(
      admin,
      "b1",
      [LEAD, MEMBER_A, MEMBER_B],
      "admin_payment_already_received",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "synced") return;
    expect(result.cleanerCount).toBe(3);
    expect(result.rows.map((r) => [r.cleaner_id, r.role])).toEqual([
      [LEAD, "lead"],
      [MEMBER_A, "member"],
      [MEMBER_B, "member"],
    ]);
    // Downstream admin/office list surfaces read booking_cleaners; full crew must be present.
    expect(result.rows.map((r) => r.cleaner_id)).toEqual([LEAD, MEMBER_A, MEMBER_B]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("retry/idempotency: re-running replace with the same roster succeeds twice", async () => {
    const { rpc, admin } = makeAdmin();
    const first = await syncPreferredCleanerRoster(admin, "b1", [LEAD, MEMBER_A], "admin_payment_already_received");
    const second = await syncPreferredCleanerRoster(admin, "b1", [LEAD, MEMBER_A], "admin_payment_already_received");
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && first.kind === "synced" && second.ok && second.kind === "synced") {
      expect(second.rows).toEqual(first.rows);
    }
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("partial/validation failure: invalid roster UUID does not call RPC", async () => {
    const { rpc, admin } = makeAdmin();
    // Passes normalizePreferredCleanerIds but fails BOOKING_ROSTER_MEMBER_UUID_RE (bad version/variant).
    const badRosterUuid = "aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa";
    const result = await syncPreferredCleanerRoster(
      admin,
      "b1",
      [LEAD, badRosterUuid],
      "admin_payment_already_received",
    );
    expect(result).toEqual({
      ok: false,
      kind: "validation_failed",
      error: "Invalid cleanerId in members.",
      cleanerCount: 2,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("partial/rpc failure: surfaces RPC error without claiming sync", async () => {
    const { rpc, admin } = makeAdmin(async () => ({ error: { message: "roster_replace_failed" } }));
    const result = await syncPreferredCleanerRoster(
      admin,
      "b1",
      [LEAD, MEMBER_A],
      "admin_payment_already_received",
    );
    expect(result).toEqual({
      ok: false,
      kind: "rpc_failed",
      error: "roster_replace_failed",
      cleanerCount: 2,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("from booking row/snapshot: restores multi-cleaner roster after payment finalize shape", async () => {
    const { admin } = makeAdmin();
    const result = await syncPreferredCleanerRosterFromBookingRow(
      admin,
      "b1",
      {
        booking_snapshot: { selectedCleanerIds: [LEAD, MEMBER_A, MEMBER_B] },
        selected_cleaner_id: LEAD,
      },
      "checkout_preferred",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "synced") return;
    expect(result.cleanerCount).toBe(3);
    expect(preferredCleanerIdsFromSnapshot({ selectedCleanerIds: [LEAD, MEMBER_A, MEMBER_B] }, LEAD)).toEqual([
      LEAD,
      MEMBER_A,
      MEMBER_B,
    ]);
  });
});
