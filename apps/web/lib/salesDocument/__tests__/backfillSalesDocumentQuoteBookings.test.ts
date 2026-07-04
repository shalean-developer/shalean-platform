import { describe, expect, it, vi, beforeEach } from "vitest";

import { backfillSalesDocumentQuoteBookings } from "@/lib/salesDocument/backfillSalesDocumentQuoteBookings";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/salesDocument/createBookingFromSalesQuoteInvoice", () => ({
  createBookingFromSalesQuoteInvoice: vi.fn(),
  syncBookingPaymentFromSalesDocumentInvoice: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

import {
  createBookingFromSalesQuoteInvoice,
  syncBookingPaymentFromSalesDocumentInvoice,
} from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";

function mockAdmin(invoices: Array<Record<string, unknown>>, existingBookingId: string | null = null) {
  let bookingsCall = 0;
  const listChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data: invoices, error: null }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation(() => {
            bookingsCall += 1;
            return {
              maybeSingle: vi.fn().mockResolvedValue({
                data: existingBookingId ? { id: existingBookingId } : null,
                error: null,
              }),
            };
          }),
        };
      }
      return listChain;
    }),
  };
}

describe("backfillSalesDocumentQuoteBookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-run counts invoices missing bookings", async () => {
    const admin = mockAdmin([
      {
        id: INVOICE_ID,
        converted_from_id: QUOTE_ID,
        status: "sent",
        total_cents: 150000,
      },
    ]);

    const result = await backfillSalesDocumentQuoteBookings(admin as never, { apply: false });

    expect(result).toMatchObject({ scanned: 1, created: 1, failed: 0 });
    expect(createBookingFromSalesQuoteInvoice).not.toHaveBeenCalled();
  });

  it("apply creates booking for invoice without linked row", async () => {
    const admin = mockAdmin([
      {
        id: INVOICE_ID,
        converted_from_id: QUOTE_ID,
        status: "paid",
        total_cents: 150000,
      },
    ]);

    vi.mocked(createBookingFromSalesQuoteInvoice).mockResolvedValue({
      ok: true,
      bookingId: BOOKING_ID,
      alreadyExisted: false,
    });

    const result = await backfillSalesDocumentQuoteBookings(admin as never, { apply: true });

    expect(result).toMatchObject({ scanned: 1, created: 1, failed: 0, paymentSynced: 1 });
    expect(createBookingFromSalesQuoteInvoice).toHaveBeenCalledWith(admin, {
      quoteId: QUOTE_ID,
      invoiceId: INVOICE_ID,
    });
    expect(syncBookingPaymentFromSalesDocumentInvoice).toHaveBeenCalled();
  });
});
