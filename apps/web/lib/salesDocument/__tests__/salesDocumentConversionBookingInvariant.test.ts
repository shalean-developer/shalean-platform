import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/salesDocument/createBookingFromSalesQuoteInvoice", () => ({
  createBookingFromSalesQuoteInvoice: vi.fn(),
}));

vi.mock("@/lib/salesDocument/ensureSalesDocumentCustomer", () => ({
  ensureSalesDocumentCustomer: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/salesDocument/syncSalesDocumentToZoho", () => ({
  syncSalesDocumentToZoho: vi.fn(),
}));

import { createBookingFromSalesQuoteInvoice } from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { convertSalesQuoteToInvoice } from "@/lib/salesDocument/salesDocumentMutations";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "22222222-2222-4222-8222-222222222222";

function adminWithExistingInvoice() {
  return {
    from: vi.fn((table: string) => {
      if (table !== "sales_documents") throw new Error(`unexpected table: ${table}`);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: INVOICE_ID }, error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    }),
  };
}

describe("convertSalesQuoteToInvoice booking invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns failure when an existing invoice cannot recover its linked booking", async () => {
    const admin = adminWithExistingInvoice();
    vi.mocked(createBookingFromSalesQuoteInvoice).mockResolvedValue({
      ok: false,
      error: "booking_insert_failed",
    });

    const result = await convertSalesQuoteToInvoice(admin as never, QUOTE_ID, null);

    expect(result).toEqual({
      ok: false,
      error: "booking_create_failed:booking_insert_failed",
    });
    expect(createBookingFromSalesQuoteInvoice).toHaveBeenCalledWith(admin, {
      quoteId: QUOTE_ID,
      invoiceId: INVOICE_ID,
    });
  });

  it("returns success only after the existing invoice has a linked booking", async () => {
    const admin = adminWithExistingInvoice();
    vi.mocked(createBookingFromSalesQuoteInvoice).mockResolvedValue({
      ok: true,
      bookingId: "33333333-3333-4333-8333-333333333333",
      alreadyExisted: true,
    });

    const result = await convertSalesQuoteToInvoice(admin as never, QUOTE_ID, null);

    expect(result).toEqual({ ok: true, invoiceId: INVOICE_ID });
  });
});
