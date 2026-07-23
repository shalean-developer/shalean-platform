import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("admin booking create payment_already_received contract", () => {
  it("POST /api/admin/bookings wires settle-before-receipt and skips Paystack", () => {
    const route = fs.readFileSync(path.resolve(__dirname, "../route.ts"), "utf8");
    expect(route).toContain('billingTypeRaw === "payment_already_received"');
    expect(route).toContain('source: "admin_payment_already_received"');
    expect(route).toContain("settleAdminBookingPaymentAlreadyReceived");
    expect(route).toContain("adm_ar_");
    expect(route).toContain('mode: "payment_already_received"');
    // Must not initialize Paystack on this branch.
    const branchStart = route.indexOf('createBillingType === "payment_already_received"');
    const monthlyStart = route.indexOf('createBillingType === "monthly"', branchStart);
    expect(branchStart).toBeGreaterThan(-1);
    expect(monthlyStart).toBeGreaterThan(branchStart);
    const branch = route.slice(branchStart, monthlyStart);
    expect(branch).not.toContain("processPaystackInitializeBody");
    expect(branch).not.toContain("finalizeAdminPaystackCheckout");
    expect(branch).not.toContain("deliverAdminPaymentLink");
    // Immediately paid path must sync booking_cleaners like monthly (not snapshot-only).
    expect(branch).toContain("syncAdminPreferredCleanerRoster");
    expect(branch).toContain('"admin_payment_already_received"');
    expect(branch).not.toContain("patchAdminPerBookingPreferredCleaners");
  });

  it("settlement helper gates receipt email on paid + zero balance", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../../../lib/admin/settleAdminBookingPaymentAlreadyReceived.ts"),
      "utf8",
    );
    expect(src).toContain('invoiceSync: "skip"');
    expect(src).toContain("syncPaidBookingSideEffects");
    expect(src).toContain("deliverPaymentAlreadyReceivedReceipt");
    expect(src).toContain("payment_already_received_invoice_sync_failed");
    expect(src).toContain("payment_confirmation_receipt");
    expect(src).toContain("receipt_email_sent: receiptEmailSent");
  });

  it("syncPaidBookingSideEffects never invents a zero Zoho balance", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../../../lib/booking/syncPaidBookingSideEffects.ts"),
      "utf8",
    );
    expect(src).toContain("isAuthoritativeZohoInvoicePaid");
    expect(src).toContain("validateAuthoritativeZohoInvoiceSettlement");
    expect(src).toContain("zoho_payment_allocation_failed");
    expect(src).toContain("zoho_invoice_read_failed");
    expect(src).toContain("zoho_invoice_amount_mismatch");
    expect(src).toContain("requireCustomerMatch: true");
    expect(src).not.toContain("payRes.ok ? 0");
    expect(src).not.toContain('reason: "payment_method_zoho"');
    expect(src).toContain("missing_zoho_invoice_identifier");
  });
});
