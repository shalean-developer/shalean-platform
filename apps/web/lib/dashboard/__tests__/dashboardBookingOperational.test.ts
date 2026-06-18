import { describe, expect, it } from "vitest";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";
import {
  customerBookingDetailTimelineConfirmedDone,
  dashboardBookingCustomerSurface,
  describeDashboardBookingOperational,
  isDashboardBookingAuthoritativelyCompleted,
} from "@/lib/dashboard/dashboardBookingOperational";

function dashboardBooking(overrides: {
  status: BookingRow["status"];
  completed_at?: string | null;
  rawExtras?: Partial<BookingRow>;
}): DashboardBooking {
  const raw: BookingRow = {
    id: "b1",
    service: "Standard",
    date: "2026-05-10",
    time: "09:00",
    location: "1 Main St, City",
    total_paid_zar: 100,
    amount_paid_cents: 10_000,
    currency: "ZAR",
    status: overrides.status,
    booking_snapshot: null,
    created_at: "2026-05-01T10:00:00.000Z",
    paystack_reference: "ref",
    completed_at: overrides.completed_at ?? null,
    ...overrides.rawExtras,
  };
  return {
    id: raw.id,
    serviceName: "Standard",
    date: raw.date ?? "",
    time: raw.time ?? "",
    addressLine: "1 Main St",
    suburb: "City",
    priceZar: 100,
    status: (overrides.status ?? "pending") as DashboardBooking["status"],
    durationHours: 3,
    rooms: [],
    extras: [],
    priceLines: [],
    cleaner: null,
    paystackReference: raw.paystack_reference,
    createdAt: raw.created_at,
    scheduledAt: `${raw.date}T${String(raw.time).slice(0, 5)}:00.000Z`,
    raw,
    priceDisplayFromCheckout: false,
    checkoutPriceContext: null,
    cleanDetails: [],
    accessNotes: [],
    scheduleConfirmed: true,
  };
}

describe("dashboardBookingOperational", () => {
  it("detects authoritative completion from completed_at", () => {
    const b = dashboardBooking({
      status: "assigned",
      completed_at: "2026-05-08T12:00:00.000Z",
    });
    expect(isDashboardBookingAuthoritativelyCompleted(b)).toBe(true);
    expect(describeDashboardBookingOperational(b).operationalPhase).toBe("completed");
    const s = dashboardBookingCustomerSurface(b);
    expect(s.showRebook).toBe(true);
    expect(s.modifiable).toBe(false);
  });

  it("blocks customer modify when operational phase is travelling", () => {
    const b = dashboardBooking({
      status: "assigned",
      rawExtras: {
        en_route_at: "2026-05-10T08:00:00.000Z",
        cleaner_response_status: "on_my_way",
      },
    });
    expect(dashboardBookingCustomerSurface(b).modifiable).toBe(false);
  });

  it("customer detail timeline Confirmed step uses canonical phase (pending_payment vs pending)", () => {
    const unpaid = dashboardBooking({
      status: "pending",
      rawExtras: { status: "pending_payment" },
    });
    expect(customerBookingDetailTimelineConfirmedDone(unpaid)).toBe(true);

    const dispatchPending = dashboardBooking({
      status: "pending",
      rawExtras: { status: "pending", dispatch_status: "active" },
    });
    expect(customerBookingDetailTimelineConfirmedDone(dispatchPending)).toBe(false);
  });

  it("customer detail timeline Confirmed false for expired dispatch offers", () => {
    const b = dashboardBooking({
      status: "pending",
      rawExtras: { status: "pending", dispatch_status: "expired" },
    });
    expect(customerBookingDetailTimelineConfirmedDone(b)).toBe(false);
  });
});
