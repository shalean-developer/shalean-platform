import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const success = readFileSync(join(root, "app/booking/success/page.tsx"), "utf8");
const status = readFileSync(join(root, "app/api/paystack/status/route.ts"), "utf8");

describe("booking success reference-bound recovery", () => {
  it("returns a minimal paid summary only when reference and booking id match", () => {
    expect(status).toContain('searchParams.get("bookingId")');
    expect(status).toContain("requestedBookingId !== row.bookingId");
    expect(status).toContain('.eq("paystack_reference", reference)');
    expect(status).toContain("confirmation: {");
    expect(status).not.toContain("customer_email");
    expect(status).not.toContain("customer_phone");
  });

  it("recovers the persisted booking before remote Paystack verification on reload and Retry", () => {
    const recoveryCall = success.indexOf("if (await recoverPersistedPaidBooking(runId)) return true;");
    const verifyCall = success.indexOf('fetch("/api/paystack/verify"');
    expect(recoveryCall).toBeGreaterThan(-1);
    expect(verifyCall).toBeGreaterThan(recoveryCall);
    expect(success).toContain("new URLSearchParams({ reference, bookingId })");
    expect(success).toContain("summary = payload.confirmation ?? null");
    expect(success).toContain('setPhase("success")');
  });
});
