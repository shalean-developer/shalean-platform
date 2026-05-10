import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { mapBookingRow } from "@/lib/dashboard/bookingUtils";
import type { BookingRow } from "@/lib/dashboard/types";

function baseRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "00000000-0000-4000-8000-00000000ca11",
    service: "Standard",
    date: "2026-06-15",
    time: "10:00",
    location: "1 Main Rd, City",
    total_paid_zar: 500,
    amount_paid_cents: 50_000,
    currency: "ZAR",
    status: "assigned",
    dispatch_status: null,
    payment_status: null,
    booking_snapshot: null,
    created_at: "2026-06-01T08:00:00.000Z",
    paystack_reference: "ref-canonical-test",
    cleaner_id: "cl-1",
    cleaner_response_status: "accepted",
    assigned_at: "2026-06-01T09:00:00.000Z",
    accepted_at: "2026-06-01T09:30:00.000Z",
    en_route_at: null,
    started_at: null,
    completed_at: null,
    duration_minutes: 180,
    rooms: 2,
    bathrooms: 1,
    extras: null,
    monthly_invoice_id: null,
    is_monthly_billing_booking: false,
    monthly_invoices: null,
    cleaners: null,
    total_price: 500,
    price_breakdown: null,
    pricing_version_id: null,
    payment_completed_at: "2026-06-01T08:05:00.000Z",
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

describe("customer booking canonicalLifecycle", () => {
  it("attachCanonicalCustomerBookingLifecycle keeps all prior fields and adds canonicalLifecycle", () => {
    const raw = baseRow();
    const wired = attachCanonicalCustomerBookingLifecycle(raw);
    expect(wired.id).toBe(raw.id);
    expect(wired.status).toBe(raw.status);
    expect(wired.paystack_reference).toBe(raw.paystack_reference);
    expect(wired.canonicalLifecycle).toBeDefined();
    expect(wired.canonicalLifecycle?.bookingId).toBe(raw.id);
  });

  it("canonicalLifecycle matches describeBookingOperationalState for customer viewer (parity)", () => {
    const row = attachCanonicalCustomerBookingLifecycle(
      baseRow({
        en_route_at: "2026-06-15T09:00:00.000Z",
        cleaner_response_status: "on_my_way",
      }),
    );
    const record = row as unknown as Record<string, unknown>;
    const desc = describeBookingOperationalState({ row: record, viewer: "customer" });
    const c = row.canonicalLifecycle!;
    expect(c.operationalPhase).toBe(desc.operationalPhase);
    expect(c.paymentState).toBe(desc.paymentState);
    expect(c.recurringState).toBe(desc.recurringState);
    expect(c.displayBadge).toBe(desc.displayBadge);
    expect(c.displayTone).toBe(desc.displayTone);
    expect(c.payoutState).toBe(desc.payoutState);
  });

  it("mapBookingRow preserves canonicalLifecycle on raw for dashboard cards", () => {
    const row = attachCanonicalCustomerBookingLifecycle(baseRow());
    const dash = mapBookingRow(row);
    expect(dash.raw.canonicalLifecycle?.operationalPhase).toBe(row.canonicalLifecycle?.operationalPhase);
    expect(dash.raw.id).toBe(row.id);
  });

  it("completed row: canonical phase completed and payment captured when payment_completed_at set", () => {
    const row = attachCanonicalCustomerBookingLifecycle(
      baseRow({
        status: "completed",
        completed_at: "2026-06-15T14:00:00.000Z",
        cleaner_response_status: "completed",
        payout_status: "eligible",
      }),
    );
    const desc = describeBookingOperationalState({ row: row as unknown as Record<string, unknown>, viewer: "customer" });
    expect(row.canonicalLifecycle?.operationalPhase).toBe("completed");
    expect(row.canonicalLifecycle?.operationalPhase).toBe(desc.operationalPhase);
    expect(row.canonicalLifecycle?.paymentState).toBe("captured");
  });
});
