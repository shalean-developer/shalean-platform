import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomerBookingStatusBadge } from "@/components/dashboard/customer-booking-status-badge";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import {
  customerBookingCardOperationalDisplay,
  customerBookingStatusLabel,
} from "@/lib/dashboard/customerBookingDisplay";
import { buildDashboardLifecycleAlignmentWire } from "@/lib/booking/readModels/bookingReadModel";
import type { BookingRow, DashboardBooking } from "@/lib/dashboard/types";

function baseRaw(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "00000000-0000-4000-8000-00000000d151",
    service: "Standard",
    date: "2026-07-01",
    time: "11:00",
    location: "2 Oak Ave, City",
    total_paid_zar: 400,
    amount_paid_cents: 40_000,
    currency: "ZAR",
    status: "assigned",
    dispatch_status: null,
    payment_status: null,
    booking_snapshot: null,
    created_at: "2026-06-10T10:00:00.000Z",
    paystack_reference: "ref-ui-test",
    cleaner_id: "cl-2",
    cleaner_response_status: "accepted",
    assigned_at: "2026-06-10T11:00:00.000Z",
    accepted_at: "2026-06-10T11:30:00.000Z",
    en_route_at: null,
    started_at: null,
    completed_at: null,
    duration_minutes: 120,
    rooms: 3,
    bathrooms: 2,
    extras: null,
    monthly_invoice_id: null,
    is_monthly_billing_booking: false,
    monthly_invoices: null,
    cleaners: null,
    total_price: 400,
    price_breakdown: null,
    pricing_version_id: null,
    payment_completed_at: "2026-06-10T10:05:00.000Z",
    is_recurring_generated: false,
    billing_type: null,
    is_team_job: false,
    team_id: null,
    payout_status: "pending",
    payout_paid_at: null,
    admin_recurring_unpaid_completion_override_at: null,
    admin_recurring_unpaid_completion_override_by: null,
    ...overrides,
  };
}

function dashboardFromRaw(raw: BookingRow): DashboardBooking {
  return mapBookingRow(raw);
}

describe("customerBookingCardOperationalDisplay", () => {
  it("uses canonical lifecycle when API field matches describeDashboardBookingOperational", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const b = dashboardFromRaw(raw);
    const d = customerBookingCardOperationalDisplay(b);
    expect(d.lifecycleSource).toBe("canonical");
    expect(d.displayBadge).toBeTruthy();
    expect(d.operationalPhase).toBeTruthy();
  });

  it("falls back to derived when canonicalLifecycle is absent", () => {
    const raw = baseRaw();
    expect(raw.canonicalLifecycle).toBeUndefined();
    const b = dashboardFromRaw(raw);
    const d = customerBookingCardOperationalDisplay(b);
    expect(d.lifecycleSource).toBe("derived");
  });

  it("falls back to derived when canonical disagrees with describe (safety)", () => {
    const raw = baseRaw();
    raw.canonicalLifecycle = {
      bookingId: raw.id,
      status: String(raw.status),
      operationalPhase: "completed",
      paymentState: "captured",
      cleanerAssignmentState: "done",
      scheduleState: "scheduled",
      recurringState: "none",
      payoutState: "n_a",
      allowedActions: { accept: false, reject: false, travel: false, start: false, complete: false },
      displayBadge: "Completed",
      displayTone: "success",
      dashboardAlignment: buildDashboardLifecycleAlignmentWire(raw as unknown as Record<string, unknown>),
    };
    const b = dashboardFromRaw(raw);
    const d = customerBookingCardOperationalDisplay(b);
    expect(d.lifecycleSource).toBe("derived");
    expect(d.operationalPhase).not.toBe("completed");
  });

  it("status label reflects cleaner assignment for accepted bookings", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const b = dashboardFromRaw(raw);
    expect(customerBookingStatusLabel(b)).toBe("Cleaner assigned");
    expect(customerBookingCardOperationalDisplay(b).statusLabel).toBe("Cleaner assigned");
  });
});

describe("CustomerBookingStatusBadge", () => {
  it("renders operational displayBadge with canonical lifecycle when API matches describe", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const html = renderToStaticMarkup(createElement(CustomerBookingStatusBadge, { booking: dashboardFromRaw(raw) }));
    const d = customerBookingCardOperationalDisplay(dashboardFromRaw(raw));
    expect(html).toContain('data-lifecycle-source="canonical"');
    expect(html).toContain(d.displayBadge);
    expect(html).not.toContain(">Scheduled<");
    expect(html).toMatch(/title="[^"]*·[^"]*"/);
  });

  it("renders derived operational badge when canonical is absent", () => {
    const b = dashboardFromRaw(baseRaw());
    const d = customerBookingCardOperationalDisplay(b);
    const html = renderToStaticMarkup(createElement(CustomerBookingStatusBadge, { booking: b }));
    expect(html).toContain('data-lifecycle-source="derived"');
    expect(html).toContain(d.displayBadge);
  });
});
