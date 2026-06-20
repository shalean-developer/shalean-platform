import { describe, expect, it, vi } from "vitest";
import {
  customerHasActiveRecurringPlan,
  customerHasFuturePaidBooking,
  customerUnsubscribedFromMarketing,
  evaluateRebookEligibility,
  evaluateReviewRequestLifecycleEligibility,
  evaluateStaleJob,
  isBookingUnpaidForLifecycle,
} from "@/lib/booking/lifecycleEmailGuards";
import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";

function mockSupabase(handlers: Record<string, () => unknown>) {
  return {
    from: vi.fn((table: string) => {
      const handler = handlers[table];
      if (typeof handler === "function") return handler();
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ count: 0, error: null })),
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      };
    }),
  };
}

describe("lifecycle email eligibility rules", () => {
  it("Scenario 7: reminder_24h skipped when appointment already passed", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const result = evaluateStaleJob({ jobType: "reminder_24h", appointmentStartIso: past });
    expect(result.stale).toBe(true);
    if (result.stale) expect(result.reason).toBe(LIFECYCLE_SKIP.appointmentAlreadyPassed);
  });

  it("Scenario 5: unpaid booking is detected", () => {
    expect(isBookingUnpaidForLifecycle({ status: "pending_payment" })).toBe(true);
    expect(isBookingUnpaidForLifecycle({ status: "assigned", payment_status: "success" })).toBe(false);
  });

  it("Scenario 2: recurring customer has active recurring plan", async () => {
    const supabase = mockSupabase({
      recurring_bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ count: 1, error: null })),
          })),
        })),
      }),
    });
    expect(
      await customerHasActiveRecurringPlan({
        supabase: supabase as never,
        userId: "user-1",
      }),
    ).toBe(true);
  });

  it("Scenario 2: recurring occurrence booking via recurring_id", async () => {
    const supabase = mockSupabase({});
    expect(
      await customerHasActiveRecurringPlan({
        supabase: supabase as never,
        userId: "user-1",
        recurringId: "rec-1",
      }),
    ).toBe(true);
  });

  it("Scenario 4: customer with future paid booking", async () => {
    const futureDate = new Date();
    futureDate.setUTCDate(futureDate.getUTCDate() + 5);
    const dateYmd = futureDate.toISOString().slice(0, 10);

    const supabase = mockSupabase({
      bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: "future-book",
                        status: "assigned",
                        payment_status: "success",
                        date: dateYmd,
                        booking_snapshot: { locked: { date: dateYmd, time: "10:00" } },
                      },
                    ],
                    error: null,
                  }),
                ),
              })),
            })),
          })),
        })),
      }),
      recurring_bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
      }),
      user_profiles: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { marketing_emails_unsubscribed_at: null }, error: null })),
          })),
        })),
      }),
    });

    const result = await evaluateRebookEligibility({
      supabase: supabase as never,
      userId: "user-1",
      customerEmail: "customer@example.com",
      excludeBookingId: "book-original",
    });
    expect(result).toEqual({ eligible: false, reason: LIFECYCLE_SKIP.customerHasFutureBooking });
  });

  it("Scenario 6: marketing unsubscribe blocks rebook only path", async () => {
    const supabase = mockSupabase({
      recurring_bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
      }),
      bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      }),
      user_profiles: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: { marketing_emails_unsubscribed_at: "2026-01-01T00:00:00.000Z" },
                error: null,
              }),
            ),
          })),
        })),
      }),
    });

    expect(
      await customerUnsubscribedFromMarketing({ supabase: supabase as never, userId: "user-1" }),
    ).toBe(true);

    const rebook = await evaluateRebookEligibility({
      supabase: supabase as never,
      userId: "user-1",
      customerEmail: "customer@example.com",
      excludeBookingId: "book-1",
    });
    expect(rebook).toEqual({ eligible: false, reason: LIFECYCLE_SKIP.customerUnsubscribed });
  });

  it("Scenario 1: once-off customer passes rebook eligibility when no blockers", async () => {
    const supabase = mockSupabase({
      recurring_bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ count: 0, error: null })),
          })),
        })),
      }),
      bookings: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            neq: vi.fn(() => ({
              in: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
      }),
      user_profiles: () => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: { marketing_emails_unsubscribed_at: null }, error: null })),
          })),
        })),
      }),
    });

    expect(
      await evaluateRebookEligibility({
        supabase: supabase as never,
        userId: "user-1",
        customerEmail: "customer@example.com",
        excludeBookingId: "book-1",
      }),
    ).toEqual({ eligible: true });
  });

  it("review_request maps unpaid to booking_unpaid skip reason", () => {
    const result = evaluateReviewRequestLifecycleEligibility({ status: "pending_payment" });
    expect(result).toEqual({ allowed: false, reason: LIFECYCLE_SKIP.bookingUnpaid });
  });

  it("review_request maps not completed to booking_not_completed", () => {
    const result = evaluateReviewRequestLifecycleEligibility({
      status: "assigned",
      payment_status: "success",
      cleaner_id: "cleaner-1",
    });
    expect(result).toEqual({ allowed: false, reason: LIFECYCLE_SKIP.bookingNotCompleted });
  });
});
