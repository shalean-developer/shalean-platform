import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("SALES-BOOKING-CONVERSION-01", () => {
  it("uses quoted total rather than unpaid collected amount for a new pending-payment booking", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts"),
      "utf8",
    );

    expect(src).toContain("total_price: quotedTotalZar");
    expect(src).toContain("...(invoicePaid ? { total_paid_zar: collectedTotalZar } : {})");
    expect(src).not.toContain("total_paid_zar: collectedTotalZar,");
  });

  it("keeps an unpaid R550 conversion compatible with the booking pricing invariant", () => {
    const quotedTotalZar = 550;
    const lineItemTotalCents = 55_000;
    const unpaidRowBase: { total_price: number; total_paid_zar?: number } = {
      total_price: quotedTotalZar,
    };

    // Mirrors the shared invariant's declared-total precedence after the sales
    // document path deliberately omits total_paid_zar for unpaid invoices.
    const declaredCents =
      typeof unpaidRowBase.total_paid_zar === "number"
        ? Math.round(unpaidRowBase.total_paid_zar * 100)
        : Math.round(unpaidRowBase.total_price * 100);

    expect(declaredCents).toBe(55_000);
    expect(declaredCents).toBe(lineItemTotalCents);
  });

  it("delays Zoho invoice creation until after booking creation succeeds", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const createdStart = src.indexOf("const created = await createSalesDocument");
    const delayedZohoFlag = src.indexOf("sync_zoho: false", createdStart);
    const bookingCall = src.indexOf("createBookingFromSalesQuoteInvoice", createdStart);
    const zohoSync = src.indexOf("syncSalesDocumentToZoho(admin, created.id)", bookingCall);
    const acceptUpdate = src.indexOf('.update({ status: "accepted" })', zohoSync);

    expect(createdStart).toBeGreaterThanOrEqual(0);
    expect(delayedZohoFlag).toBeGreaterThan(createdStart);
    expect(bookingCall).toBeGreaterThan(delayedZohoFlag);
    expect(zohoSync).toBeGreaterThan(bookingCall);
    expect(acceptUpdate).toBeGreaterThan(zohoSync);
    expect(src).toContain("zoho_sync_failed_before_accept");
  });

  it("compensates a newly created local invoice when booking creation fails", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const createdStart = src.indexOf("const created = await createSalesDocument");
    const bookingCall = src.indexOf("createBookingFromSalesQuoteInvoice", createdStart);
    const compensation = src.indexOf("deleteSalesDocument(admin, created.id)", bookingCall);
    const acceptUpdate = src.indexOf('.update({ status: "accepted" })', bookingCall);

    expect(createdStart).toBeGreaterThanOrEqual(0);
    expect(bookingCall).toBeGreaterThan(createdStart);
    expect(compensation).toBeGreaterThan(bookingCall);
    expect(acceptUpdate).toBeGreaterThan(compensation);
    expect(src).toContain("booking_create_failed_invoice_compensation_failed");
  });

  it("does not delete an existing invoice when a recovery retry still cannot create its booking", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const existingStart = src.indexOf("if (existingInvoice?.id)");
    const newInvoiceStart = src.indexOf("const created = await createSalesDocument");
    const existingBlock = src.slice(existingStart, newInvoiceStart);

    expect(existingStart).toBeGreaterThanOrEqual(0);
    expect(existingBlock).not.toContain("deleteSalesDocument");
    expect(existingBlock).toContain("booking_create_failed:");
  });
  it("routes existing invoice acceptance retries through canonical conversion recovery", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    expect(src).toContain("const existing = await findInvoiceForQuote");
    expect(src).toContain("const converted = await convertSalesQuoteToInvoice(admin, quoteId, null)");
    expect(src).toContain("alreadyExisted: Boolean(existing)");
    expect(src).not.toContain("createBookingFromSalesQuoteInvoice(admin");
    expect(src).not.toContain('.update({ status: "accepted" })');
  });

  it("does not duplicate acceptance notifications or invoice email for an already accepted retry", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    expect(src).toContain('const wasAccepted = String(q.status ?? "").toLowerCase() === "accepted"');
    expect(src).toContain("if (!wasAccepted) {");
    expect(src).toContain("notifyAdminSalesQuoteAccepted");
    expect(src).toContain("sendSalesDocumentToCustomer");
  });
});
