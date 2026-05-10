import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/recurring/insertRecurringOccurrenceBooking", () => ({
  insertRecurringOccurrenceBooking: vi.fn(),
}));

vi.mock("@/lib/recurring/insertMonthlyRecurringOccurrenceBooking", () => ({
  insertMonthlyRecurringOccurrenceBooking: vi.fn(),
}));

import { insertRecurringOccurrenceBooking } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { insertMonthlyRecurringOccurrenceBooking } from "@/lib/recurring/insertMonthlyRecurringOccurrenceBooking";
import {
  generateMonthlyRecurringOccurrenceBooking,
  generateRecurringOccurrenceBooking,
} from "@/lib/booking/bookingOperations";

const admin = {} as SupabaseClient;

const baseArgs = {
  admin,
  recurring: {
    id: "rec-plan-1",
    customer_id: "cust-1",
    price: 500,
    booking_snapshot_template: {},
  },
  occurrenceDateYmd: "2026-06-15",
  customerEmail: "a@b.co",
  customerName: "Ann",
  customerPhone: "+27123456789",
} as const;

describe("generateRecurringOccurrenceBooking", () => {
  beforeEach(() => {
    vi.mocked(insertRecurringOccurrenceBooking).mockReset();
    vi.mocked(insertMonthlyRecurringOccurrenceBooking).mockReset();
  });

  it("delegates to insertRecurringOccurrenceBooking with the same params object shape", async () => {
    vi.mocked(insertRecurringOccurrenceBooking).mockResolvedValue({
      ok: true,
      bookingId: "bk1",
      paystackReference: "rec_uuid-here",
    });
    const out = await generateRecurringOccurrenceBooking(baseArgs);
    expect(insertRecurringOccurrenceBooking).toHaveBeenCalledTimes(1);
    expect(insertRecurringOccurrenceBooking).toHaveBeenCalledWith(admin, {
      recurring: baseArgs.recurring,
      occurrenceDateYmd: baseArgs.occurrenceDateYmd,
      customerEmail: baseArgs.customerEmail,
      customerName: baseArgs.customerName,
      customerPhone: baseArgs.customerPhone,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.bookingId).toBe("bk1");
    expect(out.data?.paystackReference).toBe("rec_uuid-here");
    expect(out.event?.type).toBe("booking.recurring_generated");
    expect(out.event?.metadata?.rail).toBe("per_booking_recurring");
  });

  it("maps duplicate_occurrence to BookingOperationResult code duplicate_occurrence", async () => {
    vi.mocked(insertRecurringOccurrenceBooking).mockResolvedValue({ ok: false, error: "duplicate_occurrence" });
    const out = await generateRecurringOccurrenceBooking(baseArgs);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.code).toBe("duplicate_occurrence");
    expect(out.message).toBe("duplicate_occurrence");
  });
});

describe("generateMonthlyRecurringOccurrenceBooking", () => {
  beforeEach(() => {
    vi.mocked(insertRecurringOccurrenceBooking).mockReset();
    vi.mocked(insertMonthlyRecurringOccurrenceBooking).mockReset();
  });

  it("delegates to insertMonthlyRecurringOccurrenceBooking with the same params object shape", async () => {
    vi.mocked(insertMonthlyRecurringOccurrenceBooking).mockResolvedValue({
      ok: true,
      bookingId: "bk2",
      paystackReference: "mi_bkg_uuid-here",
    });
    const out = await generateMonthlyRecurringOccurrenceBooking(baseArgs);
    expect(insertMonthlyRecurringOccurrenceBooking).toHaveBeenCalledTimes(1);
    expect(insertMonthlyRecurringOccurrenceBooking).toHaveBeenCalledWith(admin, {
      recurring: baseArgs.recurring,
      occurrenceDateYmd: baseArgs.occurrenceDateYmd,
      customerEmail: baseArgs.customerEmail,
      customerName: baseArgs.customerName,
      customerPhone: baseArgs.customerPhone,
    });
    expect(insertRecurringOccurrenceBooking).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("expected ok");
    expect(out.data?.paystackReference).toMatch(/^mi_bkg_/);
    expect(out.event?.metadata?.rail).toBe("monthly_invoice_recurring");
  });

  it("maps duplicate_occurrence for monthly delegate", async () => {
    vi.mocked(insertMonthlyRecurringOccurrenceBooking).mockResolvedValue({ ok: false, error: "duplicate_occurrence" });
    const out = await generateMonthlyRecurringOccurrenceBooking(baseArgs);
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("expected fail");
    expect(out.code).toBe("duplicate_occurrence");
  });
});
