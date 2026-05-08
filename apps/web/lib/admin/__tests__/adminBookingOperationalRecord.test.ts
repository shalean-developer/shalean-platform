import { describe, expect, it } from "vitest";
import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";
import { adminBookingsListRowToOperationalRecord } from "@/lib/admin/adminBookingOperationalRecord";
import { describeBookingOperationalState, resolveOperationalBadge } from "@/lib/booking/describeBookingOperationalState";

function baseListRow(p: Partial<AdminBookingsListRow>): AdminBookingsListRow {
  return {
    id: "00000000-0000-4000-8000-000000000099",
    customer_name: "A",
    customer_email: "a@b.c",
    service: "Clean",
    date: "2026-05-10",
    time: "09:00:00",
    location: "Cape Town",
    total_paid_zar: null,
    amount_paid_cents: null,
    status: "pending_payment",
    dispatch_status: "assigned",
    user_id: null,
    cleaner_id: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-05-01T00:00:00.000Z",
    paystack_reference: "",
    ...p,
  } as AdminBookingsListRow;
}

describe("adminBookingsListRowToOperationalRecord", () => {
  it("maps monthly customer billing to billing_type so list badge matches detail recurring semantics", () => {
    const row = baseListRow({
      is_recurring_generated: true,
      customer_billing_type: "monthly",
      cleaner_response_status: "accepted",
      accepted_at: "2026-05-02T00:00:00.000Z",
    });
    const rec = adminBookingsListRowToOperationalRecord(row);
    const op = describeBookingOperationalState({ row: rec, viewer: "admin" });
    expect(op.displayBadge).toBe("Awaiting invoice approval");
    expect(resolveOperationalBadge({ row: rec, viewer: "admin" })).toBe(op.displayBadge);
  });
});
