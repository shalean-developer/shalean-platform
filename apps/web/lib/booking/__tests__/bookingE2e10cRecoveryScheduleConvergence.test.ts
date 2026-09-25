import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-10C recovery schedule convergence", () => {
  it("new recovery scheduling no longer creates fixed 1h/24h reminder jobs", () => {
    const reasons = read("lib/booking/paymentRecoverySkipReasons.ts");
    expect(reasons).toContain('PAYMENT_RECOVERY_JOB_TYPES: PaymentRecoveryJobType[] = ["booking_payment_expired"]');
    expect(reasons).toContain('"payment_reminder_1h"');
    expect(reasons).toContain('"payment_reminder_24h"');
  });

  it("terminal expiry communication follows payment_link_expires_at when available", () => {
    const scheduler = read("lib/booking/bookingPaymentRecoveryJobs.ts");
    expect(scheduler).toContain("paymentLinkExpiresAt?: string | null");
    expect(scheduler).toContain('jobType === "booking_payment_expired" && params.paymentLinkExpiresAt');
    const insert = read("lib/booking/insertPendingPaymentBooking.ts");
    expect(insert).toContain("paymentLinkExpiresAt,");
  });

  it("TTL-aware payment-link-reminders remains the pre-expiry reminder owner", () => {
    const reminder = read("app/api/cron/payment-link-reminders/route.ts");
    expect(reminder).toContain('eq("status", "pending_payment")');
    expect(reminder).toContain("payment_link_expires_at");
    expect(reminder).toContain("minutesLeft");
    expect(reminder).toContain("send15m");
    expect(reminder).toContain("send1h");
  });

  it("historical reminder job types remain understood by the processor", () => {
    const email = read("lib/email/paymentRecoveryEmails.ts");
    expect(email).toContain('case "payment_reminder_1h"');
    expect(email).toContain('case "payment_reminder_24h"');
  });
});
