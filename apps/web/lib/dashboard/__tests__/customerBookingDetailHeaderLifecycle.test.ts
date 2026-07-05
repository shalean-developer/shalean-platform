import { describe, expect, it } from "vitest";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import {
  customerBookingCardOperationalDisplay,
  customerBookingDetailHeaderDataAttributes,
  customerBookingDetailOperationalPhase,
  customerBookingStatusLabel,
} from "@/lib/dashboard/customerBookingDisplay";
import { describeDashboardBookingOperational } from "@/lib/dashboard/dashboardBookingOperational";
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
    paystack_reference: "ref-detail-test",
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

function dash(raw: BookingRow): DashboardBooking {
  return mapBookingRow(raw);
}

describe("customer booking detail header lifecycle", () => {
  it("detail operational phase matches card display (canonical when parity holds)", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const b = dash(raw);
    expect(customerBookingDetailOperationalPhase(b)).toBe(customerBookingCardOperationalDisplay(b).operationalPhase);
    expect(customerBookingDetailOperationalPhase(b)).toBe(describeDashboardBookingOperational(b).operationalPhase);
  });

  it("detail header attrs use canonical-backed card fields when API canonical matches describe", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const b = dash(raw);
    const attrs = customerBookingDetailHeaderDataAttributes(b);
    expect(attrs["data-canonical-lifecycle-present"]).toBe("1");
    expect(attrs["data-canonical-parity"]).toBe("match");
    expect(attrs["data-detail-lifecycle-source"]).toBe("canonical");
    expect(attrs["data-detail-operational-phase"]).toBe(customerBookingCardOperationalDisplay(b).operationalPhase);
  });

  it("detail header falls back when canonicalLifecycle is missing", () => {
    const b = dash(baseRaw());
    const attrs = customerBookingDetailHeaderDataAttributes(b);
    expect(attrs["data-canonical-lifecycle-present"]).toBe("0");
    expect(attrs["data-detail-lifecycle-source"]).toBe("derived");
    expect(attrs["data-detail-operational-phase"]).toBe(describeDashboardBookingOperational(b).operationalPhase);
  });

  it("on canonical mismatch, detail display fields stay derived; canonical exposed only as diagnostics", () => {
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
    const b = dash(raw);
    const attrs = customerBookingDetailHeaderDataAttributes(b);
    expect(attrs["data-canonical-parity"]).toBe("mismatch");
    expect(attrs["data-canonical-operational-phase"]).toBe("completed");
    expect(attrs["data-detail-lifecycle-source"]).toBe("derived");
    expect(attrs["data-detail-operational-phase"]).not.toBe("completed");
    expect(attrs["data-detail-operational-phase"]).toBe(describeDashboardBookingOperational(b).operationalPhase);
  });

  it("visible customer status label reflects cleaner assignment", () => {
    const raw = attachCanonicalCustomerBookingLifecycle(baseRaw());
    const b = dash(raw);
    expect(customerBookingStatusLabel(b)).toBe("Cleaner assigned");
  });
});
