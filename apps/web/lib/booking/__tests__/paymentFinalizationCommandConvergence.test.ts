import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bookingDir = path.resolve(__dirname, "..");
const command = path.join(bookingDir, "paymentFinalizationBookingCommands.ts");
const paystack = path.join(bookingDir, "upsertBookingFromPaystack.ts");
const manual = path.join(bookingDir, "adminMarkBookingPaid.ts");

const intentionallyUnmigrated = [
  path.join(bookingDir, "checkoutDispatchOfferFailureFallback.ts"),
  path.join(bookingDir, "adminEditBookingDetails.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../payout/backfillCompletedMissingDisplayEarnings.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("payment finalization booking command convergence (Phase 1F)", () => {
  it("owns the Paystack pending-payment finalization update shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("finalizePendingPaymentBookingFromPaystack");
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(row\)[\s\S]*?\.eq\("id",\s*existingPendingPaymentId\)[\s\S]*?\.eq\("status",\s*"pending_payment"\)[\s\S]*?\.select\("id, created_at, user_id"\)[\s\S]*?\.maybeSingle\(\)/);
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(row\)[\s\S]*?\.eq\("paystack_reference",\s*paystackReference\)[\s\S]*?\.eq\("status",\s*"pending_payment"\)[\s\S]*?\.select\("id, created_at, user_id"\)[\s\S]*?\.maybeSingle\(\)/);
  });

  it("owns the Paystack finalized booking insert shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("insertFinalizedBookingFromPaystack");
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.insert\(params\.row\)[\s\S]*?\.select\("id, created_at, user_id"\)[\s\S]*?\.maybeSingle\(\)/);
  });

  it("owns the manual mark-paid guarded update shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("markBookingPaidFromAdminSettlement");
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.is\("payment_completed_at",\s*null\)[\s\S]*?\.not\("status",\s*"eq",\s*"cancelled"\)[\s\S]*?\.not\("status",\s*"eq",\s*"failed"\)[\s\S]*?\.select\("id"\)/);
  });

  it("migrates only the safest Paystack and manual payment finalization call sites", () => {
    const paystackSrc = readFileSync(paystack, "utf8");
    const manualSrc = readFileSync(manual, "utf8");

    expect(paystackSrc).toContain("finalizePendingPaymentBookingFromPaystack");
    expect(paystackSrc).toContain("insertFinalizedBookingFromPaystack");
    expect(paystackSrc).not.toMatch(/const\s+updateBuilder\s*=/);
    expect(paystackSrc).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.insert\(row\)[\s\S]*?\.select\("id, created_at, user_id"\)/);

    expect(manualSrc).toContain("markBookingPaidFromAdminSettlement");
    expect(manualSrc).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(patch\)[\s\S]*?\.is\("payment_completed_at",\s*null\)/);
  });

  it("keeps selected-cleaner, auto-dispatch, idempotency, and metadata behavior outside the wrappers", () => {
    const commandSrc = readFileSync(command, "utf8");
    const paystackSrc = readFileSync(paystack, "utf8");
    const manualSrc = readFileSync(manual, "utf8");

    expect(commandSrc).not.toContain("resolveCheckoutCleanerSelection");
    expect(commandSrc).not.toContain("assignBestCleaner");
    expect(commandSrc).not.toContain("runAdminAssignSmart");
    expect(commandSrc).not.toContain("parseCheckoutPriceSnapshotV1FromMeta");
    expect(commandSrc).not.toContain("tryClaimNotificationDedupe");

    expect(paystackSrc).toContain("resolveCheckoutCleanerSelection");
    expect(paystackSrc).toContain("assignBestCleaner");
    expect(paystackSrc).toContain("runAdminAssignSmart");
    expect(paystackSrc).toContain("parseCheckoutPriceSnapshotV1FromMeta");
    expect(manualSrc).toContain("tryClaimNotificationDedupe");
  });

  it("leaves assignment, cleaner lifecycle, payout repair, and monthly invoice paths out of Phase 1F", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use payment finalization commands`).not.toContain(
        "paymentFinalizationBookingCommands",
      );
    }
  });
});
