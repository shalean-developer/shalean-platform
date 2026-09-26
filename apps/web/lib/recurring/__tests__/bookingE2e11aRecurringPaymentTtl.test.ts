import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-11A recurring payment TTL authority", () => {
  it("does not schedule terminal recovery before a recurring payment link exists", () => {
    const insert = read("lib/recurring/insertRecurringOccurrenceBooking.ts");
    expect(insert).not.toContain("scheduleBookingPaymentRecoveryJobs");
    expect(insert).not.toContain("paymentLinkExpiresAt: null");
  });

  it("schedules terminal recovery from the actual recurring fallback link expiry", () => {
    const fallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    const expiryPos = fallback.indexOf("const expiresAt =");
    const patchPos = fallback.indexOf("payment_link_expires_at: expiresAt", expiryPos);
    const schedulePos = fallback.indexOf("scheduleBookingPaymentRecoveryJobs(admin", patchPos);
    expect(expiryPos).toBeGreaterThanOrEqual(0);
    expect(patchPos).toBeGreaterThan(expiryPos);
    expect(schedulePos).toBeGreaterThan(patchPos);
    expect(fallback.slice(schedulePos, schedulePos + 400)).toContain("paymentLinkExpiresAt: expiresAt");
  });

  it("keeps the existing recurring fallback TTL choice unchanged in this stage", () => {
    const fallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    expect(fallback).toContain("adminPaymentLinkTtlMs()");
  });

  it("TTL-aware pre-expiry reminder owner can see recurring fallback rows", () => {
    const reminder = read("app/api/cron/payment-link-reminders/route.ts");
    expect(reminder).toContain('.eq("status", "pending_payment")');
    expect(reminder).toContain('.not("payment_link_expires_at", "is", null)');
    expect(reminder).toContain('.not("payment_link", "is", null)');
  });
});
