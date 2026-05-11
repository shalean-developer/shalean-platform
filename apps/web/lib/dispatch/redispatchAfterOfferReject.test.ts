import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/dispatch/ensureBookingAssignment", () => ({
  ensureBookingAssignment: vi.fn(),
}));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";

const ensureMock = vi.mocked(ensureBookingAssignment);

function fluentBookingSelect(data: unknown) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function fluentOfferCount(count: number) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => ({ count, error: null })),
      })),
    })),
  };
}

/** update → eq → in → is → eq ×2 → select → maybeSingle */
function fluentBumpSuccess(bookingId: string) {
  const tail = {
    maybeSingle: vi.fn(async () => ({ data: { id: bookingId }, error: null })),
  };
  const chain: Record<string, () => unknown> = {};
  chain.eq = () => chain;
  chain.in = () => chain;
  chain.is = () => chain;
  chain.select = () => tail;
  return {
    update: vi.fn(() => chain),
  };
}

function fluentUpdateEqOnly() {
  return {
    update: vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    })),
  };
}

function createSupabaseForRedispatch(booking: Record<string, unknown>, pendingOfferCount = 0) {
  const bookingId = String(booking.id);
  const bump = fluentBumpSuccess(bookingId);
  const patchFallback = fluentUpdateEqOnly();
  const schedule = fluentUpdateEqOnly();

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          ...fluentBookingSelect(booking),
          update: vi.fn((patch: Record<string, unknown>) => {
            if ("payment_needs_follow_up" in patch) {
              return fluentUpdateEqOnly().update();
            }
            if ("dispatch_status" in patch && patch.dispatch_status === "searching") {
              return bump.update();
            }
            if ("assignment_type" in patch) {
              return patchFallback.update();
            }
            if ("dispatch_next_recovery_at" in patch) {
              return schedule.update();
            }
            if (patch.dispatch_status === "failed") {
              return fluentUpdateEqOnly().update();
            }
            return bump.update();
          }),
        };
      }
      if (table === "dispatch_offers") {
        return fluentOfferCount(pendingOfferCount);
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return supabase as unknown as SupabaseClient;
}

describe("maybeRedispatchPendingBookingIfOffersExhausted", () => {
  beforeEach(() => {
    vi.stubEnv("AUTO_DISPATCH_CLEANERS", "true");
    ensureMock.mockReset();
    ensureMock.mockResolvedValue({
      ok: true,
      assignmentKind: "individual",
      cleanerId: "00000000-0000-4000-8000-000000000099",
    } as never);
  });

  it("runs recovery when booking is pending_assignment (post-pay selected cleaner)", async () => {
    const bookingId = "00000000-0000-4000-8000-000000000001";
    const supabase = createSupabaseForRedispatch({
      id: bookingId,
      status: "pending_assignment",
      cleaner_id: null,
      dispatch_status: "offered",
      assignment_type: "user_selected",
      selected_cleaner_id: "00000000-0000-4000-8000-0000000000aa",
      dispatch_attempt_count: 0,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId,
      rejectedCleanerId: "00000000-0000-4000-8000-0000000000aa",
      skipBackoffScheduling: true,
    });

    expect(ensureMock).toHaveBeenCalledWith(
      supabase,
      bookingId,
      expect.objectContaining({
        source: "offer_decline_redispatch",
        smartAssign: { excludeCleanerIds: ["00000000-0000-4000-8000-0000000000aa"] },
      }),
    );
  });

  it("still handles legacy pending status", async () => {
    const bookingId = "00000000-0000-4000-8000-000000000002";
    const supabase = createSupabaseForRedispatch({
      id: bookingId,
      status: "pending",
      cleaner_id: null,
      dispatch_status: "offered",
      assignment_type: "user_selected",
      selected_cleaner_id: "00000000-0000-4000-8000-0000000000bb",
      dispatch_attempt_count: 0,
    });

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId,
      rejectedCleanerId: "00000000-0000-4000-8000-0000000000bb",
      skipBackoffScheduling: true,
    });

    expect(ensureMock).toHaveBeenCalled();
  });

  it("no-ops when a pending dispatch offer still exists", async () => {
    const bookingId = "00000000-0000-4000-8000-000000000003";
    const supabase = createSupabaseForRedispatch(
      {
        id: bookingId,
        status: "pending_assignment",
        cleaner_id: null,
        dispatch_status: "offered",
        assignment_type: "user_selected",
        selected_cleaner_id: "00000000-0000-4000-8000-0000000000cc",
        dispatch_attempt_count: 0,
      },
      1,
    );

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId,
      rejectedCleanerId: "00000000-0000-4000-8000-0000000000cc",
      skipBackoffScheduling: true,
    });

    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("flags payment_needs_follow_up when auto-assign fails", async () => {
    ensureMock.mockResolvedValue({
      ok: false,
      error: "no_candidate",
      message: "none",
    } as never);

    const bookingId = "00000000-0000-4000-8000-000000000004";
    const payFollowUp = fluentUpdateEqOnly();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            ...fluentBookingSelect({
              id: bookingId,
              status: "pending_assignment",
              cleaner_id: null,
              dispatch_status: "offered",
              assignment_type: "user_selected",
              selected_cleaner_id: "00000000-0000-4000-8000-0000000000dd",
              dispatch_attempt_count: 0,
            }),
            update: vi.fn((patch: Record<string, unknown>) => {
              if ("payment_needs_follow_up" in patch) return payFollowUp.update();
              return fluentBumpSuccess(bookingId).update();
            }),
          };
        }
        if (table === "dispatch_offers") {
          return fluentOfferCount(0);
        }
        throw new Error(`unexpected table ${table}`);
      }),
    } as unknown as SupabaseClient;

    await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
      bookingId,
      rejectedCleanerId: "00000000-0000-4000-8000-0000000000dd",
      skipBackoffScheduling: true,
    });

    expect(payFollowUp.update).toHaveBeenCalled();
  });
});
