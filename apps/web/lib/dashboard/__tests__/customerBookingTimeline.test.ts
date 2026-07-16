import { describe, expect, it } from "vitest";
import { customerBookingTimelineForBooking } from "@/lib/dashboard/customerBookingTimeline";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";

function dashboardBooking(overrides: Partial<BookingRow> = {}): DashboardBooking {
  const raw: BookingRow = {
    id: "b1",
    service: "Standard",
    date: "2026-07-01",
    time: "09:00",
    location: "1 Main St, City",
    total_paid_zar: 400,
    amount_paid_cents: 40_000,
    currency: "ZAR",
    status: "assigned",
    booking_snapshot: null,
    created_at: "2026-06-10T10:00:00.000Z",
    paystack_reference: "ref",
    payment_completed_at: "2026-06-10T10:05:00.000Z",
    payment_status: "success",
    assigned_at: "2026-06-10T11:00:00.000Z",
    accepted_at: "2026-06-10T11:30:00.000Z",
    cleaners: { full_name: "Jane Doe", phone: null },
    ...overrides,
  };
  return {
    id: raw.id,
    serviceName: "Standard",
    date: raw.date ?? "",
    time: raw.time ?? "",
    addressLine: "1 Main St",
    suburb: "City",
    priceZar: 400,
    status: (raw.status ?? "assigned") as DashboardBooking["status"],
    durationHours: 3,
    rooms: [],
    extras: [],
    priceLines: [],
    cleaner: raw.cleaners?.full_name
      ? { name: raw.cleaners.full_name, initials: "JD", phone: undefined }
      : null,
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

describe("customerBookingTimelineForBooking", () => {
  it("returns short terminal timeline for cancelled bookings", () => {
    const steps = customerBookingTimelineForBooking(
      dashboardBooking({ status: "cancelled", payment_status: "success" }),
    );
    expect(steps.map((s) => s.label)).toEqual(["Booked", "Cancelled"]);
    expect(steps[1]?.tone).toBe("danger");
  });

  it("marks payment confirmed for pending_monthly", () => {
    const steps = customerBookingTimelineForBooking(
      dashboardBooking({ payment_status: "pending_monthly", payment_completed_at: null }),
    );
    const payment = steps.find((s) => s.label === "Payment Confirmed");
    expect(payment?.done).toBe(true);
  });

  it("progresses through fieldwork steps when cleaner is en route", () => {
    const steps = customerBookingTimelineForBooking(
      dashboardBooking({
        status: "assigned",
        en_route_at: "2026-07-01T08:00:00.000Z",
        cleaner_response_status: "on_my_way",
      }),
    );
    expect(steps.find((s) => s.label === "Cleaner En Route")?.done).toBe(true);
    expect(steps.find((s) => s.label === "Cleaning Started")?.done).toBe(false);
  });

  it("marks completed when visit is finished", () => {
    const steps = customerBookingTimelineForBooking(
      dashboardBooking({
        status: "completed",
        completed_at: "2026-07-01T12:00:00.000Z",
        started_at: "2026-07-01T09:00:00.000Z",
      }),
    );
    expect(steps.find((s) => s.label === "Completed")?.done).toBe(true);
    expect(steps.filter((s) => s.done).length).toBeGreaterThanOrEqual(6);
  });
});
