import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-01A conversion integrity", () => {
  it("creates the booking before marking an existing quote accepted", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const existingStart = src.indexOf("if (existingInvoice?.id)");
    const bookingCall = src.indexOf("createBookingFromSalesQuoteInvoice", existingStart);
    const acceptUpdate = src.indexOf('.update({ status: "accepted" })', existingStart);

    expect(existingStart).toBeGreaterThanOrEqual(0);
    expect(bookingCall).toBeGreaterThan(existingStart);
    expect(acceptUpdate).toBeGreaterThan(bookingCall);
    expect(src).toContain("booking_create_failed_before_accept");
    expect(src).toContain("booking_create_failed:");
  });

  it("creates the booking before accepting a newly converted quote", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const createdStart = src.indexOf("const created = await createSalesDocument");
    const bookingCall = src.indexOf("createBookingFromSalesQuoteInvoice", createdStart);
    const acceptUpdate = src.indexOf('.update({ status: "accepted" })', bookingCall);

    expect(createdStart).toBeGreaterThanOrEqual(0);
    expect(bookingCall).toBeGreaterThan(createdStart);
    expect(acceptUpdate).toBeGreaterThan(bookingCall);
  });

  it("keeps the public acceptance retry path fail-closed until booking exists", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    const existingStart = src.indexOf("if (existing)");
    const bookingCall = src.indexOf("createBookingFromSalesQuoteInvoice", existingStart);
    const acceptUpdate = src.indexOf('.update({ status: "accepted" })', existingStart);

    expect(existingStart).toBeGreaterThanOrEqual(0);
    expect(bookingCall).toBeGreaterThan(existingStart);
    expect(acceptUpdate).toBeGreaterThan(bookingCall);
    expect(src).toContain("booking_create_failed_before_accept");
  });

  it("enforces one converted invoice per quote in PostgreSQL", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001214500_quote_e2e_01a_conversion_integrity.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create unique index if not exists sales_documents_one_invoice_per_quote_idx");
    expect(sql).toContain("on public.sales_documents (converted_from_id)");
    expect(sql).toContain("where document_type = 'invoice'");
    expect(sql).toContain("and converted_from_id is not null");
  });
});
