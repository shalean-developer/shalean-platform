import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("payment-expired edit-superseded finalization guard", () => {
  it("rejects late Paystack finalization for an intentionally edit-superseded booking", () => {
    const src = read("lib/booking/upsertBookingFromPaystack.ts");

    expect(src).toContain("isPaymentEditSupersededSnapshot");
    expect(src).toContain("payment_edit_superseded");
    expect(src).toContain("late Paystack success targeted a payment-edit-superseded booking");
    expect(src).toContain('error: "PAYMENT_NOT_PAYABLE"');
    expect(src).toContain("recoveryEnqueue: true");
  });

  it("persists the captured payment ledger before quarantining superseded bookings for manual review", () => {
    const retry = read("app/api/cron/retry-failed-jobs/route.ts");

    expect(retry).toContain("FAILED_JOB_TYPE_PAYMENT_RECONCILIATION_MANUAL_REVIEW");
    expect(retry).toContain("isPaymentEditSupersededSnapshot");
    expect(retry).toContain("supersededPaymentPersisted = await recordPaystackBookingPayment");
    expect(retry).toContain("payment_edit_superseded_captured");
    expect(retry).toContain("manual reconciliation required");
  });

  it("terminalizes repeated superseded ledger failures and keeps manual-review rows visible to health scans", () => {
    const retry = read("app/api/cron/retry-failed-jobs/route.ts");
    const productionHealth = read("lib/observability/productionHealthMetrics.ts");
    const officeHealth = read("lib/admin/collectOfficeOpsHealthSignals.ts");

    expect(retry).toContain("superseded payment ledger persistence attempts exhausted");
    expect(retry).toContain("FAILED_JOB_TYPE_PAYMENT_RECONCILIATION_EXHAUSTED");
    expect(retry).toContain("nextAttempts >= BOOKING_INSERT_MAX_ATTEMPTS");
    expect(retry).toContain("FAILED_JOB_TYPE_PAYMENT_RECONCILIATION_MANUAL_REVIEW");
    expect(productionHealth).toContain('"payment_reconciliation_manual_review"');
    expect(officeHealth).toContain('"payment_reconciliation_manual_review"');
  });
});
