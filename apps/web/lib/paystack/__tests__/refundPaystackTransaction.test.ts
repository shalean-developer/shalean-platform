import { describe, expect, it } from "vitest";

import {
  isPaystackAlreadyRefundedMessage,
  isPaystackTransactionReversedStatus,
} from "@/lib/paystack/refundPaystackTransaction";

describe("refundPaystackTransaction helpers", () => {
  it("detects Paystack already-reversed messages", () => {
    expect(isPaystackAlreadyRefundedMessage("Transaction has been fully reversed")).toBe(true);
    expect(isPaystackAlreadyRefundedMessage("Already been refunded")).toBe(true);
    expect(isPaystackAlreadyRefundedMessage("Insufficient balance")).toBe(false);
  });

  it("detects reversed transaction statuses", () => {
    expect(isPaystackTransactionReversedStatus("reversed")).toBe(true);
    expect(isPaystackTransactionReversedStatus("reversal-pending")).toBe(true);
    expect(isPaystackTransactionReversedStatus("success")).toBe(false);
  });
});
