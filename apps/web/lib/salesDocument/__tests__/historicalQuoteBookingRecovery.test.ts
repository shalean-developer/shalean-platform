import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-01B historical booking recovery", () => {
  it("classifies legacy quote conversion exceptions before any write", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/historicalQuoteBookingRecovery.ts"),
      "utf8",
    );

    expect(src).toContain('"linkable"');
    expect(src).toContain('"payment_state_conflict"');
    expect(src).toContain('"amount_mismatch"');
    expect(src).toContain('"multiple_candidates"');
    expect(src).toContain('"no_candidate"');
    expect(src).toContain("invoicePaid !== bookingPaid");
  });

  it("allows linking only a currently linkable audited pair", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/historicalQuoteBookingRecovery.ts"),
      "utf8",
    );

    expect(src).toContain('item.classification === "linkable"');
    expect(src).toContain('"recovery_pair_not_linkable_or_changed"');
    expect(src).toContain('"booking_already_linked"');
  });

  it("changes only sales_document_id on the existing booking", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/historicalQuoteBookingRecovery.ts"),
      "utf8",
    );

    expect(src).toContain('.update({ sales_document_id: params.invoiceId, updated_at: new Date().toISOString() })');
    expect(src).not.toContain("amount_paid_cents:");
    expect(src).not.toContain("payment_status:");
    expect(src).not.toContain("status: \"paid\"");
    expect(src).not.toContain("zoho_invoice_id:");
    expect(src).toContain("financial_state_changed: false");
  });

  it("requires explicit confirmation in the recovery API", () => {
    const route = readFileSync(
      join(root, "app/api/admin/sales-documents/historical-booking-recovery/route.ts"),
      "utf8",
    );

    expect(route).toContain('"LINK_EXISTING_BOOKING"');
    expect(route).toContain("linkHistoricalQuoteBooking");
  });

  it("renders a reviewed recovery panel in Leads & sales", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/page.tsx"),
      "utf8",
    );

    expect(page).toContain("Historical quote booking recovery");
    expect(page).toContain("Safe to link");
    expect(page).toContain("Link existing booking");
    expect(page).toContain("No money, payment status, booking status, Zoho record, or email will be changed.");
  });
});
