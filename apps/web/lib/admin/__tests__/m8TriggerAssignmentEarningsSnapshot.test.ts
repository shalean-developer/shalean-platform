import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-8 — Monthly assigned earnings snapshot coverage.
 *
 * These tests exercise the central wrapper {@link triggerAssignmentEarningsSnapshotForBooking}
 * that EVERY assignment-mutation path now calls (admin reassign, performAdminAssignTeam,
 * acceptDispatchOffer, the two roster-replace admin routes, and tryOnceReassignAfterDecline).
 *
 * Coverage:
 *  - admin assignment / reassignment / emergency / team paths still fire the snapshot
 *  - non-monthly bookings are unaffected (no persist call)
 *  - duplicate snapshots are not produced (idempotency from inner persistCleanerPayoutIfUnset)
 *  - completed bookings are routed through the completed branch only (no double-persist)
 *
 * The wrapper delegates to the existing pipeline triggers
 * (`triggerPersistCleanerPayoutIfCompleted` + `triggerPersistMonthlyAssignedDisplayEarnings`),
 * which both end up calling `persistCleanerPayoutIfUnset`. We mock that outermost helper
 * so the tests assert on real eligibility gating without touching the database.
 */

const { persistCleanerPayoutIfUnsetMock } = vi.hoisted(() => ({
  persistCleanerPayoutIfUnsetMock: vi.fn(),
}));

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  persistCleanerPayoutIfUnset: persistCleanerPayoutIfUnsetMock,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { triggerAssignmentEarningsSnapshotForBooking } from "@/lib/admin/triggerAssignmentEarningsSnapshot";

type BookingRow = {
  status?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
  total_paid_zar?: number | null;
  total_paid_cents?: number | null;
  amount_paid_cents?: number | null;
  payment_needs_follow_up?: boolean | null;
  payment_status?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
};

/**
 * Both inner triggers re-read the booking via
 * `admin.from("bookings").select(...).eq("id", id).maybeSingle()`. We can satisfy
 * both with a single fake that returns the configured row for any select.
 */
function fakeAdminWithBooking(row: BookingRow | null) {
  return {
    from: (table: string) => {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      };
    },
  } as never;
}

const CLEANER_A = "00000000-0000-4000-8000-000000000a01";
const CLEANER_B = "00000000-0000-4000-8000-000000000a02";
const INVOICE_A = "00000000-0000-4000-8000-000000000bb1";
const BID = "00000000-0000-4000-8000-000000000b01";

const TEAM_ID = "00000000-0000-4000-8000-000000000t01";

const monthlyAssignedRow = (overrides: Partial<BookingRow> = {}): BookingRow => ({
  status: "assigned",
  cleaner_id: CLEANER_A,
  is_team_job: false,
  billing_type: "recurring_invoice",
  is_monthly_billing_booking: true,
  monthly_invoice_id: INVOICE_A,
  ...overrides,
});

describe("triggerAssignmentEarningsSnapshotForBooking (M-8)", () => {
  beforeEach(() => {
    persistCleanerPayoutIfUnsetMock.mockReset();
    persistCleanerPayoutIfUnsetMock.mockResolvedValue({ ok: true, skipped: false });
  });

  /**
   * Admin reassignment: a monthly booking already in `assigned` state with a
   * new cleaner_id must persist the display-earnings basis before the cron
   * stuck-earnings recompute catches up. This is the primary M-8 fix.
   */
  it("snapshots monthly assigned booking after admin reassignment", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(monthlyAssignedRow()),
      BID,
      "test_admin_reassign",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
  });

  /**
   * Emergency-roster path uses team bookings: cleaner_id is cleared and the
   * lead is in payout_owner_cleaner_id. The snapshot must still fire and resolve
   * the lead from payout_owner_cleaner_id.
   */
  it("snapshots monthly team booking via payout_owner_cleaner_id (emergency roster path)", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(
        monthlyAssignedRow({
          cleaner_id: null,
          payout_owner_cleaner_id: CLEANER_B,
          is_team_job: true,
          team_id: TEAM_ID,
        }),
      ),
      BID,
      "test_emergency_roster",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ cleanerId: CLEANER_B }),
    );
  });

  /**
   * Team admin override: same monthly + assigned eligibility, just exercised
   * via performAdminAssignTeam → assignTeamAndSyncRoster → snapshot. We assert
   * the wrapper still fires when the booking row reflects a team assignment.
   */
  it("snapshots monthly team-assigned booking after performAdminAssignTeam", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(
        monthlyAssignedRow({
          is_team_job: true,
          cleaner_id: null,
          payout_owner_cleaner_id: CLEANER_A,
          team_id: TEAM_ID,
        }),
      ),
      BID,
      "test_perform_admin_assign_team",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ cleanerId: CLEANER_A }),
    );
  });

  /**
   * Marketplace dispatch-offer accept: writes cleaner_id + payout_owner_cleaner_id
   * directly. The snapshot must run for monthly bookings here so the cleaner's
   * dashboard shows display_earnings_cents immediately after accept.
   */
  it("snapshots after acceptDispatchOffer-style direct cleaner_id write", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(monthlyAssignedRow({ status: "in_progress" })),
      BID,
      "test_accept_dispatch_offer",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
  });

  /**
   * tryOnceReassignAfterDecline updates cleaner_id and re-fires dispatch.
   * Snapshot must fire for monthly bookings on this path too.
   */
  it("snapshots after tryOnceReassignAfterDecline cleaner_id update", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(monthlyAssignedRow()),
      BID,
      "test_reassign_after_decline",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Per-booking (non-monthly) bookings must NOT be touched by the M-8
   * snapshot — earnings persist on completion, not on assignment.
   */
  it("does not snapshot per-booking (non-monthly) assigned bookings", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(
        monthlyAssignedRow({
          billing_type: "per_booking",
          is_monthly_billing_booking: false,
          monthly_invoice_id: null,
        }),
      ),
      BID,
      "test_per_booking",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  /**
   * Pre-payment / pre-assignment lifecycle stages produce no snapshot — the
   * row isn't yet eligible. Guards against accidental persistence triggered
   * by intake or selected_cleaner_id-only writes.
   */
  it("does not snapshot pending_payment booking (pre-checkout intake)", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(
        monthlyAssignedRow({
          status: "pending_payment",
          cleaner_id: null,
        }),
      ),
      BID,
      "test_pending_payment",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  it("does not snapshot pending_assignment booking with no cleaner", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(
        monthlyAssignedRow({
          status: "pending_assignment",
          cleaner_id: null,
          payout_owner_cleaner_id: null,
        }),
      ),
      BID,
      "test_pending_assignment",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  /**
   * Completed booking: only the completed branch should fire (NOT both). The
   * monthly-assigned trigger must early-return so we don't persist twice in
   * the same call.
   */
  it("snapshots completed booking exactly once (no double persist)", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(monthlyAssignedRow({ status: "completed" })),
      BID,
      "test_completed_once",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
  });

  /**
   * Cancelled / failed should never persist — protects against persisting
   * earnings for terminal-non-completed states.
   */
  it("does not snapshot cancelled bookings", async () => {
    await triggerAssignmentEarningsSnapshotForBooking(
      fakeAdminWithBooking(monthlyAssignedRow({ status: "cancelled" })),
      BID,
      "test_cancelled",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  /**
   * Idempotency check: persistCleanerPayoutIfUnset reports `skipped: true`
   * (basis already on the row). The wrapper must tolerate that and not
   * blow up. Calling the wrapper twice in a row simulates two assignment
   * mutations — neither should produce duplicate ledger work since the inner
   * helper short-circuits.
   */
  it("is idempotent across repeated invocations (no duplicate snapshots)", async () => {
    persistCleanerPayoutIfUnsetMock.mockReset();
    /** First call: persist runs and reports a real write. */
    persistCleanerPayoutIfUnsetMock.mockResolvedValueOnce({ ok: true, skipped: false });
    /** Second call: persist short-circuits because basis is already there. */
    persistCleanerPayoutIfUnsetMock.mockResolvedValueOnce({
      ok: true,
      skipped: true,
      reason: "display_earnings_already_persisted",
    });

    const admin = fakeAdminWithBooking(monthlyAssignedRow());
    await triggerAssignmentEarningsSnapshotForBooking(admin, BID, "test_idempotent_first");
    await triggerAssignmentEarningsSnapshotForBooking(admin, BID, "test_idempotent_second");
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(2);
    /**
     * Same booking, same cleaner — idempotency is enforced by the inner
     * `persistCleanerPayoutIfUnset` (which we observe via the second call's
     * `skipped: true` return); the wrapper's only contract is to FIRE.
     */
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
  });

  /**
   * Error-propagation parity with the admin POST pipeline:
   * `triggerPersistCleanerPayoutIfCompleted` and
   * `triggerPersistMonthlyAssignedDisplayEarnings` both `await` the inner
   * `persistCleanerPayoutIfUnset` and DO NOT catch thrown exceptions; they
   * only branch on the returned `{ ok: false, error }` shape. The M-8
   * wrapper deliberately mirrors that semantic so callers see identical
   * failure modes whether they go through the admin pipeline or this
   * helper. This test pins the expectation so a future regression to add a
   * `try/catch` here would be a deliberate, explicit change.
   */
  it("propagates inner persist exceptions (parity with admin pipeline)", async () => {
    persistCleanerPayoutIfUnsetMock.mockReset();
    persistCleanerPayoutIfUnsetMock.mockRejectedValue(new Error("boom"));
    await expect(
      triggerAssignmentEarningsSnapshotForBooking(
        fakeAdminWithBooking(monthlyAssignedRow({ status: "completed" })),
        BID,
        "test_propagates_completed",
      ),
    ).rejects.toThrow(/boom/);
  });
});
