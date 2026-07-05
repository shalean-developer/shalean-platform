import { beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  triggerPersistMonthlyAssignedDisplayEarnings,
  triggerPersistCleanerPayoutIfCompleted,
} from "@/lib/admin/adminBookingPostCreatePipeline";

type BookingRow = {
  status?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  is_team_job?: boolean | null;
  billing_type?: string | null;
  is_monthly_billing_booking?: boolean | null;
  monthly_invoice_id?: string | null;
};

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
const INVOICE_A = "00000000-0000-4000-8000-000000000bb1";

describe("triggerPersistMonthlyAssignedDisplayEarnings (Fix 3 — pre-completion monthly basis)", () => {
  beforeEach(() => {
    persistCleanerPayoutIfUnsetMock.mockReset();
    persistCleanerPayoutIfUnsetMock.mockResolvedValue({ ok: true, skipped: false });
  });

  const BID = "00000000-0000-4000-8000-000000000b01";

  it("calls persistCleanerPayoutIfUnset for monthly assigned booking with cleaner_id", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: CLEANER_A,
        is_team_job: false,
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: true,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
  });

  it("works for monthly assigned booking detected by monthly_invoice_id only", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: CLEANER_A,
        is_team_job: false,
        billing_type: null,
        is_monthly_billing_booking: null,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
  });

  it("snapshots assigned per-booking rows on active-on-site assignment basis", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: CLEANER_A,
        is_team_job: false,
        billing_type: "per_booking",
        is_monthly_billing_booking: false,
        monthly_invoice_id: null,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
  });

  it("no-op for completed booking (handled by triggerPersistCleanerPayoutIfCompleted)", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "completed",
        cleaner_id: CLEANER_A,
        is_team_job: false,
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: true,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  it("no-op for monthly assigned without any cleaner reference", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: null,
        payout_owner_cleaner_id: null,
        is_team_job: false,
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: true,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  it("no-op for pending status (no assignee yet)", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "pending",
        cleaner_id: null,
        is_team_job: false,
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: true,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });

  it("uses payout_owner_cleaner_id when cleaner_id missing", async () => {
    await triggerPersistMonthlyAssignedDisplayEarnings(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: null,
        payout_owner_cleaner_id: CLEANER_A,
        is_team_job: false,
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: true,
        monthly_invoice_id: INVOICE_A,
      }),
      BID,
      "test_source",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ cleanerId: CLEANER_A }),
    );
  });
});

/**
 * Regression guard: existing monthly admin_mark_completed path still triggers earnings
 * persistence via the completed branch (Fix 3 must not interfere).
 */
describe("triggerPersistCleanerPayoutIfCompleted (regression)", () => {
  beforeEach(() => {
    persistCleanerPayoutIfUnsetMock.mockReset();
    persistCleanerPayoutIfUnsetMock.mockResolvedValue({ ok: true, skipped: false });
  });

  const BID = "00000000-0000-4000-8000-000000000b01";

  it("runs persistCleanerPayoutIfUnset for completed monthly booking with cleaner", async () => {
    await triggerPersistCleanerPayoutIfCompleted(
      fakeAdminWithBooking({
        status: "completed",
        cleaner_id: CLEANER_A,
        is_team_job: false,
      }),
      BID,
      "completed_test",
    );
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledTimes(1);
    expect(persistCleanerPayoutIfUnsetMock).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BID, cleanerId: CLEANER_A }),
    );
  });

  it("skips when not completed (Fix 3 fills the gap separately)", async () => {
    await triggerPersistCleanerPayoutIfCompleted(
      fakeAdminWithBooking({
        status: "assigned",
        cleaner_id: CLEANER_A,
        is_team_job: false,
      }),
      BID,
      "assigned_test",
    );
    expect(persistCleanerPayoutIfUnsetMock).not.toHaveBeenCalled();
  });
});
