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
});
