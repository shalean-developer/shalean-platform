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

vi.mock("@/lib/salesDocument/recordSalesQuoteAcceptanceSnapshot", () => ({
  recordSalesQuoteAcceptanceSnapshot: vi.fn(),
}));

vi.mock("@/lib/salesDocument/salesOpportunityLifecycle", () => ({
  markQuoteOpportunityWon: vi.fn(),
}));

import { createBookingFromSalesQuoteInvoice } from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { recordSalesQuoteAcceptanceSnapshot } from "@/lib/salesDocument/recordSalesQuoteAcceptanceSnapshot";
import { convertSalesQuoteToInvoice } from "@/lib/salesDocument/salesDocumentMutations";

const QUOTE_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "22222222-2222-4222-8222-222222222222";

function adminWithExistingInvoice() {
  const makeSalesDocumentsBuilder = () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: vi.fn(),
      update: vi.fn(),
    };

    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.neq.mockReturnValue(builder);
    builder.order.mockReturnValue(builder);
    builder.limit.mockReturnValue(builder);
    builder.update.mockReturnValue(builder);
    builder.maybeSingle.mockResolvedValue({
      data: { id: INVOICE_ID, zoho_invoice_id: "zoho-existing" },
      error: null,
    });

    return builder;
  };

  return {
    rpc: vi.fn(async (name: string) => {
      if (name === "claim_sales_document_conversion") {
        return { data: [{ claimed: true, lease_until: new Date().toISOString() }], error: null };
      }
      if (name === "release_sales_document_conversion") {
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc: ${name}`);
    }),
    from: vi.fn((table: string) => {
      if (table !== "sales_documents") throw new Error(`unexpected table: ${table}`);
      return makeSalesDocumentsBuilder();
    }),
  };
}

describe("convertSalesQuoteToInvoice booking invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(recordSalesQuoteAcceptanceSnapshot).mockResolvedValue({ ok: true });
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
    expect(admin.rpc).toHaveBeenCalledWith(
      "claim_sales_document_conversion",
      expect.objectContaining({ p_invoice_id: INVOICE_ID }),
    );
    expect(admin.rpc).toHaveBeenCalledWith(
      "release_sales_document_conversion",
      expect.objectContaining({ p_invoice_id: INVOICE_ID }),
    );
  });

  it("returns success only after the existing invoice has a linked booking and wins acceptance", async () => {
    const admin = adminWithExistingInvoice();
    vi.mocked(createBookingFromSalesQuoteInvoice).mockResolvedValue({
      ok: true,
      bookingId: "33333333-3333-4333-8333-333333333333",
      alreadyExisted: true,
    });

    const result = await convertSalesQuoteToInvoice(admin as never, QUOTE_ID, null);

    expect(result).toEqual({
      ok: true,
      invoiceId: INVOICE_ID,
      acceptedNow: true,
    });
  });
});
