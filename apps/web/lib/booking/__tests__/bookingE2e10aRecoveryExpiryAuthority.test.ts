import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-10A payment recovery expiry authority", () => {
  it("48h expiry job crosses the canonical terminal boundary before expiry communication", () => {
    const src = read("lib/booking/processPaymentRecoveryJob.ts");
    const expirePos = src.indexOf('jobType === "booking_payment_expired"');
    const helperPos = src.indexOf("expirePendingPaymentTerminal(supabase", expirePos);
    const eligibilityPos = src.indexOf("evaluatePaymentRecoveryJobEligibility(bookingRow, jobType)", helperPos);
    const sendPos = src.indexOf("sendPaymentRecoveryEmail", eligibilityPos);
    expect(expirePos).toBeGreaterThanOrEqual(0);
    expect(helperPos).toBeGreaterThan(expirePos);
    expect(eligibilityPos).toBeGreaterThan(helperPos);
    expect(sendPos).toBeGreaterThan(eligibilityPos);
  });

  it("reminder jobs remain email-only and do not own terminal expiry", () => {
    const src = read("lib/booking/processPaymentRecoveryJob.ts");
    expect(src).toContain('jobType === "booking_payment_expired"');
    expect(src).toContain('sendPaymentRecoveryEmail(jobType as PaymentRecoveryJobType, ctx)');
  });

  it("retains the customer-facing expired email after canonical expiry", () => {
    const src = read("lib/email/paymentRecoveryEmails.ts");
    expect(src).toContain("Your unpaid booking has expired");
    expect(src).toContain('case "booking_payment_expired"');
    expect(src).toContain("Book again");
  });
});
