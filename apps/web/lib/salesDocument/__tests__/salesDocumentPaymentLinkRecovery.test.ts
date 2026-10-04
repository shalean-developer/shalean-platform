import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-03 sales invoice payment link recovery", () => {
  it("supports unique recovery Paystack references while preserving document id parsing", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentPaystackReference.ts"),
      "utf8",
    );

    expect(src).toContain("salesDocumentPaystackRecoveryReference");
    expect(src).toContain("_bal_");
    expect(src).toContain("tail.match(/^([0-9a-f-]{36})(?:_|$)/i)");
  });

  it("creates a fresh reference when an existing payment reference has no valid link", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/initializePaystackForSalesDocument.ts"),
      "utf8",
    );

    expect(src).toContain("existingLink && !linkExpired && existingRef");
    expect(src).toContain("salesDocumentPaystackRecoveryReference(row.id, balance)");
    expect(src).toContain("amount_paid_before_cents");
  });

  it("validates checkout amount against total minus already paid", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/initializePaystackForSalesDocument.ts"),
      "utf8",
    );

    expect(src).toContain("const expectedBalance = Math.max(0, total - prevPaid)");
    expect(src).toContain("balance_state_mismatch");
    expect(src).toContain("amount: balance");
  });

  it("settles the current remaining balance cumulatively", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/applySalesDocumentPayment.ts"),
      "utf8",
    );

    expect(src).toContain("const computedBalance = Math.max(0, total - prevPaid)");
    expect(src).toContain("if (paidIn !== computedBalance)");
    expect(src).toContain("const newPaid = prevPaid + paidIn");
    expect(src).toContain("amount_paid_cents: newPaid");
    expect(src).toContain("balance_cents: newBalance");
  });

  it("records only the newly received balance in Zoho and fully settles booking only after invoice completion", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/applySalesDocumentPayment.ts"),
      "utf8",
    );

    expect(src).toContain("amountZar: paidIn / 100");
    expect(src).toContain("syncBookingPaymentFromSalesDocumentInvoice");
    expect(src).toContain("amountCents: total");
  });

  it("clears stale checkout state after full settlement and compensates dedup on write failure", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/applySalesDocumentPayment.ts"),
      "utf8",
    );

    expect(src).toContain("payment_link: null");
    expect(src).toContain("payment_link_expires_at: null");
    expect(src).toContain('.delete()');
    expect(src).toContain('.eq("charge_reference", ref)');
  });

  it("preserves already-paid webhook replay idempotency before balance validation", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/applySalesDocumentPayment.ts"),
      "utf8",
    );

    const paidCheck = src.indexOf('if (st === "paid")');
    const balanceCheck = src.indexOf("if (storedBalance !== computedBalance)");
    expect(paidCheck).toBeGreaterThanOrEqual(0);
    expect(balanceCheck).toBeGreaterThan(paidCheck);
  });

  it("exposes controlled Office recovery without sending customer email", () => {
    const service = readFileSync(
      join(root, "lib/salesDocument/recoverSalesDocumentPaymentLink.ts"),
      "utf8",
    );
    const route = readFileSync(
      join(root, "app/api/admin/sales-documents/[id]/recover-payment-link/route.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/[id]/page.tsx"),
      "utf8",
    );

    expect(route).toContain('"RECOVER_PAYMENT_LINK"');
    expect(service).toContain("customer_email_sent: false");
    expect(service).not.toContain("sendSalesDocument");
    expect(page).toContain("Recover payment link");
    expect(page).toContain("It does not mark the invoice paid and does not send a customer email.");
  });
});
